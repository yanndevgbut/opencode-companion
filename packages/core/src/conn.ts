import { spawn } from "node:child_process";
import type { McpTestResult, ProviderTestResult } from "@occ/schemas";
import { hostOf, httpRequest } from "./net";
import { redactSecrets } from "./redact";
import { hasRefs, resolveRefs, type RefContext } from "./refs";

const isHttp = (u: string): boolean => /^https?:\/\//i.test(u);

export interface ProviderTestInput {
  baseURL: string | undefined;
  apiKey: string | undefined;
  headers?: Record<string, string>;
  ctx: RefContext;
  /** npm adapter name — used to decide whether `GET /models` is a meaningful probe. */
  npm?: string;
  timeoutMs?: number;
}

const OPENAI_LIKE = new Set(["@ai-sdk/openai-compatible", "@ai-sdk/openai", "@openrouter/ai-sdk-provider"]);

/**
 * Real connectivity probe. Only OpenAI-compatible endpoints expose `GET {baseURL}/models`;
 * anything else is reported as "unsupported" instead of guessing.
 */
export async function testProviderEndpoint(input: ProviderTestInput): Promise<ProviderTestResult> {
  const at = new Date().toISOString();
  const base = input.baseURL ? resolveRefs(input.baseURL, input.ctx) : { value: "", missing: [] as string[] };
  const host = base.value ? hostOf(base.value) : "(none)";
  const skipped = (message: string, kind: ProviderTestResult["kind"] = "skipped"): ProviderTestResult => ({
    at,
    ok: false,
    kind,
    host,
    credentialsSent: false,
    message,
  });
  if (!input.baseURL) return skipped("No baseURL configured. Built-in providers are reached through their SDK; nothing to probe here.", "unsupported");
  if (base.missing.length) return skipped(`baseURL references unresolved ${base.missing.join(", ")}.`);
  if (!isHttp(base.value)) return skipped("baseURL is not an http(s) URL.", "blocked");
  if (input.npm && !OPENAI_LIKE.has(input.npm)) {
    return skipped(`Provider package ${input.npm} is not known to expose an OpenAI-style /models endpoint; connectivity was not tested.`, "unsupported");
  }

  let key = "";
  const secrets: string[] = [];
  if (input.apiKey) {
    const r = resolveRefs(input.apiKey, input.ctx);
    if (r.missing.length) return skipped(`API key references unresolved ${r.missing.join(", ")}; set it and retry.`);
    key = r.value;
    if (key) secrets.push(key);
  }
  const headers: Record<string, string> = { accept: "application/json" };
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    const r = resolveRefs(v, input.ctx);
    if (r.missing.length) return skipped(`header ${k} references unresolved ${r.missing.join(", ")}.`);
    headers[k] = r.value;
    if (r.value) secrets.push(r.value);
  }
  if (key && !Object.keys(headers).some((h) => h.toLowerCase() === "authorization")) headers.authorization = `Bearer ${key}`;

  const url = `${base.value.replace(/\/+$/, "")}/models`;
  const out = await httpRequest({ url, headers, timeoutMs: input.timeoutMs ?? 8000, secrets, maxBytes: 2_000_000 });
  const credentialsSent = Object.keys(headers).some((h) => h.toLowerCase() === "authorization");
  if (out.kind === "timeout") return { at, ok: false, kind: "timeout", host, credentialsSent, latencyMs: out.latencyMs, message: `No response from ${host} within ${(input.timeoutMs ?? 8000) / 1000}s.` };
  if (out.kind === "network") return { at, ok: false, kind: "network", host, credentialsSent, latencyMs: out.latencyMs, message: `Could not reach ${host}: ${out.message}.` };
  const s = out.status;
  const common = { at, host, credentialsSent, latencyMs: out.latencyMs, httpStatus: s };
  if (s === 401 || s === 403) return { ...common, ok: false, kind: "unauthorized", message: `${host} rejected the credentials (HTTP ${s}).` };
  if (s === 404 || s === 405) return { ...common, ok: false, kind: "not-found", message: `${host} reachable but has no GET /models (HTTP ${s}); check baseURL or the provider's docs.` };
  if (s >= 300 && s < 400) return { ...common, ok: false, kind: "blocked", message: `${host} answered with a redirect (HTTP ${s}). Redirects are not followed so credentials are not forwarded.` };
  if (s < 200 || s >= 300) return { ...common, ok: false, kind: "network", message: `${host} answered HTTP ${s}.` };
  let ids: string[] | undefined;
  try {
    const j = JSON.parse(out.text) as { data?: unknown; models?: unknown };
    const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : undefined;
    if (arr) {
      ids = arr
        .map((m) => (typeof m === "string" ? m : typeof (m as { id?: unknown })?.id === "string" ? (m as { id: string }).id : typeof (m as { name?: unknown })?.name === "string" ? (m as { name: string }).name : null))
        .filter((x): x is string => Boolean(x))
        .slice(0, 5000);
    }
  } catch {
    /* non-JSON body */
  }
  if (!ids) return { ...common, ok: true, kind: "ok", message: `${host} answered HTTP ${s} but the body was not a recognisable model list; models cannot be marked as detected.` };
  return { ...common, ok: true, kind: "ok", modelIds: ids, message: `${host} lists ${ids.length} model${ids.length === 1 ? "" : "s"}.` };
}

