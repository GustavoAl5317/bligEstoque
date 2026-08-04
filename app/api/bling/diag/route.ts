import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";

// Diagnóstico do estado do consumo/kits.
// Abra /api/bling/diag (ou ?sku=CODIGO para checar um produto específico).
export async function GET(req: NextRequest) {
  const store = getStore();
  const [kits, kitJob, consJob, months] = await Promise.all([
    store.getKitComponents(),
    store.getKitJob(),
    store.getConsumptionJob(),
    store.getMonthlyTotals(),
  ]);

  const sku = req.nextUrl.searchParams.get("sku") ?? undefined;
  const skuInfo = sku
    ? { sku, ehKit: Boolean(kits[sku]), componentes: kits[sku] ?? [] }
    : null;

  return NextResponse.json({
    kits_mapeados: Object.keys(kits).length,
    kit_job: kitJob,
    consumo_job: consJob,
    meses_com_venda: months.length,
    produto: skuInfo,
  });
}
