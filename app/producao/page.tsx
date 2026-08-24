"use client";

import { useEffect, useRef, useState } from "react";
import { formatInt } from "@/lib/format";

interface Item {
  sku: string;
  name: string;
  inProduction: number;
  matched?: boolean;
}

export default function ProducaoPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [totalUnits, setTotalUnits] = useState(0);
  const [semCadastro, setSemCadastro] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastImportedAt, setLastImportedAt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    fetch("/api/production")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setTotalUnits(d.totalUnits ?? 0);
        setSemCadastro(d.semCadastro ?? 0);
        setLastImportedAt(d.lastImportedAt ?? null);
      })
      .catch(() => setMsg("Não foi possível carregar."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function importFile(file: File) {
    setImporting(true);
    setMsg("Lendo a planilha…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/production", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar.");
      setMsg(
        `Importado: ${formatInt(d.count)} produtos, ${formatInt(d.totalUnits)} unidades em produção.`,
      );
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearAll() {
    if (!confirm("Zerar tudo que está em produção?")) return;
    await fetch("/api/production", { method: "DELETE" });
    setMsg("Produção zerada.");
    load();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Em produção</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Importe o que está <b>em produção no fornecedor</b>. Essas quantidades
            são <b>somadas ao estoque</b> na hora de calcular a compra — assim o
            sistema não sugere comprar o que já está a caminho.
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
            {items.length > 0 && (
              <button
                onClick={clearAll}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400"
              >
                Zerar
              </button>
            )}
          </div>
          <a
            href="/modelo-em-producao.xlsx"
            download
            className="text-xs text-brand hover:underline"
          >
            Baixar modelo da planilha
          </a>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      </header>

      <div className="mb-4 rounded-xl border border-brand-light/60 bg-brand-tint/50 px-4 py-3 text-sm text-slate-600">
        <b>Como montar a planilha:</b> uma coluna <b>SKU</b> (ou Código) e uma
        coluna <b>Quantidade</b> (ou “Em produção”). Cada importação substitui a
        anterior — é uma foto do que está em produção agora. Use o{" "}
        <b>modelo</b> acima para começar.
      </div>

      {semCadastro > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <b>Atenção:</b> {formatInt(semCadastro)} SKU(s) da planilha{" "}
          <b>não têm produto ativo no cadastro</b> (aparecem em laranja abaixo).
          Esses <b>não são somados ao estoque</b> no cálculo da compra. Costuma
          ser SKU digitado diferente do Bling, produto inativo, ou o cadastro de
          produtos ainda não sincronizado. Confira o código ou sincronize os
          produtos.
        </div>
      )}

      {/* Resumo */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Produtos em produção
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
            {formatInt(items.length)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Unidades em produção
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">
            {formatInt(totalUnits)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Última importação
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-800">
            {lastImportedAt
              ? new Date(lastImportedAt).toLocaleString("pt-BR")
              : "—"}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 text-right font-medium">Em produção</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.sku}
                className={`border-b border-slate-50 ${it.matched === false ? "bg-amber-50" : ""}`}
              >
                <td className="px-4 py-3">
                  <div
                    className={`font-medium ${it.matched === false ? "text-amber-700" : "text-slate-800"}`}
                  >
                    {it.name || it.sku}
                  </div>
                  <div className="text-xs text-slate-400">{it.sku}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">
                  {formatInt(it.inProduction)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && items.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Nada em produção. Clique em <b>Importar planilha</b> para adicionar.
          </div>
        )}
        {loading && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Carregando…</div>
        )}
      </div>
    </div>
  );
}
