"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Option {
  id: string;
  label: string;
  /** Texto pequeno à direita (ex.: prazo do fornecedor, SKU). */
  hint?: string;
}

interface Props {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Texto quando nada está selecionado (ex.: "Todos os fornecedores"). */
  allLabel: string;
  /** Mostra campo de busca dentro do dropdown. */
  searchable?: boolean;
  placeholder?: string;
  /** Máximo de itens renderizados por vez (para listas grandes). */
  maxRender?: number;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  searchable = true,
  placeholder = "Buscar…",
  maxRender = 80,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const labelById = useMemo(
    () => new Map(options.map((o) => [o.id, o.label])),
    [options],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        (o.hint ?? "").toLowerCase().includes(term),
    );
  }, [options, q]);

  const shown = filtered.slice(0, maxRender);

  function toggle(id: string) {
    const set = new Set(selected);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange([...set]);
  }

  /** Marca todos os itens que estão no filtro atual (soma à seleção existente). */
  function selectAllFiltered() {
    const set = new Set(selected);
    for (const o of filtered) set.add(o.id);
    onChange([...set]);
  }

  const hasQuery = q.trim() !== "";

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? labelById.get(selected[0]) ?? "1 selecionado"
        : `${selected.length} selecionados`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm outline-none transition hover:border-slate-400 focus:border-brand"
      >
        <span className={selected.length === 0 ? "text-slate-500" : "text-slate-800"}>
          {summary}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white shadow-lg">
          {searchable && (
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs font-medium text-brand hover:underline"
              >
                {hasQuery
                  ? `Selecionar todos (${filtered.length})`
                  : "Selecionar todos"}
              </button>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Limpar seleção
                </button>
              )}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && (
              <p className="px-3 py-3 text-center text-sm text-slate-400">
                Nada encontrado.
              </p>
            )}
            {shown.map((o) => {
              const active = selected.includes(o.id);
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(o.id)}
                    className="accent-brand"
                  />
                  <span className="flex-1 text-slate-700">{o.label}</span>
                  {o.hint && (
                    <span className="text-xs text-slate-400">{o.hint}</span>
                  )}
                </label>
              );
            })}
            {filtered.length > shown.length && (
              <p className="px-3 py-2 text-center text-xs text-slate-400">
                Mostrando {shown.length} de {filtered.length}. Refine a busca para
                ver mais.
              </p>
            )}
          </div>

          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
              <span className="text-xs text-slate-500">
                {selected.length} selecionado(s)
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-brand hover:underline"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
