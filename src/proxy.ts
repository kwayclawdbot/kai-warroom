import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)).*)",
  ],
};

export async function proxy(req: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new NextResponse("SESSION_SECRET not configured", { status: 500 });
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySession(secret, cookie);
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}
