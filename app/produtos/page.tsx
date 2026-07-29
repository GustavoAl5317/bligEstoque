"use client";

import { useEffect, useMemo, useState } from "react";
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
const RENDER_LIMIT = 300;

const CURVE_COLOR: Record<string, string> = {
  A: "bg-rose-100 text-rose-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-slate-100 text-slate-600",
};

export default function ProdutosPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  function loadProducts() {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setRows(d.products ?? []));
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const suppliers = useMemo(
    () => [...new Set(rows.map((r) => r.supplierName).filter(Boolean))].sort(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (supplier === "" || r.supplierName === supplier) &&
          (query === "" ||
            r.name.toLowerCase().includes(query.toLowerCase()) ||
            r.sku.toLowerCase().includes(query.toLowerCase())),
      ),
    [rows, supplier, query],
  );

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      setSyncMsg("Sincronizando produtos…");
      const r1 = await fetch("/api/bling/sync", { method: "POST" });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error || "Falha ao sincronizar produtos.");

      setSyncMsg(`${d1.count} produtos. Sincronizando fornecedores…`);
      const r2 = await fetch("/api/bling/sync-suppliers", { method: "POST" });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || "Falha ao sincronizar fornecedores.");

      setSyncMsg(`${d1.count} produtos e ${d2.count} com fornecedor atualizados.`);
      loadProducts();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Falha na sincronização.");
    } finally {
      setSyncing(false);
    }
  }

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

  async function applyToFiltered(curve: ProductRow["curve"]) {
    const skus = filtered.map((r) => r.sku);
    if (skus.length === 0) return;
    const skuSet = new Set(skus);
    setRows((prev) =>
      prev.map((r) => (skuSet.has(r.sku) ? { ...r, curve } : r)),
    );
    setBulkMsg(null);
    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skus, curve }),
    });
    const d = await res.json();
    setBulkMsg(
      res.ok
        ? `Curva ${curve} aplicada a ${d.count} produtos.`
        : d.error || "Falha ao aplicar em lote.",
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Produtos e curvas
          </h1>
          <p className="text-sm text-slate-500">
            Classifique cada produto em curva A, B ou C. A escolha é salva na
            hora e vale no relatório de compra.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={sync}
            disabled={syncing}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {syncing ? "Sincronizando…" : "Sincronizar com o Bling"}
          </button>
          {syncMsg && <span className="text-xs text-slate-500">{syncMsg}</span>}
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">Todos os fornecedores</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Buscar por nome ou SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs"
        />
      </div>

      {/* Ação em lote */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-light/60 bg-brand-tint/50 px-4 py-3">
        <span className="text-sm text-slate-600">
          Aplicar curva aos{" "}
          <b>{formatInt(filtered.length)}</b> produtos{" "}
          {supplier ? `de ${supplier}` : "filtrados"}:
        </span>
        <div className="flex gap-1.5">
          {CURVES.map((c) => (
            <button
              key={c}
              onClick={() => applyToFiltered(c)}
              className={`h-8 rounded-lg px-3 text-sm font-semibold transition ${CURVE_COLOR[c]} hover:ring-2 hover:ring-brand`}
            >
              {c}
            </button>
          ))}
        </div>
        {bulkMsg && <span className="text-xs text-emerald-700">{bulkMsg}</span>}
      </div>

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
            {filtered.slice(0, RENDER_LIMIT).map((r) => (
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
                              ? CURVE_COLOR[c] + " ring-2 ring-brand"
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
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Nenhum produto ainda. Clique em <b>Sincronizar com o Bling</b> para
            importar os produtos.
          </div>
        )}
        {filtered.length > RENDER_LIMIT && (
          <div className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-400">
            Mostrando os primeiros {RENDER_LIMIT} de{" "}
            {formatInt(filtered.length)}. Use o filtro de fornecedor ou a busca
            para refinar — a ação em lote acima vale para <b>todos</b> os
            filtrados.
          </div>
        )}
      </div>
    </div>
  );
}
