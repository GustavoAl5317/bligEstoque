import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { CURVES } from "@/lib/bling/types";

// Fornece as opções dos filtros (fornecedores e curvas) e a origem dos dados.
export async function GET() {
  const ds = await getDataSource();
  const [suppliers, products] = await Promise.all([
    ds.listSuppliers(),
    ds.listProducts(),
  ]);

  return NextResponse.json({
    source: ds.source,
    suppliers,
    curves: CURVES,
    productCount: products.length,
  });
}
