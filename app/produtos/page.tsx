"use client";

import { useEffect, useState } from "react";
import { formatInt } from "@/lib/format";

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  supplierName: string;
  curve: "A" | "B" | "C";
  monthlyConsumption: number;
}

const CURVES: ProductRow["curve"][] = ["A", "B", "C"];

const CURVE_COLOR: Record<string, string> = {
  A: "bg-rose-100 text-rose-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-slate-100 text-slate-600",
};

export default function ProdutosPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setRows(d.products));
  }, []);

  async function changeCurve(row: ProductRow, curve: ProductRow["curve"]) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, curve } : r)));
    await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: row.sku, curve }),
    });
    setSavedId(row.id);
    setTimeout(() => setSavedId((cur) => (cur === row.id ? null : cur)), 1500);
  }

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.sku.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Produtos e curvas
        </h1>
        <p className="text-sm text-slate-500">
          Defina a curva (A, B, C) de cada produto. A escolha é salva
          automaticamente e passa a valer no relatório de compra.
        </p>
      </header>

      <input
        type="search"
        placeholder="Buscar por nome ou SKU…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 sm:max-w-sm"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 text-right font-medium">Consumo/mês</th>
              <th className="px-4 py-3 font-medium">Curva</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.sku}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.supplierName}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {formatInt(r.monthlyConsumption)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {CURVES.map((c) => (
                        <button
                          key={c}
                          onClick={() => changeCurve(r, c)}
                          className={`h-8 w-8 rounded-lg text-sm font-semibold transition ${
                            r.curve === c
                              ? CURVE_COLOR[c] + " ring-2 ring-slate-900"
                              : "border border-slate-200 text-slate-400 hover:border-slate-400"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    {savedId === r.id && (
                      <span className="text-xs text-emerald-600">salvo ✓</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
