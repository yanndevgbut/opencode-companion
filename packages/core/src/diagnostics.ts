import net from "node:net";
import type { DiagnosticCheck, DiagnosticsReport } from "@occ/schemas";
import {
  type OpenCodeInstall,
  type LoadedFile,
  type ConfigState,
  isTermux,
  type PathEnv,
  osKind,
} from "@occ/adapter";

export interface DiagnosticsContext {
  install: OpenCodeInstall;
  penv: PathEnv;
  files: LoadedFile[];
  state: ConfigState;
  port: number;
}

function checkPort(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.unref();
    s.once("error", () => resolve(false));
    s.listen(port, host, () => {
      s.close(() => resolve(true));
    });
  });
}

export async function runDiagnostics(ctx: DiagnosticsContext): Promise<DiagnosticsReport> {
  const at = new Date().toISOString();
  const checks: DiagnosticCheck[] = [];

  // 1. Binary & Version
  if (!ctx.install.installed) {
    checks.push({
      id: "bin-installed",
      group: "OpenCode Installation",
      title: "Binary Installation",
      status: "ERROR",
      detail: ctx.install.problem ?? "Executable opencode not found on PATH or OPENCODE_BIN.",
      cause: "OpenCode is not installed or its directory is not in your PATH.",
      fix: "Install OpenCode or set OPENCODE_BIN to the absolute path of the opencode binary.",
    });
  } else {
    checks.push({
      id: "bin-installed",
      group: "OpenCode Installation",
      title: "Binary Installation",
      status: "PASS",
      detail: `Found executable at ${ctx.install.binPath} (via ${ctx.install.source}).`,
    });

    if (!ctx.install.version) {
      checks.push({
        id: "bin-version",
        group: "OpenCode Installation",
        title: "Version Detection",
        status: "WARNING",
        detail: `Could not parse semantic version from: ${ctx.install.versionRaw ?? "(empty)"}`,
        cause: "opencode --version output format unrecognized.",
        fix: "Ensure you are running an official OpenCode release.",
      });
    } else {
      checks.push({
        id: "bin-version",
        group: "OpenCode Installation",
        title: "Version Check",
        status: "PASS",
        detail: `OpenCode version ${ctx.install.version} detected.`,
      });
    }
  }

  // 2. OS & Environment
  const os = osKind(ctx.penv);
  if (isTermux(ctx.penv)) {
    checks.push({
      id: "env-termux",
      group: "Operating System",
      title: "Android Termux Environment",
      status: "WARNING",
      detail: "Running inside Android Termux environment.",
      cause: "Android filesystem sandboxing and lack of native desktop browser.",
      fix: "Use 127.0.0.1 and navigate manually using Android browser if open-browser fails.",
    });
  } else {
    checks.push({
      id: "env-os",
      group: "Operating System",
      title: "Operating System",
      status: "PASS",
      detail: `Running on ${os} (${ctx.penv.platform}).`,
    });
  }

  // 3. Port check
  const portFree = await checkPort(ctx.port);
  checks.push({
    id: "net-port",
    group: "Network & Loopback",
    title: `Local Port ${ctx.port}`,
    status: portFree ? "PASS" : "WARNING",
    detail: portFree ? `Port ${ctx.port} is available on 127.0.0.1.` : `Port ${ctx.port} is occupied; companion CLI will auto-fallback to next free port.`,
    cause: portFree ? undefined : "Another service or process is using this port.",
    fix: portFree ? undefined : "Terminate the other process or pass --port <num>.",
  });

  // 4. Config Files & Permissions
  const existingFiles = ctx.files.filter((f) => f.read.exists);
  if (existingFiles.length === 0) {
    checks.push({
      id: "config-exists",
      group: "Configuration Files",
      title: "Config Existence",
      status: "WARNING",
      detail: "No opencode.json or opencode.jsonc file found.",
      cause: "Fresh installation or OpenCode not yet initialized.",
      fix: "Create a new configuration or save via Provider/Model/MCP manager in Companion.",
    });
  } else {
    checks.push({
      id: "config-exists",
      group: "Configuration Files",
      title: "Config Files Located",
      status: "PASS",
      detail: `Found ${existingFiles.length} config file(s): ${existingFiles.map((f) => f.spec.path).join(", ")}.`,
    });

    for (const f of existingFiles) {
      if (!f.read.readable) {
        checks.push({
          id: `file-read-${f.spec.id}`,
          group: "Configuration Files",
          title: `Read Permission: ${f.spec.path}`,
          status: "ERROR",
          detail: `Cannot read file: ${f.read.error ?? "EACCES"}`,
          cause: "File permissions prevent reading by current user.",
          fix: `Run chmod u+r "${f.spec.path}".`,
        });
      } else {
        checks.push({
          id: `file-read-${f.spec.id}`,
          group: "Configuration Files",
          title: `Read Permission: ${f.spec.path}`,
          status: "PASS",
          detail: `File is readable (${f.read.size} bytes).`,
        });
      }

      if (f.spec.editable) {
        if (!f.writable) {
          checks.push({
            id: `file-write-${f.spec.id}`,
            group: "Configuration Files",
            title: `Write Permission: ${f.spec.path}`,
            status: "ERROR",
            detail: "Config file or its parent directory is not writable.",
            cause: "Missing write permissions on file or enclosing folder.",
            fix: `Run chmod u+w "${f.spec.path}" or grant permissions to directory.`,
          });
        } else {
          checks.push({
            id: `file-write-${f.spec.id}`,
            group: "Configuration Files",
            title: `Write Permission: ${f.spec.path}`,
            status: "PASS",
            detail: "File and directory are writable.",
          });
        }
      }

      if (f.parse.errors.length > 0) {
        checks.push({
          id: `file-syntax-${f.spec.id}`,
          group: "Configuration Files",
          title: `JSON Syntax: ${f.spec.path}`,
          status: "ERROR",
          detail: f.parse.errors.map((e) => `Line ${e.line}:${e.column} - ${e.message}`).join("; "),
          cause: "File contains malformed JSON or JSONC.",
          fix: "Open file in Config Editor and repair JSON syntax errors.",
        });
      }
    }
  }

  // 5. Schema Validation & Issues
  const errors = ctx.state.issues.filter((i) => i.level === "error");
  const warnings = ctx.state.issues.filter((i) => i.level === "warning");

  if (errors.length > 0) {
    checks.push({
      id: "schema-errors",
      group: "Configuration Structure",
      title: "Config Schema Errors",
      status: "ERROR",
      detail: `${errors.length} fatal error(s) in configuration: ${errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      cause: "Settings do not match OpenCode specification.",
      fix: "Fix invalid fields via Companion UI or Monaco editor.",
    });
  } else if (warnings.length > 0) {
    checks.push({
      id: "schema-warnings",
      group: "Configuration Structure",
      title: "Config Schema Warnings",
      status: "WARNING",
      detail: `${warnings.length} warning(s): ${warnings.slice(0, 3).map((w) => `${w.path}: ${w.message}`).join("; ")}`,
      cause: "Unknown or deprecated properties in config.",
      fix: "Review warnings in Config Editor.",
    });
  } else if (existingFiles.length > 0) {
    checks.push({
      id: "schema-valid",
      group: "Configuration Structure",
      title: "Schema Validation",
      status: "PASS",
      detail: "Configuration conforms to OpenCode schema specification.",
    });
  }

  // 6. Provider & Model Structure
  if (ctx.state.providers.length === 0) {
    checks.push({
      id: "providers-count",
      group: "Providers & Models",
      title: "Configured Providers",
      status: "WARNING",
      detail: "No providers configured.",
      cause: "No provider blocks present in config.",
      fix: "Add at least one provider via Provider Manager.",
    });
  } else {
    checks.push({
      id: "providers-count",
      group: "Providers & Models",
      title: "Configured Providers",
      status: "PASS",
      detail: `${ctx.state.providers.length} provider(s) and ${ctx.state.models.length} model(s) configured.`,
    });
  }

  // 7. MCP Structure
  const mcpErrors = ctx.state.mcp.filter((m) => m.issues.length > 0);
  if (mcpErrors.length > 0) {
    checks.push({
      id: "mcp-issues",
      group: "MCP Servers",
      title: "MCP Configuration Issues",
      status: "WARNING",
      detail: `${mcpErrors.length} server(s) have configuration warnings: ${mcpErrors.map((m) => `${m.name}: ${m.issues.join(", ")}`).join("; ")}`,
      cause: "Missing command, URL or mismatched enabled flags.",
      fix: "Open MCP Manager and check server settings.",
    });
  } else if (ctx.state.mcp.length > 0) {
    checks.push({
      id: "mcp-status",
      group: "MCP Servers",
      title: "MCP Servers",
      status: "PASS",
      detail: `${ctx.state.mcp.length} MCP server(s) configured without schema issues.`,
    });
  }

  // Summary counts
  const summary: Record<DiagnosticCheck["status"], number> = {
    PASS: checks.filter((c) => c.status === "PASS").length,
    WARNING: checks.filter((c) => c.status === "WARNING").length,
    ERROR: checks.filter((c) => c.status === "ERROR").length,
  };

  return {
    at,
    connectivityRun: false,
    summary,
    checks,
  };
}
