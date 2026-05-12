import { NextResponse, type NextRequest } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/middleware-helper";

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)).*)",
  ],
};

export async function proxy(req: NextRequest) {
  const { response, user } = await refreshSupabaseSession(req);
  if (user) return response;

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}
