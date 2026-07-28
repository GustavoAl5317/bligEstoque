"use client";

import type { Supplier } from "@/lib/bling/types";

export interface FilterState {
  supplierIds: string[];
  curves: string[];
  coverageDays: number;
  safetyFactor: number;
  /** Vazio = usa o prazo do fornecedor. */
  leadTimeOverrideDays: number | "";
}

interface Props {
  suppliers: Supplier[];
  curves: string[];
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
  value,
  onChange,
  onSubmit,
  loading,
}: Props) {
  function toggleSupplier(id: string) {
    const set = new Set(value.supplierIds);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange({ ...value, supplierIds: [...set] });
  }

  function toggleCurve(c: string) {
    const set = new Set(value.curves);
    set.has(c) ? set.delete(c) : set.add(c);
    onChange({ ...value, curves: [...set] });
  }

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
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">
            Fornecedor
          </legend>
          <div className="flex flex-wrap gap-2">
            {suppliers.length === 0 && (
              <span className="text-sm text-slate-400">Carregando…</span>
            )}
            {suppliers.map((s) => {
              const active = value.supplierIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSupplier(s.id)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {s.name}
                  <span className="ml-1 text-xs opacity-70">
                    {s.leadTimeDays}d
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Nenhum selecionado = todos.
          </p>
        </fieldset>

        {/* Curva ABC */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">
            Classificação (Curva ABC)
          </legend>
          <div className="flex flex-wrap gap-2">
            {curves.map((c) => {
              const active = value.curves.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCurve(c)}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Nenhum selecionado = todas.
          </p>
        </fieldset>

        {/* Cobertura desejada */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Cobertura desejada (dias)
          </label>
          <input
            type="number"
            min={1}
            value={value.coverageDays}
            onChange={(e) =>
              onChange({ ...value, coverageDays: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Por quantos dias o pedido deve durar.
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
                      ? "border-slate-900 bg-slate-900 text-white"
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
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Calculando…" : "Gerar relatório"}
        </button>
      </div>
    </form>
  );
}
