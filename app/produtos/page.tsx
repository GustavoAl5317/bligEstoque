"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBRL, formatInt } from "@/lib/format";
import { CURVES, type Curve } from "@/lib/bling/types";
import { useSync } from "@/components/SyncProvider";

/** "" = não classificado. */
type CurveValue = Curve | "";

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  supplierName: string;
  curve: Curve | null;
  monthlyConsumption: number;
  stock: number;
  cost: number;
  price: number;
}

const PAGE_SIZE = 100;

// Cores das curvas (forte/fraco conforme pedido da cliente).
const CURVE_META: Record<Curve, { label: string; badge: string }> = {
  A: { label: "A", badge: "bg-green-600 text-white" },
  AB: { label: "AB", badge: "bg-green-200 text-green-900" },
  B: { label: "B", badge: "bg-amber-400 text-amber-950" },
  BC: { label: "BC", badge: "bg-amber-100 text-amber-800" },
  C: { label: "C", badge: "bg-red-600 text-white" },
  D: { label: "D", badge: "bg-red-200 text-red-900" },
  New: { label: "New", badge: "bg-blue-500 text-white" },
};
const NONE_BADGE = "bg-slate-100 text-slate-500";

function curveBadge(curve: Curve | null) {
  if (!curve) return { label: "Não classif.", badge: NONE_BADGE };
  return CURVE_META[curve];
}

