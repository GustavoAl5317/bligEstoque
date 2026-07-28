import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { getStore } from "@/lib/db/store";
import type { Curve } from "@/lib/bling/types";

// Lista os produtos com fornecedor e curva atual (para a tela de curvas).
export async function GET() {
  const ds = await getDataSource();
  const [suppliers, products] = await Promise.all([
    ds.listSuppliers(),
    ds.listProducts(),
  ]);
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      supplierName: supplierName.get(p.supplierId) ?? "—",
      curve: p.curve,
      monthlyConsumption: p.monthlyConsumption,
    })),
  });
}

const VALID_CURVES: Curve[] = ["A", "B", "C"];

// Salva a curva escolhida manualmente para um produto (chave = SKU).
export async function PATCH(req: NextRequest) {
  const { sku, curve } = (await req.json()) as {
    sku?: string;
    curve?: Curve;
  };

  if (!sku || !curve || !VALID_CURVES.includes(curve)) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  await getStore().setProductCurve(sku, curve);
  return NextResponse.json({ ok: true });
}
