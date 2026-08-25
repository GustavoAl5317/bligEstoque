"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBRL, formatInt } from "@/lib/format";
import { CURVES } from "@/lib/bling/types";
import type { PricingConfig } from "@/lib/calc/pricing";

interface Row {
  sku: string;
  name: string;
  curve: string;
  stock: number;
  monthlyConsumption: number;
  estoqueSeguranca: number;
  ie: number | null;
  faixa: string;
  margem: number;
  descontoSugerido: number;
  descontoMaximo: number;
  descontoFinal: number;
  precoPromocional: number;
  excedente: number;
  qtdePromocao: number;
  status: "promover" | "revisao" | "fora" | "sem_dado";
}
interface Resumo {
  promover: number;
  revisao: number;
  fora: number;
  sem_dado: number;
  total: number;
}

const PAGE_SIZE = 100;

export default function PrecificacaoPage() {
  const [tab, setTab] = useState<"sugestoes" | "matriz">("sugestoes");
  const [config, setConfig] = useState<PricingConfig | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [diag, setDiag] = useState<{
    total: number;
    com_curva: number;
    com_prazo_fornecedor: number;
    com_serie_de_vendas: number;
    com_estoque: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | "promover" | "revisao">("todos");
  const [page, setPage] = useState(1);
  const [aplicados, setAplicados] = useState<
    Record<string, { precoOriginal: number; precoAplicado: number; desconto: number }>
  >({});
  const [busy, setBusy] = useState<string | null>(null);

  function loadConfig() {
    return fetch("/api/pricing/config")
      .then((r) => r.json())
      .then((d) => setConfig(d.config));
  }
  function loadSuggestions() {
    setLoading(true);
    return fetch("/api/pricing/suggestions")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setResumo(d.resumo ?? null);
        setDiag(d.diagnostico ?? null);
      })
      .catch(() => setMsg("Não foi possível calcular."))
      .finally(() => setLoading(false));
  }

  function loadAplicados() {
    return fetch("/api/pricing/apply")
      .then((r) => r.json())
      .then((d) => setAplicados(d.aplicados ?? {}))
      .catch(() => {});
  }

  useEffect(() => {
    loadConfig();
    loadSuggestions();
    loadAplicados();
  }, []);

  async function aplicar(r: Row) {
    if (
      !confirm(
        `Aplicar ${r.descontoFinal.toFixed(0)}% de desconto em "${r.name}"?\n\n` +
          `O preço vai para ${formatBRL(r.precoPromocional)} no Bling (o preço original fica guardado pra reverter).`,
      )
    )
      return;
    setBusy(r.sku);
    setMsg(null);
    try {
      const res = await fetch("/api/pricing/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", sku: r.sku, preco: r.precoPromocional }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await loadAplicados();
      setMsg(`✅ Desconto aplicado em ${r.sku} (${r.name}).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao aplicar.");
    } finally {
      setBusy(null);
    }
  }

  async function reverter(sku: string) {
    if (!confirm("Reverter para o preço original no Bling?")) return;
    setBusy(sku);
    setMsg(null);
    try {
      const res = await fetch("/api/pricing/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", sku }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await loadAplicados();
      setMsg(`✅ Preço original restaurado em ${sku}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao reverter.");
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (statusFiltro === "todos" || r.status === statusFiltro) &&
        (q === "" || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)),
    );
  }, [rows, query, statusFiltro]);

  useEffect(() => setPage(1), [query, statusFiltro]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---- edição da config ----
  function patch(fn: (c: PricingConfig) => void) {
    setConfig((prev) => {
      if (!prev) return prev;
      const next: PricingConfig = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
    setMsg(null);
  }

  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setMsg("Salvando…");
    try {
      const r = await fetch("/api/pricing/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!r.ok) throw new Error("Falha ao salvar.");
      setMsg("Matriz salva. Recalculando…");
      await loadSuggestions();
      setMsg("Matriz salva e sugestões atualizadas. ✅");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function resetConfig() {
    if (!confirm("Voltar a matriz para o padrão da especificação?")) return;
    setSaving(true);
    const r = await fetch("/api/pricing/config", { method: "DELETE" });
    const d = await r.json();
    setConfig(d.config);
    setMsg("Matriz restaurada ao padrão.");
    await loadSuggestions();
    setSaving(false);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Precificação dinâmica</h1>
        <p className="max-w-3xl text-sm text-slate-500">
          Calcula o <b>excesso de estoque</b> de cada produto e sugere o <b>desconto
          ideal</b> pra girar — cruzando curva, consumo, prazo do fornecedor e{" "}
          <b>sem furar a margem mínima</b>. A <b>matriz é editável</b>: mudou os
          números, o cálculo se ajusta na hora.
        </p>
      </header>

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {(["sugestoes", "matriz"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-brand text-brand-dark"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "sugestoes" ? "Sugestões de desconto" : "Matriz (configuração)"}
          </button>
        ))}
      </div>

      {msg && <p className="mb-3 text-sm text-slate-600">{msg}</p>}

      {tab === "sugestoes" ? (
        <>
          {resumo &&
            diag &&
            resumo.promover + resumo.revisao + resumo.fora === 0 &&
            resumo.total > 0 && (
              <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <b>Nenhum produto foi calculado.</b> O cálculo precisa de: <b>curva</b>,{" "}
                <b>prazo do fornecedor</b> e <b>série de vendas</b>. Cobertura atual dos{" "}
                {formatInt(diag.total)} produtos:
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  <li>
                    com <b>curva</b>: {formatInt(diag.com_curva)}
                    {diag.com_curva === 0 && " ← classifique as curvas (Produtos e curvas)"}
                  </li>
                  <li>
                    com <b>prazo do fornecedor</b> &gt; 0: {formatInt(diag.com_prazo_fornecedor)}
                    {diag.com_prazo_fornecedor === 0 &&
                      " ← falta cadastrar o prazo dos fornecedores (é isso que zera o estoque de segurança)"}
                  </li>
                  <li>
                    com <b>série de vendas</b>: {formatInt(diag.com_serie_de_vendas)}
                    {diag.com_serie_de_vendas === 0 && " ← rode o cálculo de consumo (Conexão)"}
                  </li>
                  <li>com estoque &gt; 0: {formatInt(diag.com_estoque)}</li>
                </ul>
              </div>
            )}

          {resumo && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Pra promover" value={resumo.promover} tone="green" />
              <Stat label="Precisam aprovação" value={resumo.revisao} tone="amber" />
              <Stat label="No nível certo" value={resumo.fora} />
              <Stat label="Sem dado/giro" value={resumo.sem_dado} />
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar produto ou SKU…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand sm:max-w-xs"
            />
            <select
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="todos">Todos em excesso</option>
              <option value="promover">Só pra promover</option>
              <option value="revisao">Só que precisam aprovação</option>
            </select>
            <button
              onClick={loadSuggestions}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
            >
              Recalcular
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3 font-medium">Produto</th>
                  <th className="px-3 py-3 text-center font-medium">Curva</th>
                  <th className="px-3 py-3 text-right font-medium">Estoque</th>
                  <th className="px-3 py-3 text-right font-medium">Seg.</th>
                  <th className="px-3 py-3 text-right font-medium">IE</th>
                  <th className="px-3 py-3 text-center font-medium">Faixa</th>
                  <th className="px-3 py-3 text-right font-medium">Desc.</th>
                  <th className="px-3 py-3 text-right font-medium">Preço promo</th>
                  <th className="px-3 py-3 text-right font-medium">Qtd</th>
                  <th className="px-3 py-3 font-medium">Situação</th>
                  <th className="px-3 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.sku} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.sku}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{r.curve}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatInt(r.stock)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {formatInt(r.estoqueSeguranca)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-700">
                      {r.ie != null ? `${r.ie.toFixed(1)}×` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{r.faixa}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-brand-dark">
                      {r.descontoFinal.toFixed(0)}%
                      {r.status === "revisao" && (
                        <span className="ml-1 text-xs font-normal text-amber-600">
                          (ideal {r.descontoSugerido.toFixed(0)}%)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {formatBRL(r.precoPromocional)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {formatInt(r.qtdePromocao)}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.status === "promover" ? (
                        <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Promover
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Aprovar (fura margem)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {aplicados[r.sku] ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-green-700">
                            aplicado
                          </span>
                          <button
                            onClick={() => reverter(r.sku)}
                            disabled={busy === r.sku}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400 disabled:opacity-50"
                          >
                            {busy === r.sku ? "…" : "Reverter"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => aplicar(r)}
                          disabled={busy === r.sku}
                          className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                        >
                          {busy === r.sku ? "Aplicando…" : "Aplicar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">Calculando…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                Nenhum produto em excesso com os parâmetros atuais.
              </div>
            )}
            {filtered.length > PAGE_SIZE && (
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
                    className="rounded-lg border border-slate-200 px-3 py-1.5 hover:border-slate-400 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 hover:border-slate-400 disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            <b>IE</b> = estoque ÷ estoque de segurança. <b>Desc.</b> é o desconto final
            (já limitado pela margem). Itens “Aprovar” pediriam desconto maior do que a
            margem permite — ficam pra decisão manual.
          </p>
        </>
      ) : (
        config && (
          <MatrizEditor
            config={config}
            patch={patch}
            onSave={saveConfig}
            onReset={resetConfig}
            saving={saving}
          />
        )
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "amber";
}) {
  const color =
    tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
        {formatInt(value)}
      </div>
    </div>
  );
}

function MatrizEditor({
  config,
  patch,
  onSave,
  onReset,
  saving,
}: {
  config: PricingConfig;
  patch: (fn: (c: PricingConfig) => void) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  const faixas = config.faixas;
  const num = (v: string) => Number(v.replace(",", ".")) || 0;
  const cell =
    "w-16 rounded border border-slate-200 px-1 py-1 text-right text-sm tabular-nums outline-none focus:border-brand";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Janela de histórico (meses):
            <input
              type="number"
              min={1}
              max={24}
              value={config.janela_meses}
              onChange={(e) => patch((c) => (c.janela_meses = num(e.target.value)))}
              className={cell}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Prazo padrão (dias) qdo fornecedor sem prazo:
            <input
              type="number"
              min={1}
              max={365}
              value={config.prazo_padrao_dias}
              onChange={(e) => patch((c) => (c.prazo_padrao_dias = num(e.target.value)))}
              className={cell}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-slate-400 disabled:opacity-50"
          >
            Restaurar padrão
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar matriz"}
          </button>
        </div>
      </div>

      {/* Faixas de IE + piso de margem */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Faixas de excesso (IE) e piso de margem
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-3 py-2 font-medium">Faixa</th>
                <th className="px-3 py-2 text-right font-medium">IE de</th>
                <th className="px-3 py-2 text-right font-medium">IE até</th>
                <th className="px-3 py-2 text-right font-medium">Piso margem %</th>
              </tr>
            </thead>
            <tbody>
              {faixas.map((f, i) => (
                <tr key={f.nome} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">{f.nome}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className={cell}
                      value={f.ie_min}
                      onChange={(e) => patch((c) => (c.faixas[i].ie_min = num(e.target.value)))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className={cell}
                      value={f.ie_max}
                      onChange={(e) => patch((c) => (c.faixas[i].ie_max = num(e.target.value)))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className={cell}
                      value={Math.round(f.piso_margem * 100)}
                      onChange={(e) =>
                        patch((c) => (c.faixas[i].piso_margem = num(e.target.value) / 100))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Matriz de desconto: curva × faixa (min–max %) */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          Matriz de desconto (curva × faixa) — mínimo e máximo %
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-3 py-2 font-medium">Curva</th>
                <th className="px-3 py-2 text-center font-medium">Z</th>
                {faixas.map((f) => (
                  <th key={f.nome} className="px-3 py-2 text-center font-medium">
                    {f.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CURVES.map((cv) => (
                <tr key={cv} className="border-b border-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">{cv}</td>
                  <td className="px-3 py-2 text-center">
                    <input
                      className="w-14 rounded border border-slate-200 px-1 py-1 text-right text-sm tabular-nums outline-none focus:border-brand"
                      value={config.z_por_curva[cv] ?? ""}
                      onChange={(e) =>
                        patch((c) => (c.z_por_curva[cv] = num(e.target.value)))
                      }
                    />
                  </td>
                  {faixas.map((f) => {
                    const par = config.matriz[cv]?.[f.nome] ?? [0, 0];
                    return (
                      <td key={f.nome} className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            className="w-12 rounded border border-slate-200 px-1 py-1 text-right text-sm tabular-nums outline-none focus:border-brand"
                            value={par[0]}
                            onChange={(e) =>
                              patch((c) => {
                                (c.matriz[cv] ??= {})[f.nome] = [num(e.target.value), par[1]];
                              })
                            }
                          />
                          <span className="text-slate-300">–</span>
                          <input
                            className="w-12 rounded border border-slate-200 px-1 py-1 text-right text-sm tabular-nums outline-none focus:border-brand"
                            value={par[1]}
                            onChange={(e) =>
                              patch((c) => {
                                (c.matriz[cv] ??= {})[f.nome] = [par[0], num(e.target.value)];
                              })
                            }
                          />
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Liberação por prazo do fornecedor */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          % do excedente liberado por prazo do fornecedor
        </h2>
        <div className="flex flex-wrap gap-3">
          {config.prazo_liberacao.map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
            >
              <span>{r.ate_dias == null ? "acima do último" : `até ${r.ate_dias} dias`}:</span>
              <input
                className={cell}
                value={r.pct}
                onChange={(e) => patch((c) => (c.prazo_liberacao[i].pct = num(e.target.value)))}
              />
              <span>%</span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Estes números são a “matriz aberta”: ao salvar, o motor recalcula tudo com os
        novos valores — sem precisar de atualização do sistema.
      </p>
    </div>
  );
}
