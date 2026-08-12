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
  defasado: boolean;
  faltam_componentes: number;
  componentes: {
    sku: string;
    nome: string;
    qtd: number;
    custo_unit: number;
    preco_unit: number;
  }[];
}

export default function KitsPrecosPage() {
  const [kits, setKits] = useState<KitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyDefasados, setOnlyDefasados] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bling/kits-precos")
      .then((r) => r.json())
      .then((d) => setKits(d.kits ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kits.filter(
      (k) =>
        (!onlyDefasados || k.defasado) &&
        (q === "" ||
          k.kit_nome.toLowerCase().includes(q) ||
          k.kit_sku.toLowerCase().includes(q)),
    );
  }, [kits, query, onlyDefasados]);

  const defasados = useMemo(() => kits.filter((k) => k.defasado).length, [kits]);

  function exportCsv() {
    const head = [
      "kit_sku",
      "kit_nome",
      "custo_cadastrado",
      "custo_componentes",
      "dif_custo",
      "preco_cadastrado",
      "preco_componentes",
      "dif_preco",
      "defasado",
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [head.join(";")];
    for (const k of filtered) {
      lines.push(
        [
          k.kit_sku,
          k.kit_nome,
          k.custo_cadastrado,
          k.custo_componentes,
          k.dif_custo,
          k.preco_cadastrado,
          k.preco_componentes,
          k.dif_preco,
          k.defasado ? "SIM" : "nao",
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
            Soma o <b>custo</b> e o <b>preço de venda</b> dos itens de cada kit (o que
            ele <b>deveria</b> custar/vender) e compara com o valor <b>cadastrado</b> no
            kit. Kits <b>defasados</b> = preço do kit diferente da soma dos itens
            (ex.: mudou o preço da prata e o kit não foi atualizado).
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
            checked={onlyDefasados}
            onChange={(e) => setOnlyDefasados(e.target.checked)}
            className="accent-brand"
          />
          Só defasados
        </label>
      </div>

      {!loading && (
        <p className="mb-3 text-sm text-slate-500">
          <b className="text-slate-700">{formatInt(defasados)}</b> kits defasados de{" "}
          {formatInt(kits.length)} no total.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Kit</th>
              <th className="px-4 py-3 text-right font-medium">Custo cadastrado</th>
              <th className="px-4 py-3 text-right font-medium">Custo dos itens</th>
              <th className="px-4 py-3 text-right font-medium">Venda cadastrada</th>
              <th className="px-4 py-3 text-right font-medium">Venda dos itens</th>
              <th className="px-4 py-3 text-right font-medium">Diferença</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => {
              const aberta = aberto === k.kit_sku;
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
                        {k.faltam_componentes > 0 && (
                          <span className="ml-2 text-amber-600">
                            ⚠ {k.faltam_componentes} item(ns) fora do cadastro
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {k.custo_cadastrado > 0 ? formatBRL(k.custo_cadastrado) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatBRL(k.custo_componentes)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {k.preco_cadastrado > 0 ? formatBRL(k.preco_cadastrado) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatBRL(k.preco_componentes)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold tabular-nums ${
                        k.defasado ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {k.dif_preco === 0
                        ? "ok"
                        : `${k.dif_preco > 0 ? "+" : ""}${formatBRL(k.dif_preco)}`}
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
      </div>
    </div>
  );
}