export default function ProdutosPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState("");
  const [supplier, setSupplier] = useState("");
  const [onlyConsumption, setOnlyConsumption] = useState(false);
  const [page, setPage] = useState(1);
  const sync = useSync();
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Alterações de curva ainda NÃO salvas (sku -> nova curva). "" = não classificado.
  const [pending, setPending] = useState<Record<string, CurveValue>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function loadProducts() {
    fetch("/api/products")
      .then((r) => r.json())
      .then((d) => setRows(d.products ?? []));
  }

  useEffect(() => {
    loadProducts();
  }, []);

  // Recarrega a lista quando uma sincronização global termina.
  useEffect(() => {
    if (sync.dataVersion > 0) loadProducts();
  }, [sync.dataVersion]);

  const suppliers = useMemo(
    () => [...new Set(rows.map((r) => r.supplierName).filter(Boolean))].sort(),
    [rows],
  );

  const withConsumption = useMemo(
    () => rows.filter((r) => r.monthlyConsumption > 0).length,
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const s = supplier.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (s === "" || r.supplierName.toLowerCase().includes(s)) &&
        (!onlyConsumption || r.monthlyConsumption > 0) &&
        (q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.sku.toLowerCase().includes(q)),
    );
  }, [rows, supplier, query, onlyConsumption]);

  useEffect(() => {
    setPage(1);
  }, [query, supplier, onlyConsumption]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingCount = Object.keys(pending).length;

  const syncMsg =
    sync.label === "Produtos e fornecedores" && sync.phase !== "idle"
      ? sync.message
      : null;

  async function importCurves(file: File) {
    setImporting(true);
    setImportMsg("Lendo a planilha…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/import/curves", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar.");
      setImportMsg(`${formatInt(d.total)} curvas importadas da planilha.`);
      loadProducts();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Marca uma alteração de curva (fica pendente até clicar em Salvar).
  function stageCurve(sku: string, value: CurveValue) {
    setRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, curve: value === "" ? null : value } : r)),
    );
    setPending((p) => ({ ...p, [sku]: value }));
    setSaveMsg(null);
  }

  // Aplica uma curva a todos os produtos selecionados (fica pendente).
  function applyToSelected(value: CurveValue) {
    if (selected.size === 0) return;
    setRows((prev) =>
      prev.map((r) =>
        selected.has(r.sku) ? { ...r, curve: value === "" ? null : value } : r,
      ),
    );
    setPending((p) => {
      const next = { ...p };
      for (const sku of selected) next[sku] = value;
      return next;
    });
    setSaveMsg(null);
  }

  async function saveChanges() {
    const changes = Object.entries(pending).map(([sku, curve]) => ({ sku, curve }));
    if (changes.length === 0) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao salvar.");
      setPending({});
      setSelected(new Set());
      setSaveMsg(`${formatInt(changes.length)} alteração(ões) salva(s).`);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setPending({});
    setSelected(new Set());
    setSaveMsg(null);
    loadProducts();
  }

  function toggleSelect(sku: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((s) => {
      const next = new Set(s);
      const allOn = pageRows.every((r) => next.has(r.sku));
      for (const r of pageRows) allOn ? next.delete(r.sku) : next.add(r.sku);
      return next;
    });
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.sku));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos e curvas</h1>
          <p className="text-sm text-slate-500">
            Classifique cada produto numa curva. Altere na coluna Curva e clique em{" "}
            <b>Salvar alterações</b>. Só aparecem produtos <b>ativos</b> no Bling.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCurves(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-tint disabled:opacity-50"
              title="Enviar a planilha do Excel para atualizar as curvas de uma vez"
            >
              {importing ? "Importando…" : "Importar curvas da planilha"}
            </button>
            <button
              onClick={sync.runProductSync}
              disabled={sync.active}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {sync.active && sync.label === "Produtos e fornecedores"
                ? "Sincronizando…"
                : "Sincronizar com o Bling"}
            </button>
          </div>
          <a
            href="/modelo-curvas.xlsx"
            download
            className="text-xs text-brand hover:underline"
          >
            Baixar modelo da planilha
          </a>
          {syncMsg && <span className="text-xs text-slate-500">{syncMsg}</span>}
          {importMsg && <span className="text-xs text-slate-500">{importMsg}</span>}
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          list="lista-fornecedores"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Filtrar por fornecedor…"
          className="min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <datalist id="lista-fornecedores">
          {suppliers.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {supplier && (
          <button
            onClick={() => setSupplier("")}
            className="rounded-lg border border-slate-200 px-2 py-2 text-xs text-slate-500 hover:border-slate-400"
          >
            limpar
          </button>
        )}
        <input
          type="search"
          placeholder="Buscar por nome ou SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyConsumption}
            onChange={(e) => setOnlyConsumption(e.target.checked)}
            className="accent-brand"
          />
          Só com consumo
        </label>
      </div>

      {rows.length > 0 && (
        <p className="mb-3 text-sm text-slate-500">
          <b className="text-slate-700">{formatInt(withConsumption)}</b> de{" "}
          {formatInt(rows.length)} produtos têm consumo registrado nos últimos 6 meses.
        </p>
      )}

      {/* Barra de seleção múltipla (aparece ao marcar produtos) */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
          <span className="text-sm text-slate-600">
            <b>{selected.size}</b> selecionado(s). Aplicar curva:
          </span>
          <select
            value="__pick__"
            onChange={(e) => {
              if (e.target.value !== "__pick__")
                applyToSelected(e.target.value === "__none__" ? "" : (e.target.value as CurveValue));
            }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="__pick__" disabled>
              escolher curva…
            </option>
            {CURVES.map((c) => (
              <option key={c} value={c}>
                {CURVE_META[c].label}
              </option>
            ))}
            <option value="__none__">Não classificado</option>
          </select>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:underline"
          >
            limpar seleção
          </button>
        </div>
      )}

      {/* Barra de salvar (aparece quando há alterações pendentes) */}
      {pendingCount > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-light bg-brand-tint px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-dark">
            {formatInt(pendingCount)} alteração(ões) não salva(s).
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={discardChanges}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-400 disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}
      {saveMsg && <p className="mb-3 text-sm text-emerald-700">{saveMsg}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleSelectPage}
                  className="accent-brand"
                  title="Selecionar todos desta página"
                />
              </th>
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 text-right font-medium">Estoque</th>
              <th className="px-4 py-3 text-right font-medium">Custo</th>
              <th className="px-4 py-3 text-right font-medium">Preço venda</th>
              <th className="px-4 py-3 text-right font-medium">Markup</th>
              <th className="px-4 py-3 text-right font-medium">Consumo/mês</th>
              <th className="px-4 py-3 font-medium">Curva</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const meta = curveBadge(r.curve);
              const markup = r.cost > 0 && r.price > 0 ? r.price / r.cost : null;
              const isPending = r.sku in pending;
              return (
                <tr
                  key={r.id}
                  className={`border-b border-slate-50 ${isPending ? "bg-brand-tint/40" : ""}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.sku)}
                      onChange={() => toggleSelect(r.sku)}
                      className="accent-brand"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.supplierName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {formatInt(r.stock)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {r.cost > 0 ? formatBRL(r.cost) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {r.price > 0 ? formatBRL(r.price) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {markup ? `${markup.toFixed(2)}×` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {r.monthlyConsumption > 0 ? formatInt(r.monthlyConsumption) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-6 min-w-[2.2rem] items-center justify-center rounded-md px-2 text-xs font-semibold ${meta.badge}`}
                      >
                        {meta.label}
                      </span>
                      <select
                        value={r.curve ?? ""}
                        onChange={(e) => stageCurve(r.sku, e.target.value as CurveValue)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand"
                      >
                        <option value="">Não classificado</option>
                        {CURVES.map((c) => (
                          <option key={c} value={c}>
                            {CURVE_META[c].label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Nenhum produto ainda. Clique em <b>Sincronizar com o Bling</b> para importar
            os produtos.
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>
              {formatInt((page - 1) * PAGE_SIZE + 1)}–
              {formatInt(Math.min(page * PAGE_SIZE, filtered.length))} de{" "}
              {formatInt(filtered.length)}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 transition hover:border-slate-400 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 transition hover:border-slate-400 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
