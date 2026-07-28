"use client";

import type { SuggestionResult, SuggestionRow } from "@/lib/calc/replenishment";
import { formatBRL, formatInt } from "@/lib/format";

interface Props {
  result: SuggestionResult | null;
}

const CURVE_COLOR: Record<string, string> = {
  A: "bg-rose-100 text-rose-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-slate-100 text-slate-600",
};

function toCsv(rows: SuggestionRow[]): string {
  const header = [
    "SKU",
    "Produto",
    "Fornecedor",
    "Curva",
    "Estoque atual",
    "Consumo mensal",
    "Prazo (dias)",
    "Estoque seguranca",
    "Qtd sugerida",
    "Custo unit",
    "Custo total",
  ];
  const lines = rows.map((r) =>
    [
      r.sku,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${r.supplierName.replace(/"/g, '""')}"`,
      r.curve,
      r.currentStock,
      r.monthlyConsumption,
      r.leadTimeDays,
      r.safetyStock,
      r.suggestedQty,
      r.cost.toFixed(2).replace(".", ","),
      r.totalCost.toFixed(2).replace(".", ","),
    ].join(";"),
  );
  return [header.join(";"), ...lines].join("\n");
}

function download(result: SuggestionResult) {
  const csv = "﻿" + toCsv(result.rows); // BOM p/ acentos no Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reposicao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ResultsTable({ result }: Props) {
  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-400">
        Ajuste os filtros e clique em <b>Gerar relatório</b> para ver as
        sugestões de compra.
      </div>
    );
  }

  const { rows, totals } = result;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <Stat label="Itens a comprar" value={formatInt(totals.items)} />
          <Stat label="Unidades" value={formatInt(totals.units)} />
          <Stat label="Custo estimado" value={formatBRL(totals.cost)} />
        </div>
        <button
          onClick={() => download(result)}
          disabled={rows.length === 0}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
        >
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 text-center font-medium">Curva</th>
              <th className="px-4 py-3 text-right font-medium">Estoque</th>
              <th className="px-4 py-3 text-right font-medium">Consumo/mês</th>
              <th className="px-4 py-3 text-right font-medium">Prazo</th>
              <th className="px-4 py-3 text-right font-medium">Sugerido</th>
              <th className="px-4 py-3 text-right font-medium">Custo total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.productId}
                className={`border-b border-slate-50 ${
                  r.suggestedQty > 0 ? "" : "opacity-50"
                }`}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.sku}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.supplierName}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                      CURVE_COLOR[r.curve] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.curve}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatInt(r.currentStock)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatInt(r.monthlyConsumption)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {r.leadTimeDays}d
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`font-semibold tabular-nums ${
                      r.suggestedQty > 0 ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {formatInt(r.suggestedQty)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {r.suggestedQty > 0 ? formatBRL(r.totalCost) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-slate-900">
        {value}
      </div>
    </div>
  );
}
