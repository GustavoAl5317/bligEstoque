import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import type { Curve } from "@/lib/bling/types";

// Lista os produtos com fornecedor e curva atual (para a tela de curvas).
// Lê direto do cache do banco numa consulta só (rápido) — não chama o Bling.
export async function GET() {
  const rows = await getStore().getProductsForListing();
  return NextResponse.json({
    products: rows.map((p) => ({ id: p.sku, ...p })),
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
