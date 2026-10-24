import { redactSecrets } from "./redact";

export type FetchOutcome =
  | { kind: "response"; status: number; headers: Headers; text: string; latencyMs: number }
  | { kind: "timeout"; latencyMs: number }
  | { kind: "network"; latencyMs: number; message: string };

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  secrets?: string[];
}

/**
 * One-shot HTTP request with a hard timeout, a byte cap and redirects disabled
 * (so credentials can never be forwarded to another host).
 */
export async function httpRequest(req: HttpRequest): Promise<FetchOutcome> {
  const started = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), req.timeoutMs ?? 8000);
  try {
    const res = await fetch(req.url, {
      method: req.method ?? "GET",
      headers: req.headers,
      body: req.body,
      redirect: "manual",
      signal: ctl.signal,
    });
    const max = req.maxBytes ?? 1_000_000;
    let text = "";
    const reader = res.body?.getReader();
    if (reader) {
      const dec = new TextDecoder();
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        text += dec.decode(value, { stream: true });
        // SSE responses may stay open; stop once we have a full JSON-RPC message or hit the cap.
        if (total > max || (res.headers.get("content-type")?.includes("text/event-stream") && /\n\n/.test(text) && /data:\s*\{/.test(text))) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    }
    return { kind: "response", status: res.status, headers: res.headers, text, latencyMs: Date.now() - started };
  } catch (e) {
    const latencyMs = Date.now() - started;
    if (ctl.signal.aborted) return { kind: "timeout", latencyMs };
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const code = err.cause?.code ?? err.cause?.message ?? err.message;
    return { kind: "network", latencyMs, message: redactSecrets(String(code), req.secrets ?? []).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid url)";
  }
}
