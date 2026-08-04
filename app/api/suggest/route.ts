import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { getStore } from "@/lib/db/store";
import { lastYms } from "@/lib/bling/real";
import { calcReplenishment, type CalcFilters } from "@/lib/calc/replenishment";

// Recebe os filtros, roda o motor de cálculo e devolve as sugestões de compra.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<CalcFilters> & {
    consumptionMonths?: number;
    showKits?: boolean;
  };

  // Período do consumo escolhido no relatório (mês atual=1, 3, 6, 12).
  const monthsRaw = Number(body.consumptionMonths);
  const consumptionMonths = [1, 3, 6, 12].includes(monthsRaw) ? monthsRaw : 6;

  const coverageByCurve: Record<string, number> = {};
  if (body.coverageByCurve && typeof body.coverageByCurve === "object") {
    for (const [k, v] of Object.entries(body.coverageByCurve)) {
      const n = Number(v);
      if (n > 0) coverageByCurve[k] = n;
    }
  }

  const filters: CalcFilters = {
    supplierIds: Array.isArray(body.supplierIds) ? body.supplierIds : [],
    curves: Array.isArray(body.curves) ? body.curves : [],
    productSkus: Array.isArray(body.productSkus) ? body.productSkus : [],
    coverageDays: Number(body.coverageDays) || 30,
    coverageByCurve,
    safetyPercent: Number(body.safetyPercent) || 0,
    includeProduction: body.includeProduction !== false, // padrão: considerar
    leadTimeOverrideDays:
      body.leadTimeOverrideDays != null && Number(body.leadTimeOverrideDays) > 0
        ? Number(body.leadTimeOverrideDays)
        : null,
  };

  const ds = await getDataSource();
  const [suppliers, products, windowConsumption, kitMap] = await Promise.all([
    ds.listSuppliers(),
    ds.listProducts(),
    getStore().getItemConsumption(lastYms(consumptionMonths)),
    getStore().getKitComponents(),
  ]);

  // Substitui o consumo pelo da janela escolhida (CM = total vendido ÷ meses),
  // já com kits decompostos. Se não houver histórico, mantém o consumo salvo.
  const hasWindow = Object.keys(windowConsumption).length > 0;
  const adjusted = hasWindow
    ? products.map((p) => ({
        ...p,
        monthlyConsumption: (windowConsumption[p.sku] ?? 0) / consumptionMonths,
      }))
    : products;

  // Para reposição, kits (produtos com composição) só atrapalham: não se compra
  // o kit, e sim os itens que o formam. Por padrão escondemos os kits e mostramos
  // só os produtos unitários. showKits=true traz os kits de volta.
  const kitSkus = new Set(Object.keys(kitMap));
  const visible =
    body.showKits === true || kitSkus.size === 0
      ? adjusted
      : adjusted.filter((p) => !kitSkus.has(p.sku));

  const result = calcReplenishment(visible, suppliers, filters);
  return NextResponse.json(result);
}
