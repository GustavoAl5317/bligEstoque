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
  const [suppliers, products, windowConsumption, kitMap, manualCons] =
    await Promise.all([
      ds.listSuppliers(),
      ds.listProducts(),
      getStore().getItemConsumption(lastYms(consumptionMonths)),
      getStore().getKitComponents(),
      getStore().getManualConsumption(),
    ]);

  // Consumo de cada produto, por ordem de precedência:
  //  1) CM importado da planilha da cliente (já conta as saídas via kit);
  //  2) CM da janela escolhida (vendas ÷ meses, com kits mapeados decompostos);
  //  3) o consumo já salvo no produto.
  const hasWindow = Object.keys(windowConsumption).length > 0;
  const adjusted = products.map((p) => {
    const manual = manualCons[p.sku];
    if (manual != null) return { ...p, monthlyConsumption: manual };
    if (hasWindow)
      return {
        ...p,
        monthlyConsumption: (windowConsumption[p.sku] ?? 0) / consumptionMonths,
      };
    return p;
  });

  // Para reposição, kits só atrapalham: não se compra o kit, e sim os itens que
  // o formam. Um produto é considerado kit (e escondido por padrão) se:
  //  (a) tem composição sincronizada do Bling, OU
  //  (b) está no fornecedor "KITS" (convenção da DANZI para marcar os kits).
  // showKits=true traz os kits de volta.
  const kitSkus = new Set(Object.keys(kitMap));
  const kitSupplierIds = new Set(
    suppliers
      .filter((s) => s.name.trim().toUpperCase() === "KITS")
      .map((s) => s.id),
  );
  const isKit = (p: (typeof adjusted)[number]) =>
    kitSkus.has(p.sku) || kitSupplierIds.has(p.supplierId);
  const visible =
    body.showKits === true ? adjusted : adjusted.filter((p) => !isKit(p));

  const result = calcReplenishment(visible, suppliers, filters);
  return NextResponse.json(result);
}
