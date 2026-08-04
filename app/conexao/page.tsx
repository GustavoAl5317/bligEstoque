"use client";

import { useEffect, useState } from "react";
import { useSync } from "@/components/SyncProvider";

interface Status {
  configured: boolean;
  connected: boolean;
  databaseConfigured: boolean;
  databaseOk?: boolean;
  databaseError?: string | null;
}

export default function ConexaoPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sync = useSync();

  // Mensagem para um card específico (só quando é a sincronização dele).
  const msgFor = (lbl: string) =>
    sync.label === lbl && sync.phase !== "idle" ? sync.message : null;

  async function load() {
    try {
      setLoadError(null);
      const r = await fetch("/api/bling/status");
      if (!r.ok) throw new Error(`status ${r.status}`);
      setStatus(await r.json());
    } catch (e) {
      setLoadError(
        "Não foi possível carregar o status. " +
          (e instanceof Error ? e.message : ""),
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function disconnect() {
    await fetch("/api/bling/status", { method: "DELETE" });
    load();
  }

  const kitMsg = msgFor("Composição dos kits");
  const consMsg = msgFor("Consumo por item");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Conexão com o Bling</h1>
        <p className="text-sm text-slate-500">
          Conecte a conta do Bling para o sistema importar produtos, estoque,
          custo e fornecedor automaticamente. O consumo e snapshots são gerenciados sozinhos.
        </p>
      </header>

      {!status && !loadError && (
        <p className="text-sm text-slate-400">Carregando…</p>
      )}

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}{" "}
          <button onClick={load} className="underline">
            tentar de novo
          </button>
        </div>
      )}

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
                className="inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark"
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
            ok={status.databaseConfigured ? status.databaseOk !== false : false}
            okText="Postgres conectado"
            offText={
              status.databaseConfigured ? "Erro de conexão" : "Em memória (dev)"
            }
          >
            {status.databaseConfigured && status.databaseOk === false && (
              <p className="text-sm text-red-700">
                Falha ao conectar no banco:{" "}
                <code className="rounded bg-red-50 px-1">
                  {status.databaseError}
                </code>
              </p>
            )}
            {!status.databaseConfigured && (
              <p className="text-sm text-slate-500">
                Sem{" "}
                <code className="rounded bg-slate-100 px-1">DATABASE_URL</code>, as
                configurações (curvas, prazos) ficam só na memória e se perdem ao
                reiniciar. Em produção, defina o banco Postgres.
              </p>
            )}
          </Card>

          {status.connected && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-1 text-sm font-medium text-slate-700">
                Composição dos kits
              </div>
              <p className="mb-3 text-sm text-slate-500">
                Lê a composição de cada kit no Bling (quais itens formam cada kit).
                Assim, quando um kit vende, o consumo vai para os itens certos, e
                não para o kit. É um processo pesado (~alguns minutos): rode{" "}
                <b>1x</b> e sempre que criar novos kits.
              </p>
              {sync.pausedKits !== null && !sync.active && (
                <p className="mb-3 text-sm text-amber-700">
                  Pausado em {sync.pausedKits} produtos. Continue para terminar.
                </p>
              )}
              {kitMsg && <p className="mb-3 text-sm text-slate-600">{kitMsg}</p>}
              <div className="flex flex-wrap gap-2">
                {sync.pausedKits !== null && !sync.active && (
                  <button
                    onClick={sync.resumeKitSync}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
                  >
                    Continuar de onde parou
                  </button>
                )}
                <button
                  onClick={sync.runKitSync}
                  disabled={sync.active}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                    sync.pausedKits !== null && !sync.active
                      ? "border border-slate-300 text-slate-700 hover:border-slate-400"
                      : "bg-brand text-white hover:bg-brand-dark"
                  }`}
                >
                  {sync.active && sync.label === "Composição dos kits"
                    ? "Processando…"
                    : sync.pausedKits !== null
                      ? "Recomeçar do zero"
                      : "Sincronizar composição dos kits"}
                </button>
              </div>
            </div>
          )}

          {status.connected && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-1 text-sm font-medium text-slate-700">
                Consumo por item (últimos 12 meses)
              </div>
              <p className="mb-3 text-sm text-slate-500">
                Calcula quanto cada item vende por mês, a partir das vendas — com
                os <b>kits já contados nos seus itens</b>. É pesado (~30 min): pode
                deixar rodando. Rode <b>1x por mês</b> (depois de sincronizar os kits).
              </p>
              {sync.pausedKits !== null && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠️ Termine a <b>composição dos kits</b> primeiro. Senão o consumo
                  dos kits não vai para os itens.
                </p>
              )}
              {sync.pausedConsumption !== null && !sync.active && (
                <p className="mb-3 text-sm text-amber-700">
                  Pausado em {sync.pausedConsumption} pedidos.
                </p>
              )}
              {consMsg && <p className="mb-3 text-sm text-slate-600">{consMsg}</p>}
              <div className="flex flex-wrap gap-2">
                {sync.pausedConsumption !== null && !sync.active && (
                  <button
                    onClick={sync.resumeConsumption}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark"
                  >
                    Continuar de onde parou
                  </button>
                )}
                <button
                  onClick={sync.runConsumption}
                  disabled={sync.active}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                    sync.pausedConsumption !== null && !sync.active
                      ? "border border-slate-300 text-slate-700 hover:border-slate-400"
                      : "bg-brand text-white hover:bg-brand-dark"
                  }`}
                >
                  {sync.active && sync.label === "Consumo por item"
                    ? "Processando…"
                    : sync.pausedConsumption !== null
                      ? "Recomeçar (do zero)"
                      : "Calcular consumo"}
                </button>
              </div>
            </div>
          )}
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
