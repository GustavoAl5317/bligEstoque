"use client";

import { useEffect, useState } from "react";
import type { Supplier } from "@/lib/bling/types";
import type { SuggestionResult } from "@/lib/calc/replenishment";
import { FilterForm, type FilterState } from "@/components/FilterForm";
import { ResultsTable } from "@/components/ResultsTable";

interface Metadata {
  source: "mock" | "bling";
  suppliers: Supplier[];
  curves: string[];
  productCount: number;
}

const initialFilters: FilterState = {
  supplierIds: [],
  curves: [],
  coverageDays: 60,
  safetyFactor: 0,
  leadTimeOverrideDays: "",
};

export default function Home() {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metadata")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError("Não foi possível carregar os dados iniciais."));
  }, []);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierIds: filters.supplierIds,
          curves: filters.curves,
          coverageDays: filters.coverageDays,
          safetyFactor: filters.safetyFactor,
          leadTimeOverrideDays:
            filters.leadTimeOverrideDays === ""
              ? null
              : Number(filters.leadTimeOverrideDays),
        }),
      });
      setResult((await res.json()) as SuggestionResult);
    } catch {
      setError("Erro ao gerar o relatório.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reposição de Estoque
          </h1>
          <p className="text-sm text-slate-500">
            Sugestão de compra por produto, integrada ao Bling.
          </p>
        </div>
        {meta && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              meta.source === "bling"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {meta.source === "bling"
              ? "Conectado ao Bling"
              : "Dados de exemplo (mock)"}
          </span>
        )}
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <FilterForm
        suppliers={meta?.suppliers ?? []}
        curves={meta?.curves ?? []}
        value={filters}
        onChange={setFilters}
        onSubmit={generate}
        loading={loading}
      />

      <div className="mt-8">
        <ResultsTable result={result} />
      </div>
    </div>
  );
}
