"use client";

import { useEffect, useState } from "react";

interface Status {
  configured: boolean;
  connected: boolean;
  databaseConfigured: boolean;
}

export default function ConexaoPage() {
  const [status, setStatus] = useState<Status | null>(null);

  async function load() {
    const r = await fetch("/api/bling/status");
    setStatus(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function disconnect() {
    await fetch("/api/bling/status", { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Conexão com o Bling</h1>
        <p className="text-sm text-slate-500">
          Conecte a conta do Bling para o sistema importar produtos, estoque,
          custo e fornecedor automaticamente.
        </p>
      </header>

      {!status && <p className="text-sm text-slate-400">Carregando…</p>}

      {status && (
        <div className="space-y-4">
          <Card
            label="Integração com o Bling"
            ok={status.connected}
            okText="Conectado"
            offText={status.configured ? "Não conectado" : "Não configurado"}
          >
            {!status.configured && (
              <p className="text-sm text-slate-500">
                Faltam as credenciais do app do Bling. Defina{" "}
                <code className="rounded bg-slate-100 px-1">BLING_CLIENT_ID</code> e{" "}
                <code className="rounded bg-slate-100 px-1">BLING_CLIENT_SECRET</code>{" "}
                no ambiente (arquivo <code className="rounded bg-slate-100 px-1">.env</code>).
              </p>
            )}
            {status.configured && !status.connected && (
              <a
                href="/api/bling/connect"
                className="inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Conectar ao Bling
              </a>
            )}
            {status.connected && (
              <button
                onClick={disconnect}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
              >
                Desconectar
              </button>
            )}
          </Card>

          <Card
            label="Banco de dados"
            ok={status.databaseConfigured}
            okText="Postgres configurado"
            offText="Em memória (dev)"
          >
            {!status.databaseConfigured && (
              <p className="text-sm text-slate-500">
                Sem{" "}
                <code className="rounded bg-slate-100 px-1">DATABASE_URL</code>, as
                configurações (curvas, prazos) ficam só na memória e se perdem ao
                reiniciar. Em produção, defina o banco Postgres.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({
  label,
  ok,
  okText,
  offText,
  children,
}: {
  label: string;
  ok: boolean;
  okText: string;
  offText: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {ok ? okText : offText}
        </span>
      </div>
      {children}
    </div>
  );
}
