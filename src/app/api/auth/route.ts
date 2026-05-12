import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";

export async function POST(req: Request) {
  const expectedUser = process.env.SHARED_USERNAME;
  const expectedPass = process.env.SHARED_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expectedUser || !expectedPass || !secret) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    );
  }
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    !body.username ||
    !body.password ||
    body.username !== expectedUser ||
    body.password !== expectedPass
  ) {
    return NextResponse.json(
      { error: "Wrong username or password" },
      { status: 401 },
    );
  }
  const token = await signSession(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
