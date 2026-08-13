"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { formatBRL, formatInt } from "@/lib/format";

interface KitRow {
  kit_sku: string;
  kit_nome: string;
  custo_cadastrado: number;
  custo_componentes: number;
  dif_custo: number;
  preco_cadastrado: number;
  preco_componentes: number;
  dif_preco: number;
  dif_preco_pct: number | null;
  markup_kit: number | null;
  abaixo_do_custo: boolean;
  faltam_componentes: number;
  componentes: {
    sku: string;
    nome: string;
    qtd: number;
    custo_unit: number;
    preco_unit: number;
  }[];
}

const PAGE_SIZE = 100;

export default function KitsPrecosPage() {
  const [kits, setKits] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyAtencao, setOnlyAtencao] = useState(true);
  // Diferença mínima (%) pra considerar o preço do kit "fora" da soma dos itens.
  const [limitePct, setLimitePct] = useState(10);
  const [aberto, setAberto] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/bling/kits-precos")
      .then((r) => r.json())
      .then((d) => setKits(d.kits ?? []))
      .finally(() => setLoading(false));
  }, []);

  // "Atenção" = vende abaixo do custo (grave) OU preço bem diferente da soma.
  function temAtencao(k: KitRow) {
    if (k.abaixo_do_custo) return true;
    return k.dif_preco_pct != null && Math.abs(k.dif_preco_pct) >= limitePct;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kits.filter(
      (k) =>
        (!onlyAtencao || temAtencao(k)) &&
        (q === "" ||
          k.kit_nome.toLowerCase().includes(q) ||
          k.kit_sku.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kits, query, onlyAtencao, limitePct]);

  useEffect(() => setPage(1), [query, onlyAtencao, limitePct]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const abaixoCusto = useMemo(
    () => kits.filter((k) => k.abaixo_do_custo).length,
    [kits],
  );

  function exportCsv() {
    const head = [
      "kit_sku",
      "kit_nome",
      "custo_componentes",
      "preco_cadastrado",
      "markup_kit",
      "preco_componentes",
      "dif_preco",
      "dif_preco_pct",
      "vende_abaixo_do_custo",
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [head.join(";")];
    for (const k of filtered) {
      lines.push(
        [
          k.kit_sku,
          k.kit_nome,
          k.custo_componentes,
          k.preco_cadastrado,
          k.markup_kit ?? "",
          k.preco_componentes,
          k.dif_preco,
          k.dif_preco_pct ?? "",
          k.abaixo_do_custo ? "SIM" : "nao",
        ]
          .map(esc)
          .join(";"),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kits-precos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Preços dos kits</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Soma o <b>custo</b> e a <b>venda</b> dos itens de cada kit e compara com o
            preço <b>cadastrado</b> no kit. O <b>markup</b> (venda ÷ custo dos itens) é
            o que despenca quando as peças sobem de preço e o kit não é atualizado —
            fique de olho nos que <b className="text-red-600">vendem abaixo do custo</b>.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-tint disabled:opacity-50"
        >
          Exportar CSV
        </button>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar kit por nome ou SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyAtencao}
            onChange={(e) => setOnlyAtencao(e.target.checked)}
            className="accent-brand"
          />
          Só com atenção
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          Diferença ≥
          <input
            type="number"
            min={0}
            max={100}
            value={limitePct}
            onChange={(e) => setLimitePct(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 rounded border border-slate-200 px-1 py-0.5 text-right tabular-nums outline-none focus:border-brand"
          />
          %
        </label>
      </div>

      {!loading && (
        <p className="mb-3 text-sm text-slate-500">
          <b className="text-red-600">{formatInt(abaixoCusto)}</b> kits vendendo{" "}
          <b>abaixo do custo</b> · {formatInt(kits.length)} kits no total.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Kit</th>
              <th className="px-4 py-3 text-right font-medium">Custo dos itens</th>
              <th className="px-4 py-3 text-right font-medium">Venda dos itens</th>
              <th className="px-4 py-3 text-right font-medium">Markup</th>
              <th className="px-4 py-3 text-right font-medium">Preço venda</th>
              <th className="px-4 py-3 text-right font-medium">Dif. %</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((k) => {
              const aberta = aberto === k.kit_sku;
              const markupCor = k.abaixo_do_custo
                ? "text-red-600"
                : k.markup_kit != null && k.markup_kit < 1.5
                  ? "text-amber-600"
                  : "text-slate-600";
              return (
                <Fragment key={k.kit_sku}>
                  <tr
                    onClick={() => setAberto(aberta ? null : k.kit_sku)}
                    className="cursor-pointer border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{k.kit_nome}</div>
                      <div className="text-xs text-slate-400">
                        {k.kit_sku}
                        {k.abaixo_do_custo && (
                          <span className="ml-2 font-semibold text-red-600">
                            vende abaixo do custo
                          </span>
                        )}
                        {k.faltam_componentes > 0 && (
                          <span className="ml-2 text-amber-600">
                            ⚠ {k.faltam_componentes} item(ns) fora do cadastro
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatBRL(k.custo_componentes)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatBRL(k.preco_componentes)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${markupCor}`}>
                      {k.markup_kit != null ? `${k.markup_kit.toFixed(2)}×` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {k.preco_cadastrado > 0 ? formatBRL(k.preco_cadastrado) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {k.dif_preco_pct != null
                        ? `${k.dif_preco_pct > 0 ? "+" : ""}${k.dif_preco_pct.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">
                      {aberta ? "▲" : "▼ itens"}
                    </td>
                  </tr>
                  {aberta && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Composição
                        </div>
                        <table className="mt-2 w-full text-sm">
                          <tbody>
                            {k.componentes.map((c) => (
                              <tr key={c.sku} className="border-b border-slate-100">
                                <td className="py-1.5 text-slate-700">{c.nome}</td>
                                <td className="py-1.5 text-xs text-slate-400">{c.sku}</td>
                                <td className="py-1.5 text-right tabular-nums text-slate-500">
                                  {c.qtd}×
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">
                                  custo {formatBRL(c.custo_unit)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">
                                  venda {formatBRL(c.preco_unit)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {loading && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Carregando…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Nenhum kit encontrado. Se a lista estiver vazia, rode a{" "}
            <b>sincronização da composição dos kits</b> na tela Conexão.
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>
              {formatInt((page - 1) * PAGE_SIZE + 1)}–
              {formatInt(Math.min(page * PAGE_SIZE, filtered.length))} de{" "}
              {formatInt(filtered.length)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 transition hover:border-slate-400 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 transition hover:border-slate-400 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
