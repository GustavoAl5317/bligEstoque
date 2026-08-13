"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Phase = "idle" | "running" | "done" | "error";

/** Status de um job (kits ou consumo), lido do servidor. */
export interface JobStatus {
  done: boolean;
  processed: number;
  /** Só para kits: quantos kits mapeados. */
  kits?: number;
  /** Quando rodou pela última vez (ISO). */
  updatedAt?: string;
}

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
  /** Se há um cálculo PAUSADO (interrompido antes de terminar). null = não. */
  pausedProducts: number | null;
  pausedSuppliers: number | null;
  pausedKits: number | null;
  pausedConsumption: number | null;
  /** Status completo de cada job (null = nunca rodou). */
  productJob: JobStatus | null;
  supplierJob: JobStatus | null;
  kitJob: JobStatus | null;
  consumptionJob: JobStatus | null;
  runProductSync: () => Promise<void>;
  runKitSync: () => Promise<void>;
  runConsumption: () => Promise<void>;
  resumeProductSync: () => Promise<void>;
  resumeSupplierSync: () => Promise<void>;
  resumeKitSync: () => Promise<void>;
  resumeConsumption: () => Promise<void>;
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
  const [pausedProducts, setPausedProducts] = useState<number | null>(null);
  const [pausedSuppliers, setPausedSuppliers] = useState<number | null>(null);
  const [pausedKits, setPausedKits] = useState<number | null>(null);
  const [pausedConsumption, setPausedConsumption] = useState<number | null>(null);
  const [productJob, setProductJob] = useState<JobStatus | null>(null);
  const [supplierJob, setSupplierJob] = useState<JobStatus | null>(null);
  const [kitJob, setKitJob] = useState<JobStatus | null>(null);
  const [consumptionJob, setConsumptionJob] = useState<JobStatus | null>(null);
  const running = useRef(false);

  // Verifica (ao abrir e após cada sync) o status de cada job.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [p, s, k, c] = await Promise.all([
          fetch("/api/bling/sync").then((r) => r.json()).catch(() => ({})),
          fetch("/api/bling/sync-suppliers").then((r) => r.json()).catch(() => ({})),
          fetch("/api/bling/sync-kits").then((r) => r.json()).catch(() => ({})),
          fetch("/api/bling/sync-consumption").then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancel) return;
        setProductJob(p?.job ?? null);
        setSupplierJob(s?.job ?? null);
        setKitJob(k?.job ?? null);
        setConsumptionJob(c?.job ?? null);
        setPausedProducts(p?.job && !p.job.done ? p.job.processed ?? 0 : null);
        setPausedSuppliers(s?.job && !s.job.done ? s.job.processed ?? 0 : null);
        setPausedKits(k?.job && !k.job.done ? k.job.processed ?? 0 : null);
        setPausedConsumption(c?.job && !c.job.done ? c.job.processed ?? 0 : null);
      } catch {
        /* ignora */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [dataVersion]);

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
      window.setTimeout(() => setPhase((p) => (p === "done" ? "idle" : p)), 6000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha na sincronização.");
      setPhase("error");
      setDataVersion((v) => v + 1); // re-checa o estado pausado
      window.setTimeout(() => setPhase((p) => (p === "error" ? "idle" : p)), 8000);
    } finally {
      running.current = false;
    }
  }

  // Loops reutilizáveis (restart=true começa do zero; false continua de onde parou).
  const productLoop = (restart: boolean) => async (report: (m: string) => void) => {
    let body: object = restart ? { restart: true } : {};
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = await fetch("/api/bling/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao sincronizar produtos.");
      body = {};
      report(
        d.done
          ? `Concluído! ${d.processed ?? 0} produtos sincronizados.`
          : `Lendo produtos… ${d.processed ?? 0} lidos.`,
      );
      if (d.done) break;
    }
  };

  const supplierLoop = (restart: boolean) => async (report: (m: string) => void) => {
    let body: object = restart ? { restart: true } : {};
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = await fetch("/api/bling/sync-suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao sincronizar fornecedores.");
      body = {};
      report(
        d.done
          ? `Concluído! ${d.processed ?? 0} fornecedores sincronizados.`
          : `Lendo fornecedores… ${d.processed ?? 0} lidos.`,
      );
      if (d.done) break;
    }
  };

  const kitLoop = (restart: boolean) => async (report: (m: string) => void) => {
    let body: object = restart ? { restart: true } : {};
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
  };

  const consumptionLoop = (restart: boolean) => async (report: (m: string) => void) => {
    let body: object = restart ? { restart: true } : {};
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
  };

  const runProductSync = () =>
    run("Produtos e fornecedores", async (report) => {
      report("Sincronizando produtos (busca por depósito Geral)…");
      await productLoop(true)(report);
      report("Atualizando fornecedores…");
      await supplierLoop(true)(report);
      report("Concluído! Produtos e fornecedores atualizados.");
    });

  const runKitSync = () => run("Composição dos kits", kitLoop(true));
  const resumeKitSync = () => run("Composição dos kits", kitLoop(false));
  const runConsumption = () => run("Consumo por item", consumptionLoop(true));
  const resumeConsumption = () => run("Consumo por item", consumptionLoop(false));
  const resumeProductSync = () => run("Produtos e fornecedores", productLoop(false));
  const resumeSupplierSync = () => run("Fornecedores", supplierLoop(false));

  const active = phase === "running";

  return (
    <SyncContext.Provider
      value={{
        phase,
        label,
        message,
        active,
        dataVersion,
        pausedProducts,
        pausedSuppliers,
        pausedKits,
        pausedConsumption,
        productJob,
        supplierJob,
        kitJob,
        consumptionJob,
        runProductSync,
        runKitSync,
        runConsumption,
        resumeProductSync,
        resumeSupplierSync,
        resumeKitSync,
        resumeConsumption,
      }}
    >
      {children}
      {phase !== "idle" && (
        <SyncIndicator phase={phase} label={label} message={message} />
      )}
      {/* Aviso de sincronização pausada (quando nada está rodando). */}
      {phase === "idle" && (pausedProducts !== null || pausedSuppliers !== null || pausedKits !== null || pausedConsumption !== null) && (
        <PausedBanner
          pausedProducts={pausedProducts}
          pausedSuppliers={pausedSuppliers}
          pausedKits={pausedKits}
          pausedConsumption={pausedConsumption}
          onResumeProducts={resumeProductSync}
          onResumeSuppliers={resumeSupplierSync}
          onResumeKits={resumeKitSync}
          onResumeConsumption={resumeConsumption}
        />
      )}
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

function PausedBanner({
  pausedProducts,
  pausedSuppliers,
  pausedKits,
  pausedConsumption,
  onResumeProducts,
  onResumeSuppliers,
  onResumeKits,
  onResumeConsumption,
}: {
  pausedProducts: number | null;
  pausedSuppliers: number | null;
  pausedKits: number | null;
  pausedConsumption: number | null;
  onResumeProducts: () => void;
  onResumeSuppliers: () => void;
  onResumeKits: () => void;
  onResumeConsumption: () => void;
}) {
  // Prioriza Produtos -> Fornecedores -> Kits -> Consumo
  const kind = pausedProducts !== null ? "produtos"
    : pausedSuppliers !== null ? "fornecedores"
    : pausedKits !== null ? "kits" : "consumo";

  const processed = kind === "produtos" ? pausedProducts
    : kind === "fornecedores" ? pausedSuppliers
    : kind === "kits" ? pausedKits : pausedConsumption;

  const label = kind === "produtos" ? "Sincronização de produtos"
    : kind === "fornecedores" ? "Sincronização de fornecedores"
    : kind === "kits" ? "Composição dos kits" : "Cálculo de consumo";
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)]">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white p-3.5 shadow-lg">
        <span className="mt-0.5 text-amber-500">⏸</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800">
            Sincronização pausada
          </div>
          <div className="text-xs text-slate-500">
            {label} parou em {processed ?? 0}. Clique para continuar de onde parou.
          </div>
          <button
            onClick={kind === "produtos" ? onResumeProducts : kind === "fornecedores" ? onResumeSuppliers : kind === "kits" ? onResumeKits : onResumeConsumption}
            className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
