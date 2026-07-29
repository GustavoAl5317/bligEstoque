"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error || "Falha no login.");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-tint via-white to-brand-light/40 px-4">
      {/* Brilhos decorativos ao fundo */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand-light/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-brand/20 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* Logo em destaque, fora do cartão */}
        <div className="mb-6 flex flex-col items-center">
          <Logo size="lg" />
          <p className="mt-3 text-sm font-medium tracking-wide text-brand-dark/70">
            Reposição de Estoque
          </p>
        </div>

        <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-brand/10 backdrop-blur">
          <h1 className="mb-1 text-center text-xl font-semibold text-slate-800">
            Bem-vindo de volta
          </h1>
          <p className="mb-6 text-center text-sm text-slate-400">
            Entre com seu usuário e senha
          </p>

          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Usuário
              </label>
              <input
                type="text"
                placeholder="Seu usuário"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Senha
              </label>
              <input
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand/30 transition hover:bg-brand-dark disabled:opacity-50"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          DANZI · Prata 925
        </p>
      </div>
    </div>
  );
}
