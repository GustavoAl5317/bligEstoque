"use client";

import { useEffect, useRef, useState } from "react";
import { formatInt } from "@/lib/format";

interface WebhookStatus {
  products: number;
  totalExits: number;
  lastAt: string | null;
}

export default function ConsumoPage() {
  const [count, setCount] = useState<number | null>(null);
  const [webhook, setWebhook] = useState<WebhookStatus | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/import/consumption")
      .then((r) => r.json())
      .then((d) => setCount(d.count ?? 0))
      .catch(() => setMsg("Não foi possível carregar."));
    fetch("/api/bling/webhook")
      .then((r) => r.json())
      .then((d) => setWebhook(d.status ?? null))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, []);

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/bling/webhook`
      : "/api/bling/webhook";

  async function importFile(file: File) {
    setImporting(true);
    setMsg("Lendo a planilha…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/import/consumption", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar.");
      setMsg(`Importado: consumo de ${formatInt(d.total)} produtos.`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearAll() {
    if (!confirm("Apagar o consumo importado? O sistema volta a usar o consumo calculado pelas vendas.")) {
      return;
    }
    await fetch("/api/import/consumption", { method: "DELETE" });
    setMsg("Consumo importado apagado.");
    load();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consumo (planilha)</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Importe o <b>consumo mensal (CM)</b> da sua planilha. Esse número tem{" "}
            <b>precedência</b> sobre o consumo calculado pelas vendas — porque a sua
            planilha já conta as <b>saídas via kit</b>, que a API do Bling não entrega.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {importing ? "Importando…" : "Importar planilha"}
            </button>
            {count !== null && count > 0 && (
              <button
                onClick={clearAll}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400"
              >
                Apagar
              </button>
            )}
          </div>
          <a
            href="/modelo-consumo.xlsx"
            download
            className="text-xs text-brand hover:underline"
          >
            Baixar modelo da planilha
          </a>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      </header>

      <div className="mb-4 rounded-xl border border-brand-light/60 bg-brand-tint/50 px-4 py-3 text-sm text-slate-600">
        <b>Como funciona:</b> aceita <b>dois formatos</b>:
        <ul className="ml-4 mt-1 list-disc space-y-0.5">
          <li>
            O <b>modelo</b> acima — colunas <b>SKU</b> e <b>Consumo Mensal</b>.
          </li>
          <li>
            A sua planilha <b>CONSUMO MENSAL</b> — o sistema lê o código na coluna{" "}
            <b>C</b> e o CM (GERAL) na coluna <b>H</b>.
          </li>
        </ul>
        Cada importação <b>substitui</b> a anterior (é a foto atual). Enquanto houver
        consumo importado, ele é usado no relatório e na tela de curvas.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Produtos com consumo importado
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
          {count === null ? "…" : formatInt(count)}
        </div>
        {count === 0 && (
          <p className="mt-2 text-sm text-slate-400">
            Nenhum consumo importado. O sistema está usando o consumo automático
            (webhook/vendas). Importe a planilha só se quiser sobrepor com os números
            dela.
          </p>
        )}
      </div>

      {/* Consumo automático pelo webhook de estoque */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">
          Consumo automático (webhook de estoque)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Quando ligado no Bling, o sistema recebe <b>cada saída de estoque</b> (venda,
          NF, kit dando baixa nos itens) e calcula o consumo <b>sozinho</b> — o mesmo
          método da planilha, sem trabalho manual. Vale <b>daqui pra frente</b>; até
          juntar histórico, o consumo importado/das vendas cobre.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Produtos monitorados" value={webhook?.products ?? 0} />
          <Stat label="Saídas registradas" value={webhook?.totalExits ?? 0} />
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Última movimentação
            </div>
            <div className="mt-1 text-sm font-medium text-slate-700">
              {webhook?.lastAt
                ? new Date(webhook.lastAt).toLocaleString("pt-BR")
                : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-brand-light/60 bg-brand-tint/50 px-4 py-3 text-sm text-slate-600">
          <b>Como ligar (uma vez, no Bling):</b>
          <ol className="ml-4 mt-1 list-decimal space-y-0.5">
            <li>
              No Bling, painel do app/integração → <b>Webhooks</b> → novo webhook.
            </li>
            <li>
              Evento: <b>Estoque</b>. URL:{" "}
              <code className="rounded bg-white px-1 text-xs">{webhookUrl}</code>
            </li>
            <li>Salvar. Pronto — as saídas começam a ser contadas automaticamente.</li>
          </ol>
          <p className="mt-1 text-xs text-slate-400">
            A segurança é validada automaticamente (assinatura do Bling). Se “Saídas
            registradas” continuar em 0 após algumas vendas, me avise que eu ajusto.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-800">
        {formatInt(value)}
      </div>
    </div>
  );
}
