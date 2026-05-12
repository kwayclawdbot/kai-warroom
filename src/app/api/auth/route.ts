import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  // Rate limit: 5 login attempts per minute per IP.
  const rl = rateLimit(`auth:${clientIp(req)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts — slow down" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json(
      { error: error.message || "Login failed" },
      { status: 401 },
    );
  }

  // Best-effort lazy linker: matches auth.uid() → public.users by email so
  // subsequent kai_user_tier() / chat route lookups can resolve the SMS user
  // record. RPC is defined in cheatcode-os Supabase (kai_link_auth_user).
  try {
    await supabase.rpc("kai_link_auth_user");
  } catch {
    /* link is idempotent; first hit may fail, that's fine */
  }

  return NextResponse.json({ ok: true });
}
