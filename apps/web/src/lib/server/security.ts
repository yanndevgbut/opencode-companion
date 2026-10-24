import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  record.count++;
  return record.count <= MAX_REQUESTS_PER_WINDOW;
}

/**
 * Validate that request is authorized:
 * 1. Host is loopback or explicit binding
 * 2. Session cookie matches OCC_SESSION_TOKEN or token provided in query
 * 3. CSRF check on mutative methods
 */
export function validateRequest(req: NextRequest): { authorized: boolean; response?: NextResponse } {
  const host = req.headers.get("host") || "";
  // Ensure host is loopback or localhost
  if (!host.startsWith("127.0.0.1") && !host.startsWith("localhost") && !host.startsWith("[::1]")) {
    const customHost = process.env.HOSTNAME;
    if (!customHost || !host.startsWith(customHost)) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Host header rejected. Companion only binds to local loopback." }, { status: 403 }),
      };
    }
  }

  // Rate limit
  const clientIp = req.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!checkRateLimit(clientIp)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Rate limit exceeded. Please wait a moment." }, { status: 429 }),
    };
  }

  if (process.env.OCC_NO_AUTH === "1") {
    return { authorized: true };
  }

  const expectedToken = process.env.OCC_SESSION_TOKEN;
  if (expectedToken) {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token");
    const cookieToken = req.cookies.get("occ_session")?.value;
    const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const tokenMatches = queryToken === expectedToken || cookieToken === expectedToken || authHeader === expectedToken;

    if (!tokenMatches) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Unauthorized. Session token is missing or invalid." }, { status: 401 }),
      };
    }
  }

  // CSRF validation on mutations
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const csrfHeader = req.headers.get("x-occ-csrf");
    const origin = req.headers.get("origin");
    if (!csrfHeader && origin) {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return {
          authorized: false,
          response: NextResponse.json({ error: "Cross-site request forgery detected (Origin mismatch)." }, { status: 403 }),
        };
      }
    }
  }

  return { authorized: true };
}
