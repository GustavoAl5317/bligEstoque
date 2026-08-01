"use client";

import { useEffect, useMemo, useState } from "react";
import type { SuggestionResult, SuggestionRow } from "@/lib/calc/replenishment";
import { formatBRL, formatInt } from "@/lib/format";

interface Props {
  result: SuggestionResult | null;
}

const CURVE_COLOR: Record<string, string> = {
  A: "bg-green-600 text-white",
  AB: "bg-green-200 text-green-900",
  B: "bg-amber-400 text-amber-950",
  BC: "bg-amber-100 text-amber-800",
  C: "bg-red-600 text-white",
  D: "bg-red-200 text-red-900",
  New: "bg-blue-500 text-white",
};

// ── Definição das colunas exportáveis ──────────────────────────────────────

interface ColDef {
  id: string;
  label: string;
  /** Retorna a string bruta (sem aspas) para o CSV. */
  value: (r: SuggestionRow) => string;
  /** Se true, envolve em aspas ao exportar. */
  quote?: boolean;
}

const ALL_COLUMNS: ColDef[] = [
  { id: "sku", label: "SKU", value: (r) => r.sku },
  { id: "name", label: "Produto", value: (r) => r.name, quote: true },
  { id: "supplier", label: "Fornecedor", value: (r) => r.supplierName, quote: true },
  {
    id: "supplierCode",
    label: "Código no Fornecedor",
    value: (r) => r.supplierCode,
    quote: true,
  },
  {
    id: "supplierDesc",
    label: "Descrição no Fornecedor",
    value: (r) => r.supplierDesc,
    quote: true,
  },
  { id: "curve", label: "Curva", value: (r) => r.curve },
  {
    id: "stock",
    label: "Estoque considerado",
    value: (r) => String(r.currentStock),
  },
  {
    id: "consumption",
    label: "Consumo mensal",
    value: (r) => String(r.monthlyConsumption),
  },
  {
    id: "markup",
    label: "Markup",
    value: (r) =>
      r.markup != null ? r.markup.toFixed(2).replace(".", ",") : "",
  },
  {
    id: "stockDuration",
    label: "Duração estoque (dias)",
    value: (r) =>
      r.stockDurationDays != null ? String(r.stockDurationDays) : "",
  },
  {
    id: "suggestedQty",
    label: "Qtd sugerida",
    value: (r) => String(r.suggestedQty),
  },
  {
    id: "cost",
    label: "Custo unit.",
    value: (r) => r.cost.toFixed(2).replace(".", ","),
  },
  {
    id: "totalCost",
    label: "Custo total",
    value: (r) => r.totalCost.toFixed(2).replace(".", ","),
  },
];

/** IDs selecionados por padrão (todas as colunas). */
const DEFAULT_SELECTED = ALL_COLUMNS.map((c) => c.id);

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function buildCsv(rows: SuggestionRow[], colIds: string[]): string {
  const cols = ALL_COLUMNS.filter((c) => colIds.includes(c.id));
  const header = cols.map((c) => c.label).join(";");
  const lines = rows.map((r) =>
    cols
      .map((c) => {
        const raw = c.value(r);
        return c.quote ? csvCell(raw) : raw;
      })
      .join(";"),
  );
  return [header, ...lines].join("\n");
}

function download(rows: SuggestionRow[], colIds: string[]) {
  const csv = "\uFEFF" + buildCsv(rows, colIds); // BOM p/ acentos no Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reposicao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modal de seleção de colunas ────────────────────────────────────────────

interface ExportModalProps {
  /** Linhas já filtradas pelos produtos que a pessoa marcou na tabela. */
  rows: SuggestionRow[];
  onClose: () => void;
}

function ExportModal({ rows, onClose }: ExportModalProps) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setSelected(
      selected.length === ALL_COLUMNS.length ? [] : ALL_COLUMNS.map((c) => c.id),
    );
  }

  // Mantém a ordem original das colunas ao exportar
  const orderedSelected = ALL_COLUMNS.filter((c) => selected.includes(c.id)).map(
    (c) => c.id,
  );

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Exportar planilha
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {rows.length} produto{rows.length !== 1 ? "s" : ""} selecionado
              {rows.length !== 1 ? "s" : ""}. Escolha as colunas do arquivo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        {/* Lista de colunas */}
        <div className="px-6 py-4">
          {/* Selecionar / desmarcar todos */}
          <button
            onClick={toggleAll}
            className="mb-3 text-xs font-medium text-brand hover:underline"
          >
            {selected.length === ALL_COLUMNS.length
              ? "Desmarcar todas"
              : "Selecionar todas"}
          </button>

          <div className="grid grid-cols-1 gap-1.5">
            {ALL_COLUMNS.map((col) => {
              const checked = selected.includes(col.id);
              return (
                <label
                  key={col.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                    checked
                      ? "border-brand bg-brand-tint/60 text-brand-dark"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(col.id)}
                    className="accent-brand"
                  />
                  <span className="text-sm">{col.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <span className="text-xs text-slate-400">
            {selected.length} coluna{selected.length !== 1 ? "s" : ""} selecionada
            {selected.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-400"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                download(rows, orderedSelected);
                onClose();
              }}
              disabled={selected.length === 0 || rows.length === 0}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              Baixar CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tabela principal ───────────────────────────────────────────────────────

export function ResultsTable({ result }: Props) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const rows = result?.rows ?? [];

  // Ao gerar um novo relatório, marca todos os produtos por padrão.
  useEffect(() => {
    setSelectedIds(new Set(rows.map((r) => r.productId)));
  }, [result]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.productId)),
    [rows, selectedIds],
  );

  function toggleRow(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAllRows() {
    setSelectedIds((s) =>
      s.size === rows.length ? new Set() : new Set(rows.map((r) => r.productId)),
    );
  }
  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-400">
        Ajuste os filtros e clique em <b>Gerar relatório</b> para ver as
        sugestões de compra.
      </div>
    );
  }

  const { totals } = result;

  return (
    <>
      {showExportModal && (
        <ExportModal rows={selectedRows} onClose={() => setShowExportModal(false)} />
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <Stat label="Itens a comprar" value={formatInt(totals.items)} />
            <Stat label="Unidades" value={formatInt(totals.units)} />
            <Stat label="Custo estimado" value={formatBRL(totals.cost)} />
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={selectedRows.length === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
          >
            Exportar CSV ({formatInt(selectedRows.length)})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAllRows}
                    className="accent-brand"
                    title="Marcar/desmarcar todos"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Produto</th>
                <th className="px-4 py-3 font-medium">Fornecedor</th>
                <th className="px-4 py-3 text-center font-medium">Curva</th>
                <th className="px-4 py-3 text-right font-medium">Estoque</th>
                <th className="px-4 py-3 text-right font-medium">Consumo/mês</th>
                <th className="px-4 py-3 text-right font-medium">Markup</th>
                <th className="px-4 py-3 text-right font-medium">Duração</th>
                <th className="px-4 py-3 text-right font-medium">Sugerido</th>
                <th className="px-4 py-3 text-right font-medium">Custo total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.productId}
                  className={`border-b border-slate-50 ${
                    selectedIds.has(r.productId) ? "" : "opacity-40"
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.productId)}
                      onChange={() => toggleRow(r.productId)}
                      className="accent-brand"
                    />
                  </td>
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
                      {r.curve || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatInt(r.currentStock)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatInt(r.monthlyConsumption)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {r.markup != null ? `${r.markup.toFixed(2)}×` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {r.stockDurationDays != null
                      ? `${formatInt(r.stockDurationDays)}d`
                      : "—"}
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
    </>
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
