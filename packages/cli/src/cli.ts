export interface CliOptions {
  port: number;
  host: string;
  open: boolean;
  configDir?: string;
  projectDir?: string;
  token?: string;
  noAuth?: boolean;
}

export function parseArgs(args: string[]): { opts: CliOptions; showHelp: boolean; showVersion: boolean } {
  const opts: CliOptions = {
    port: parseInt(process.env.OCC_PORT || "3000", 10) || 3000,
    host: "127.0.0.1",
    open: false,
    noAuth: process.env.OCC_NO_AUTH === "1",
  };
  let showHelp = false;
  let showVersion = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      showHelp = true;
    } else if (a === "--version" || a === "-v") {
      showVersion = true;
    } else if (a === "--port" || a === "-p") {
      const val = parseInt(args[++i] || "", 10);
      if (!isNaN(val) && val > 0 && val <= 65535) opts.port = val;
    } else if (a === "--host") {
      opts.host = args[++i] || "127.0.0.1";
    } else if (a === "--open") {
      opts.open = true;
    } else if (a === "--config-dir") {
      opts.configDir = args[++i];
    } else if (a === "--project-dir") {
      opts.projectDir = args[++i];
    } else if (a === "--token") {
      opts.token = args[++i];
    } else if (a === "--no-auth") {
      opts.noAuth = true;
    }
  }

  return { opts, showHelp, showVersion };
}

export function printHelp(): void {
  console.log(`
OpenCode Companion - Local Dashboard for OpenCode Configuration

Usage:
  npx opencode-companion@latest [options]
  opencode-companion [options]

Options:
  -p, --port <number>     Preferred port (default: 3000, falls back to next free)
  --host <string>         Host interface to bind (default: 127.0.0.1)
  --open                  Automatically open dashboard in default browser
  --config-dir <path>     Explicit OpenCode config directory to manage
  --project-dir <path>    Project directory containing opencode.json
  --token <string>        Custom session token (default: auto-generated)
  --no-auth               Disable token authentication for local dev
  -h, --help              Show help information
  -v, --version           Show version information
`);
}
