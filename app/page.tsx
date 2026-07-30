"use client";

import { useEffect, useState } from "react";
import type { Supplier } from "@/lib/bling/types";
import type { SuggestionResult } from "@/lib/calc/replenishment";
import {
  FilterForm,
  type FilterState,
  type ProductOption,
} from "@/components/FilterForm";
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
  productSkus: [],
  coverageDays: 30,
  safetyPercent: "",
  leadTimeOverrideDays: "",
};

export default function Home() {
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/metadata")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setError("Não foi possível carregar os dados iniciais."));
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) =>
        setProducts(
          (d.products ?? []).map((p: { sku: string; name: string }) => ({
            sku: p.sku,
            name: p.name,
          })),
        ),
      )
      .catch(() => {});
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
          productSkus: filters.productSkus,
          coverageDays: filters.coverageDays === "" ? 30 : Number(filters.coverageDays),
          coverageByCurve: {},
          safetyPercent:
            filters.safetyPercent === "" ? 0 : Number(filters.safetyPercent),
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

      <details className="mb-6 rounded-xl border border-brand-light/60 bg-brand-tint/60 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-brand-dark">
          Como o sistema decide quanto comprar?
        </summary>
        <div className="mt-3 space-y-2 text-slate-600">
          <p>
            Para cada produto, o sistema olha <b>quanto você vende por mês</b>,{" "}
            <b>quanto já tem em estoque</b> e <b>quanto o fornecedor demora</b>{" "}
            para entregar.
          </p>
          <p>
            Com os filtros abaixo você diz por <b>quantos dias</b> quer que a
            compra dure (cobertura) e se quer uma <b>folga de segurança</b> para
            não faltar. O sistema calcula a quantidade ideal e mostra o custo.
          </p>
          <p className="text-slate-400">
            Fórmula: (venda diária × cobertura) − o que sobra no estoque quando o
            pedido chegar.
          </p>
        </div>
      </details>

      <FilterForm
        suppliers={meta?.suppliers ?? []}
        curves={meta?.curves ?? []}
        products={products}
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
