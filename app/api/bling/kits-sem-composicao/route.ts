import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { getStore } from "@/lib/db/store";

// Lista os produtos do fornecedor "KITS" que AINDA NÃO têm composição
// cadastrada/sincronizada — ou seja, os que precisam ter a estrutura montada
// no Bling para o consumo ser distribuído aos itens.
// Abra /api/bling/kits-sem-composicao para baixar o CSV.
export async function GET() {
  const ds = await getDataSource();
  const [suppliers, products, kitMap] = await Promise.all([
    ds.listSuppliers(),
    ds.listProducts(),
    getStore().getKitComponents(),
  ]);

  const kitSkus = new Set(Object.keys(kitMap));
  const kitSupplierIds = new Set(
    suppliers
      .filter((s) => s.name.trim().toUpperCase() === "KITS")
      .map((s) => s.id),
  );

  // Kit do fornecedor "KITS" que NÃO está na tabela de composição.
  const semComposicao = products.filter(
    (p) => kitSupplierIds.has(p.supplierId) && !kitSkus.has(p.sku),
  );

  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [
    "SKU;Produto;Estoque",
    ...semComposicao.map((p) => `${esc(p.sku)};${esc(p.name)};${p.stock}`),
  ];
  // BOM para o Excel abrir os acentos certinho.
  const csv = "﻿" + linhas.join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kits-sem-composicao.csv"`,
    },
  });
}
