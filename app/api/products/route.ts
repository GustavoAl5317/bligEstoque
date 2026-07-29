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
      stock: p.stock,
      cost: p.cost,
      price: p.price,
    })),
  });
}

const VALID_CURVES: Curve[] = ["A", "B", "C"];

// Salva a curva de 1 produto (sku) ou de vários (skus) de uma vez.
export async function PATCH(req: NextRequest) {
  const { sku, skus, curve } = (await req.json()) as {
    sku?: string;
    skus?: string[];
    curve?: Curve;
  };

  if (!curve || !VALID_CURVES.includes(curve)) {
    return NextResponse.json({ error: "Curva inválida." }, { status: 400 });
  }

  if (Array.isArray(skus) && skus.length > 0) {
    await getStore().setProductCurves(skus, curve);
    return NextResponse.json({ ok: true, count: skus.length });
  }

  if (sku) {
    await getStore().setProductCurve(sku, curve);
    return NextResponse.json({ ok: true, count: 1 });
  }

  return NextResponse.json({ error: "Informe sku ou skus." }, { status: 400 });
}
