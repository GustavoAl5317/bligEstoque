import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";

// Fornece as opções dos filtros (fornecedores e curvas) e a origem dos dados.
export async function GET() {
  const ds = await getDataSource();
  const [suppliers, products] = await Promise.all([
    ds.listSuppliers(),
    ds.listProducts(),
  ]);

  const curves = [...new Set(products.map((p) => p.curve))].sort();

  return NextResponse.json({
    source: ds.source,
    suppliers,
    curves,
    productCount: products.length,
  });
}
