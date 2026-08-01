import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { lastYms } from "@/lib/bling/real";

// Dados da aba de Análise: saída por mês (total) e itens que mais saíram.
export async function GET(req: NextRequest) {
  const monthsRaw = Number(req.nextUrl.searchParams.get("months"));
  const months = [3, 6, 12].includes(monthsRaw) ? monthsRaw : 12;
  const yms = lastYms(months); // recente -> antigo

  const store = getStore();
  const [totalsRaw, top, products] = await Promise.all([
    store.getMonthlyTotals(),
    store.getTopItems(yms, 50),
    store.getProductsForListing(),
  ]);

  const nameBySku = new Map(products.map((p) => [p.sku, p.name]));
  const totalByYm = new Map(totalsRaw.map((t) => [t.ym, t.qty]));

  // Meses em ordem cronológica (antigo -> recente) para o gráfico.
  const monthly = [...yms].reverse().map((ym) => ({
    ym,
    qty: totalByYm.get(ym) ?? 0,
  }));

  const topItems = top.map((t) => ({
    sku: t.sku,
    name: nameBySku.get(t.sku) ?? t.sku,
    total: t.total,
    perMonth: Math.round((t.total / months) * 10) / 10,
  }));

  return NextResponse.json({ months, monthly, topItems });
}
