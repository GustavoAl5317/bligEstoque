"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInt } from "@/lib/format";

interface MonthPoint {
  ym: string;
  qty: number;
}
interface TopItem {
  sku: string;
  name: string;
  total: number;
  perMonth: number;
}

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_LABELS[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

export default function AnalisePage() {
  const [months, setMonths] = useState(12);
  const [monthly, setMonthly] = useState<MonthPoint[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analysis?months=${months}`)
      .then((r) => r.json())
      .then((d) => {
        setMonthly(d.monthly ?? []);
        setTopItems(d.topItems ?? []);
      })
      .finally(() => setLoading(false));
  }, [months]);

  const maxQty = useMemo(
    () => Math.max(1, ...monthly.map((m) => m.qty)),
    [monthly],
  );
  const totalPeriod = useMemo(
    () => monthly.reduce((a, m) => a + m.qty, 0),
    [monthly],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Análise de estoque</h1>
          <p className="text-sm text-slate-500">
            Quanto saiu de cada item por mês (kits já contados nos seus itens).
          </p>
        </div>
        <div className="flex gap-1.5">
          {[3, 6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                months === m
                  ? "border-brand bg-brand text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {m} meses
            </button>
          ))}
        </div>
      </header>

      {loading && (
        <p className="py-10 text-center text-sm text-slate-400">Carregando…</p>
      )}

      {!loading && totalPeriod === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-400">
          Ainda não há dados de consumo. Na tela <b>Conexão</b>, rode a
          sincronização de kits e depois o cálculo de consumo.
        </div>
      )}

      {!loading && totalPeriod > 0 && (
        <>
          {/* Gráfico de saída por mês */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-700">Saída por mês</span>
              <span className="text-sm text-slate-500">
                Total no período: <b className="text-slate-800">{formatInt(totalPeriod)}</b> un.
              </span>
            </div>
            <div className="flex items-end gap-2" style={{ height: 180 }}>
              {monthly.map((m) => (
                <div key={m.ym} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500">
                    {m.qty > 0 ? formatInt(m.qty) : ""}
                  </span>
                  <div
                    className="w-full rounded-t bg-brand transition-all"
                    style={{ height: `${(m.qty / maxQty) * 140}px`, minHeight: m.qty > 0 ? 2 : 0 }}
                    title={`${ymLabel(m.ym)}: ${formatInt(m.qty)}`}
                  />
                  <span className="text-[10px] text-slate-400">{ymLabel(m.ym)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Itens que mais saíram */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
              Itens que mais saíram ({months} meses)
            </div>
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 text-right font-medium">Total saída</th>
                  <th className="px-4 py-3 text-right font-medium">Média/mês</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((it, i) => (
                  <tr key={it.sku} className="border-b border-slate-50">
                    <td className="px-4 py-3 tabular-nums text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{it.name}</div>
                      <div className="text-xs text-slate-400">{it.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">
                      {formatInt(it.total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {it.perMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
