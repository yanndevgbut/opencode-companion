import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expectedToken = process.env.OCC_SESSION_TOKEN;

  if (expectedToken && token === expectedToken) {
    const res = NextResponse.json({ authenticated: true });
    res.cookies.set("occ_session", token, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  }

  return NextResponse.json({ authenticated: false, error: "Invalid token" }, { status: 401 });
}