// ---------------------------------------------------------------- MCP

interface RpcResult {
  result?: unknown;
  error?: { code: number; message: string };
}

const PROTOCOL = "2025-06-18";
const initializeBody = (id: number): string =>
  JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "opencode-companion", version: "0.1.0" } },
  });

function parseRpcBody(text: string, contentType: string | null): RpcResult | null {
  try {
    if (contentType?.includes("text/event-stream")) {
      for (const block of text.split(/\n\n/)) {
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("");
        if (data) return JSON.parse(data) as RpcResult;
      }
      return null;
    }
    return JSON.parse(text) as RpcResult;
  } catch {
    return null;
  }
}

export interface McpRemoteInput {
  url: string;
  headers?: Record<string, string>;
  ctx: RefContext;
  timeoutMs?: number;
}

export async function testMcpRemote(input: McpRemoteInput): Promise<McpTestResult> {
  const at = new Date().toISOString();
  const fail = (kind: McpTestResult["kind"], message: string, hint?: string, latencyMs?: number): McpTestResult => ({ at, ok: false, kind, message, hint, latencyMs });
  const u = resolveRefs(input.url, input.ctx);
  if (u.missing.length) return fail("skipped", `URL references unresolved ${u.missing.join(", ")}.`, "Set the environment variable or file and retry.");
  if (!isHttp(u.value)) return fail("skipped", "URL is not http(s).");
  const secrets: string[] = [];
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    const r = resolveRefs(v, input.ctx);
    if (r.missing.length) return fail("skipped", `Header ${k} references unresolved ${r.missing.join(", ")}.`);
    headers[k] = r.value;
    if (r.value) secrets.push(r.value);
  }
  const host = hostOf(u.value);
  const t = input.timeoutMs ?? 10_000;
  const init = await httpRequest({ url: u.value, method: "POST", headers, body: initializeBody(1), timeoutMs: t, secrets });
  if (init.kind === "timeout") return fail("timeout", `No response from ${host} within ${t / 1000}s.`, "Check that the server is running and reachable.", init.latencyMs);
  if (init.kind === "network") return fail("network", `Could not reach ${host}: ${init.message}.`, "Is the server running? Check host, port and TLS.", init.latencyMs);
  if (init.status === 401 || init.status === 403) {
    const www = init.headers.get("www-authenticate");
    return fail("oauth-required", `${host} requires authentication (HTTP ${init.status}).`, www?.toLowerCase().includes("bearer") ? "Run `opencode mcp auth <name>` or add an Authorization header." : "Provide valid credentials in headers.", init.latencyMs);
  }
  if (init.status >= 300 && init.status < 400) return fail("protocol", `${host} redirected (HTTP ${init.status}); redirects are not followed.`, "Use the final URL.", init.latencyMs);
  if (init.status === 404 || init.status === 405 || init.status === 406) {
    return fail("unsupported", `${host} did not accept a streamable-HTTP initialize (HTTP ${init.status}).`, "It may use the legacy SSE transport or a different path. Check the server docs.", init.latencyMs);
  }
  if (init.status < 200 || init.status >= 300) return fail("network", `${host} answered HTTP ${init.status}.`, undefined, init.latencyMs);
  const msg = parseRpcBody(init.text, init.headers.get("content-type"));
  if (!msg || msg.error || typeof msg.result !== "object" || msg.result === null) {
    return fail("protocol", msg?.error ? `Server error: ${redactSecrets(msg.error.message, secrets).slice(0, 160)}` : "Response was not a valid MCP initialize result.", "The URL may not be an MCP endpoint.", init.latencyMs);
  }
  const r = msg.result as { serverInfo?: { name?: string; version?: string } };
  const session = init.headers.get("mcp-session-id");
  const h2: Record<string, string> = { ...headers, "mcp-protocol-version": PROTOCOL };
  if (session) h2["mcp-session-id"] = session;
  await httpRequest({ url: u.value, method: "POST", headers: h2, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), timeoutMs: t, secrets });
  const list = await httpRequest({ url: u.value, method: "POST", headers: h2, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }), timeoutMs: t, secrets });
  let tools: McpTestResult["tools"];
  if (list.kind === "response" && list.status >= 200 && list.status < 300) {
    const lm = parseRpcBody(list.text, list.headers.get("content-type"));
    const arr = (lm?.result as { tools?: unknown } | undefined)?.tools;
    if (Array.isArray(arr)) {
      tools = arr
        .map((x) => x as { name?: unknown; description?: unknown })
        .filter((x) => typeof x.name === "string")
        .slice(0, 300)
        .map((x) => ({ name: x.name as string, description: typeof x.description === "string" ? x.description.slice(0, 200) : undefined }));
    }
  }
  if (session) await httpRequest({ url: u.value, method: "DELETE", headers: h2, timeoutMs: 3000, secrets });
  return {
    at,
    ok: true,
    kind: "ok",
    message: `Connected to ${host}${r.serverInfo?.name ? ` (${r.serverInfo.name}${r.serverInfo.version ? ` ${r.serverInfo.version}` : ""})` : ""}.`,
    serverName: r.serverInfo?.name,
    serverVersion: r.serverInfo?.version,
    tools,
    latencyMs: init.latencyMs,
    hint: tools ? undefined : "Connected, but the tool list could not be retrieved.",
  };
}

