import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { calcReplenishment, type CalcFilters } from "@/lib/calc/replenishment";

// Recebe os filtros, roda o motor de cálculo e devolve as sugestões de compra.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<CalcFilters>;

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
    coverageDays: Number(body.coverageDays) || 30,
    coverageByCurve,
    safetyFactor: Number(body.safetyFactor) || 0,
    leadTimeOverrideDays:
      body.leadTimeOverrideDays != null && Number(body.leadTimeOverrideDays) > 0
        ? Number(body.leadTimeOverrideDays)
        : null,
  };

  const ds = await getDataSource();
  const [suppliers, products] = await Promise.all([
    ds.listSuppliers(),
    ds.listProducts(),
  ]);

  const result = calcReplenishment(products, suppliers, filters);
  return NextResponse.json(result);
}
