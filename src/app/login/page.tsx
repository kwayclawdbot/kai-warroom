"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <Suspense fallback={<LoginShell />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kai War Room</h1>
        <p className="mt-1 text-sm text-white/60">
          Sign in with your cheatcode.com account.
        </p>
      </div>
      {children}
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed");
      return;
    }
    const dest = params.get("from") ?? "/";
    router.push(dest);
    router.refresh();
  }

  return (
    <LoginShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="email"
          autoFocus
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-cyan-400"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base outline-none focus:border-cyan-400"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={pending || !email || !password}
          className="w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-black transition hover:bg-cyan-300 disabled:opacity-40"
        >
          {pending ? "Entering…" : "Enter"}
        </button>
      </form>
    </LoginShell>
  );
}
