import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const response = NextResponse.next();

  if (token) {
    response.cookies.set("occ_session", token, {
      path: "/",
      sameSite: "lax",
      httpOnly: false, // Accessible to client scripts if needed
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for static files
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
