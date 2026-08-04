"use client";

import { useMemo } from "react";
import { type Supplier } from "@/lib/bling/types";
import { MultiSelect, type Option } from "@/components/MultiSelect";

export interface FilterState {
  supplierIds: string[];
  curves: string[];
  /** SKUs de produtos específicos. Vazio = todos. */
  productSkus: string[];
  /** Cobertura desejada de estoque, em dias (fallback quando não há por curva). */
  coverageDays: number | "";
  /** Cobertura (dias) por curva — ex.: A=60, AB=45, B=30. */
  coverageByCurve: Record<string, number>;
  /** Período do consumo: 1 (mês atual), 3, 6 ou 12 meses. */
  consumptionMonths: number;
  /** Fator de segurança em % (opcional). Vazio = sem folga. */
  safetyPercent: number | "";
  /** Considerar o que está "em produção" (soma ao estoque no cálculo). */
  includeProduction: boolean;
  /** Mostrar kits (produtos com composição). Padrão: escondidos na reposição. */
  showKits: boolean;
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

        {/* Período do consumo */}
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Período do consumo
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { v: 1, label: "Mês atual" },
              { v: 3, label: "Últimos 3 meses" },
              { v: 6, label: "Últimos 6 meses" },
              { v: 12, label: "Últimos 12 meses" },
            ].map((opt) => {
              const active = value.consumptionMonths === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => onChange({ ...value, consumptionMonths: opt.v })}
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
          <p className="mt-1.5 text-xs text-slate-400">
            Sobre quantos meses calcular a média de consumo de cada item.
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
            Por quantos dias o pedido deve cobrir (ex.: 30 = um mês de estoque).
          </p>
        </div>

        {/* Fator de segurança — % opcional */}
        <div>
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

        {/* Considerar "em produção" — liga/desliga */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Considerar produtos em produção
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={value.includeProduction}
              onClick={() =>
                onChange({ ...value, includeProduction: !value.includeProduction })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                value.includeProduction ? "bg-brand" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  value.includeProduction ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm text-slate-600">
              {value.includeProduction ? "Ligado" : "Desligado"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Ligado: soma o que está em produção ao estoque. Desligue se você já lança a
            produção no Bling (para não contar duas vezes).
          </p>
        </div>

        {/* Mostrar kits — liga/desliga (padrão: escondidos) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Mostrar kits (produtos com composição)
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={value.showKits}
              onClick={() => onChange({ ...value, showKits: !value.showKits })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                value.showKits ? "bg-brand" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  value.showKits ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-sm text-slate-600">
              {value.showKits ? "Mostrando kits" : "Escondidos"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Desligado (recomendado): mostra só produtos unitários. Kit não se compra —
            você compra os itens que o formam.
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
