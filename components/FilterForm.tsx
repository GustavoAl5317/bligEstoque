"use client";

import type { Supplier } from "@/lib/bling/types";
import { MultiSelect, type Option } from "@/components/MultiSelect";

export interface FilterState {
  supplierIds: string[];
  curves: string[];
  /** SKUs de produtos específicos. Vazio = todos. */
  productSkus: string[];
  coverageDays: number;
  /** Cobertura (dias) por curva — ex.: A=60, B=30, C=30. */
  coverageByCurve: Record<string, number>;
  safetyFactor: number;
  /** Vazio = usa o prazo do fornecedor. */
  leadTimeOverrideDays: number | "";
}

/** Produto para o seletor de produtos. */
export interface ProductOption {
  sku: string;
  name: string;
}

interface Props {
  suppliers: Supplier[];
  curves: string[];
  products: ProductOption[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onSubmit: () => void;
  loading: boolean;
}

const SAFETY_OPTIONS = [
  { value: 0, label: "Nenhum (0σ)" },
  { value: 1, label: "Baixo (1σ · ~84%)" },
  { value: 1.65, label: "Médio (1,65σ · ~95%)" },
  { value: 2.33, label: "Alto (2,33σ · ~99%)" },
];

export function FilterForm({
  suppliers,
  curves,
  products,
  value,
  onChange,
  onSubmit,
  loading,
}: Props) {
  const supplierOptions: Option[] = suppliers.map((s) => ({
    id: s.id,
    label: s.name,
    hint: `${s.leadTimeDays}d`,
  }));
  const curveOptions: Option[] = curves.map((c) => ({ id: c, label: `Curva ${c}` }));
  const productOptions: Option[] = products.map((p) => ({
    id: p.sku,
    label: p.name,
    hint: p.sku,
  }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Filtros
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Fornecedores */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Fornecedor
          </label>
          <MultiSelect
            options={supplierOptions}
            selected={value.supplierIds}
            onChange={(ids) => onChange({ ...value, supplierIds: ids })}
            allLabel="Todos os fornecedores"
            placeholder="Buscar fornecedor…"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Nenhum selecionado = todos.
          </p>
        </div>

        {/* Curva ABC */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Classificação (Curva ABC)
          </label>
          <MultiSelect
            options={curveOptions}
            selected={value.curves}
            onChange={(cs) => onChange({ ...value, curves: cs })}
            allLabel="Todas as curvas"
            searchable={false}
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Nenhum selecionado = todas.
          </p>
        </div>

        {/* Produtos específicos */}
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Produtos específicos (opcional)
          </label>
          <MultiSelect
            options={productOptions}
            selected={value.productSkus}
            onChange={(skus) => onChange({ ...value, productSkus: skus })}
            allLabel="Todos os produtos"
            placeholder="Buscar produto por nome ou SKU…"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Deixe vazio para incluir todos. Escolha aqui se quiser um relatório só
            de alguns produtos.
          </p>
        </div>

        {/* Cobertura por curva */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Cobertura desejada (dias) — por curva
          </label>
          <div className="flex flex-wrap gap-3">
            {(["A", "B", "C"] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-slate-500">{c}</span>
                <input
                  type="number"
                  min={1}
                  value={value.coverageByCurve[c] ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      coverageByCurve: {
                        ...value.coverageByCurve,
                        [c]: Number(e.target.value),
                      },
                    })
                  }
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Quantos dias o pedido deve durar em cada curva (ex.: A=60, B=30, C=30).
          </p>
        </div>

        {/* Prazo de produção override */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Prazo de produção (dias)
          </label>
          <input
            type="number"
            min={0}
            placeholder="Usar prazo do fornecedor"
            value={value.leadTimeOverrideDays}
            onChange={(e) =>
              onChange({
                ...value,
                leadTimeOverrideDays:
                  e.target.value === "" ? "" : Number(e.target.value),
              })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Em branco = usa o prazo cadastrado de cada fornecedor.
          </p>
        </div>

        {/* Fator de segurança */}
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Fator de segurança (desvio padrão)
          </label>
          <div className="flex flex-wrap gap-2">
            {SAFETY_OPTIONS.map((opt) => {
              const active = value.safetyFactor === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...value, safetyFactor: opt.value })}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-brand bg-brand text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "Calculando…" : "Gerar relatório"}
        </button>
      </div>
    </form>
  );
}
