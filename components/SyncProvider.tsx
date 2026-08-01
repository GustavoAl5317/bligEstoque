"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Phase = "idle" | "running" | "done" | "error";

interface SyncContextValue {
  phase: Phase;
  /** O que está sincronizando (ex.: "Composição dos kits"). */
  label: string;
  /** Mensagem de progresso. */
  message: string;
  /** true enquanto algo está rodando. */
  active: boolean;
  /** Muda cada vez que uma sincronização termina (para as telas recarregarem). */
  dataVersion: number;
  runProductSync: () => Promise<void>;
  runKitSync: () => Promise<void>;
  runConsumption: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync deve ser usado dentro de <SyncProvider>");
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [dataVersion, setDataVersion] = useState(0);
  const running = useRef(false);

  /** Garante que só uma sincronização roda por vez e cuida do estado/indicador. */
  async function run(
    lbl: string,
    fn: (report: (msg: string) => void) => Promise<void>,
  ) {
    if (running.current) return; // já tem uma rodando
    running.current = true;
    setLabel(lbl);
    setPhase("running");
    setMessage("Iniciando…");
    try {
      await fn((msg) => setMessage(msg));
      setPhase("done");
      setDataVersion((v) => v + 1);
      // Some sozinho depois de alguns segundos.
      window.setTimeout(() => setPhase((p) => (p === "done" ? "idle" : p)), 6000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na sincronização.");
      setPhase("error");
      window.setTimeout(() => setPhase((p) => (p === "error" ? "idle" : p)), 8000);
    } finally {
      running.current = false;
    }
  }

  const runProductSync = () =>
    run("Produtos e fornecedores", async (report) => {
      report("Sincronizando produtos…");
      const r1 = await fetch("/api/bling/sync", { method: "POST" });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error || "Falha ao sincronizar produtos.");
      report(`${d1.count} produtos. Sincronizando fornecedores…`);
      const r2 = await fetch("/api/bling/sync-suppliers", { method: "POST" });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || "Falha ao sincronizar fornecedores.");
      report(`${d1.count} produtos e ${d2.count} com fornecedor atualizados.`);
    });

  const runKitSync = () =>
    run("Composição dos kits", async (report) => {
      let body: object = { restart: true };
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await fetch("/api/bling/sync-kits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha ao sincronizar kits.");
        body = {};
        report(
          d.done
            ? `Concluído! ${d.kits} kits mapeados.`
            : `Lendo produtos… ${d.processed} lidos, ${d.kits} kits até agora.`,
        );
        if (d.done) break;
      }
    });

  const runConsumption = () =>
    run("Consumo por item", async (report) => {
      let body: object = { restart: true };
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await fetch("/api/bling/sync-consumption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha no cálculo de consumo.");
        body = {};
        report(
          d.done
            ? `Concluído! Consumo atualizado (${d.processed} pedidos).`
            : `Lendo vendas… ${d.processed} pedidos.`,
        );
        if (d.done) break;
      }
    });

  const active = phase === "running";

  return (
    <SyncContext.Provider
      value={{
        phase,
        label,
        message,
        active,
        dataVersion,
        runProductSync,
        runKitSync,
        runConsumption,
      }}
    >
      {children}
      {phase !== "idle" && <SyncIndicator phase={phase} label={label} message={message} />}
    </SyncContext.Provider>
  );
}

function SyncIndicator({
  phase,
  label,
  message,
}: {
  phase: Phase;
  label: string;
  message: string;
}) {
  const color =
    phase === "error"
      ? "border-red-200"
      : phase === "done"
        ? "border-emerald-200"
        : "border-brand-light";
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)]">
      <div
        className={`flex items-start gap-3 rounded-xl border ${color} bg-white p-3.5 shadow-lg`}
      >
        <span className="mt-0.5 shrink-0">
          {phase === "running" && (
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          )}
          {phase === "done" && <span className="text-emerald-600">✓</span>}
          {phase === "error" && <span className="text-red-600">!</span>}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800">
            {phase === "running" ? "Sincronizando…" : label}
          </div>
          <div className="truncate text-xs text-slate-500" title={message}>
            {phase === "running" ? `${label} · ${message}` : message}
          </div>
        </div>
      </div>
    </div>
  );
}