export interface McpLocalInput {
  command: string[];
  cwd?: string;
  environment?: Record<string, string>;
  ctx: RefContext;
  timeoutMs?: number;
}

const SAFE_ENV = ["PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP", "TMPDIR", "LANG", "TERM", "SHELL", "PREFIX", "NODE_OPTIONS"];

/**
 * Spawns the configured command (NO shell) and speaks MCP over stdio.
 * The API layer must only call this after an explicit confirmation that matches this exact command.
 */
export function testMcpLocal(input: McpLocalInput): Promise<McpTestResult> {
  const at = new Date().toISOString();
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? 15_000;
  const secrets: string[] = [];
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV || "development" };
  for (const k of SAFE_ENV) if (input.ctx.env[k] !== undefined) env[k] = input.ctx.env[k];
  for (const [k, v] of Object.entries(input.environment ?? {})) {
    const r = hasRefs(v) ? resolveRefs(v, input.ctx).value : v;
    env[k] = r;
    if (r) secrets.push(r);
  }
  const [cmd, ...args] = input.command;
  return new Promise<McpTestResult>((resolve) => {
    let done = false;
    let buf = "";
    let stderr = "";
    let child: ReturnType<typeof spawn>;
    const finish = (r: McpTestResult): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child?.stdin?.end();
        child?.kill("SIGTERM");
        setTimeout(() => child?.kill("SIGKILL"), 1500).unref();
      } catch {
        /* already gone */
      }
      resolve(r);
    };
    const timer = setTimeout(
      () =>
        finish({
          at,
          ok: false,
          kind: "timeout",
          message: `No MCP response within ${timeoutMs / 1000}s.`,
          hint: stderr ? `stderr: ${redactSecrets(stderr, secrets).trim().slice(-200)}` : "The command started but did not speak MCP over stdio.",
          latencyMs: Date.now() - started,
        }),
      timeoutMs,
    );
    try {
      child = spawn(cmd as string, args, { cwd: input.cwd, env, shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      finish({ at, ok: false, kind: "spawn-failed", message: `Could not start: ${(e as Error).message}`, latencyMs: 0 });
      return;
    }
    child.on("error", (e: NodeJS.ErrnoException) =>
      finish({
        at,
        ok: false,
        kind: "spawn-failed",
        message: e.code === "ENOENT" ? `Command not found: ${cmd}` : `Could not start ${cmd}: ${e.code ?? e.message}`,
        hint: e.code === "ENOENT" ? "Install it or use an absolute path in `command`." : undefined,
        latencyMs: Date.now() - started,
      }),
    );
    child.on("exit", (code) => {
      if (!done) {
        finish({
          at,
          ok: false,
          kind: "protocol",
          message: `Process exited (code ${code ?? "?"}) before answering.`,
          hint: stderr ? `stderr: ${redactSecrets(stderr, secrets).trim().slice(-200)}` : undefined,
          latencyMs: Date.now() - started,
        });
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-2000);
    });
    let serverInfo: { name?: string; version?: string } | undefined;
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        let m: { id?: number; result?: unknown; error?: { message: string } };
        try {
          m = JSON.parse(line) as typeof m;
        } catch {
          continue;
        }
        if (m.id === 1) {
          if (m.error) return finish({ at, ok: false, kind: "protocol", message: `Server error: ${redactSecrets(m.error.message, secrets).slice(0, 160)}`, latencyMs: Date.now() - started });
          serverInfo = (m.result as { serverInfo?: typeof serverInfo } | undefined)?.serverInfo;
          child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
          child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
        } else if (m.id === 2) {
          const arr = (m.result as { tools?: unknown } | undefined)?.tools;
          const tools = Array.isArray(arr)
            ? arr
                .map((x) => x as { name?: unknown; description?: unknown })
                .filter((x) => typeof x.name === "string")
                .slice(0, 300)
                .map((x) => ({ name: x.name as string, description: typeof x.description === "string" ? x.description.slice(0, 200) : undefined }))
            : undefined;
          finish({
            at,
            ok: true,
            kind: "ok",
            message: `Started ${cmd} and completed the MCP handshake${serverInfo?.name ? ` (${serverInfo.name}${serverInfo.version ? ` ${serverInfo.version}` : ""})` : ""}.`,
            serverName: serverInfo?.name,
            serverVersion: serverInfo?.version,
            tools,
            latencyMs: Date.now() - started,
          });
        }
      }
    });
    child.stdin?.on("error", () => undefined);
    child.stdin?.write(initializeBody(1) + "\n");
  });
}
