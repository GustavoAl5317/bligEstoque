import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const store = getStore();
  const sku = req.nextUrl.searchParams.get("sku");
  
  if (!sku) {
    return NextResponse.json({ error: "Parâmetro sku é obrigatório" }, { status: 400 });
  }

  // 1. Look up the product in product_cache
  const cachedProducts = await store.getCachedProducts();
  const cached = cachedProducts.find((p) => p.sku === sku);

  if (!cached) {
    return NextResponse.json({ error: "Produto não encontrado no cache" }, { status: 404 });
  }

  if (!cached.blingId) {
    return NextResponse.json({ 
      error: "Produto no cache não tem bling_id (sincronize novamente)", 
      cached 
    }, { status: 400 });
  }

  // 2 & 3. Look up in product_supplier table (via store)
  // Our getCachedProducts() already joins this info!
  const supplierTable = {
    supplierId: cached.supplierId,
    supplierName: cached.supplierName,
    supplierCode: cached.supplierCode,
    supplierDesc: cached.supplierDesc
  };

  // 4. Call the Bling API in real time to get the current supplier for that product
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json({ error: "Bling API não configurada ou token inválido", cached, supplierTable }, { status: 500 });
  }

  let blingLive = null;
  try {
    // using (ds as any).get to bypass TypeScript private restriction for this diagnostic endpoint
    blingLive = await (ds as any).get(`/produtos/${cached.blingId}`);
  } catch (error: any) {
    return NextResponse.json({ 
      error: "Erro ao buscar no Bling API", 
      message: error.message, 
      cached, 
      supplierTable 
    }, { status: 500 });
  }

  // 5. Return a JSON comparing
  return NextResponse.json({
    cached,
    supplierTable,
    blingLive
  });
}
