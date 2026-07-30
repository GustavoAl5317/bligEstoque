"use client";

import { useMemo } from "react";
import { type Supplier } from "@/lib/bling/types";
import { MultiSelect, type Option } from "@/components/MultiSelect";

export interface FilterState {
  supplierIds: string[];
  curves: string[];
  /** SKUs de produtos específicos. Vazio = todos. */
  productSkus: string[];
  /** Cobertura desejada de estoque, em dias. */
  coverageDays: number | "";
  /** Fator de segurança em % (opcional). Vazio = sem folga. */
  safetyPercent: number | "";
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

export function FilterForm({
  suppliers,
  curves,
  products,
  value,
  onChange,
  onSubmit,
  loading,
}: Props) {
  // Memorizados: sem isso, as listas (4.685 produtos) seriam recriadas a cada
  // tecla e o dropdown "engasgaria" ao digitar.
  const supplierOptions: Option[] = useMemo(
    () => suppliers.map((s) => ({ id: s.id, label: s.name, hint: `${s.leadTimeDays}d` })),
    [suppliers],
  );
  const curveOptions: Option[] = useMemo(
    () => curves.map((c) => ({ id: c, label: `Curva ${c}` })),
    [curves],
  );
  const productOptions: Option[] = useMemo(
    () => products.map((p) => ({ id: p.sku, label: p.name, hint: p.sku })),
    [products],
  );

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

        {/* Prazo de produção (ESQUERDA) */}
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Em branco = usa o prazo cadastrado de cada fornecedor.
          </p>
        </div>

        {/* Cobertura desejada (DIREITA) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Cobertura desejada (dias)
          </label>
          <input
            type="number"
            min={1}
            placeholder="Ex.: 30"
            value={value.coverageDays}
            onChange={(e) =>
              onChange({
                ...value,
                coverageDays: e.target.value === "" ? "" : Number(e.target.value),
              })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Quantos dias o pedido deve cobrir (ex.: 30 = um mês de estoque).
          </p>
        </div>

        {/* Fator de segurança — % opcional */}
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Fator de segurança (%) — opcional
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={value.safetyPercent}
              onChange={(e) =>
                onChange({
                  ...value,
                  safetyPercent: e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <span className="text-sm text-slate-500">% de folga sobre a cobertura</span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Compra um pouco a mais para não faltar. Ex.: 10% = 10% acima do necessário.
            Deixe vazio para não usar.
          </p>
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
