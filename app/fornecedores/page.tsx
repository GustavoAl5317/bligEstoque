"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatInt } from "@/lib/format";

interface Fornecedor {
  id: string;
  name: string;
  leadTimeDays: number;
  produtos: number;
}

export default function FornecedoresPage() {
  const [rows, setRows] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    setLoading(true);
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((d) => setRows(d.fornecedores ?? []))
      .catch(() => setMsg("Não foi possível carregar."))
      .finally(() => setLoading(false));
  }
  useEffect(() => load(), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? rows : rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const semPrazo = useMemo(
    () => rows.filter((r) => (pending[r.id] ?? r.leadTimeDays) <= 0).length,
    [rows, pending],
  );
  const pendingCount = Object.keys(pending).length;

  function stage(id: string, days: number) {
    setPending((p) => ({ ...p, [id]: days }));
    setMsg(null);
  }

  async function save() {
    const changes = Object.entries(pending).map(([id, days]) => ({ id, days }));
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const r = await fetch("/api/suppliers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setRows((prev) =>
        prev.map((f) => (f.id in pending ? { ...f, leadTimeDays: pending[f.id] } : f)),
      );
      setPending({});
      setMsg(`${formatInt(changes.length)} prazo(s) salvo(s). ✅`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setMsg("Lendo a planilha…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/suppliers/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao importar.");
      let m = `Importado: ${formatInt(d.aplicados)} fornecedor(es) com prazo.`;
      if (d.total_nao_encontrados > 0)
        m += ` ${formatInt(d.total_nao_encontrados)} nome(s) não bateram com o cadastro.`;
      setMsg(m);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prazos dos fornecedores</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Cadastre o <b>prazo de entrega</b> (dias) de cada fornecedor. Ele é usado no{" "}
            <b>estoque de segurança</b> da precificação e na <b>sugestão de compra</b>. Quem
            ficar sem prazo usa o <b>padrão</b> definido na precificação.
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
                if (f) importFile(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-tint disabled:opacity-50"
            >
              {importing ? "Importando…" : "Importar planilha"}
            </button>
          </div>
          <a href="/modelo-prazos.xlsx" download className="text-xs text-brand hover:underline">
            Baixar modelo da planilha
          </a>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      </header>

      <div className="mb-3 rounded-xl border border-brand-light/60 bg-brand-tint/50 px-4 py-3 text-sm text-slate-600">
        <b>Planilha:</b> uma coluna <b>Fornecedor</b> (mesmo nome do sistema) e uma coluna{" "}
        <b>Prazo</b> (dias). Ou edite direto na tabela abaixo e clique em Salvar.
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar fornecedor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs"
        />
        {!loading && (
          <span className="text-sm text-slate-500">
            <b className="text-amber-600">{formatInt(semPrazo)}</b> sem prazo de{" "}
            {formatInt(rows.length)}
          </span>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex items-center justify-between rounded-xl border border-brand-light bg-brand-tint px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-brand-dark">
            {formatInt(pendingCount)} alteração(ões) não salva(s).
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPending({})}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:border-slate-400 disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 text-right font-medium">Produtos</th>
              <th className="px-4 py-3 text-right font-medium">Prazo (dias)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => {
              const val = pending[f.id] ?? f.leadTimeDays;
              const isPending = f.id in pending;
              return (
                <tr
                  key={f.id}
                  className={`border-b border-slate-50 ${isPending ? "bg-brand-tint/40" : ""}`}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">{f.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {formatInt(f.produtos)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={val || ""}
                      placeholder="0"
                      onChange={(e) => stage(f.id, Math.max(0, Number(e.target.value) || 0))}
                      className={`w-20 rounded border px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-brand ${
                        val > 0 ? "border-slate-200" : "border-amber-300 bg-amber-50"
                      }`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Carregando…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Nenhum fornecedor. Rode a sincronização de produtos e fornecedores na Conexão.
          </div>
        )}
      </div>
    </div>
  );
}
