import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// Mostra os campos de PREÇO de um produto (pra montar a atualização de desconto
// sem sobrescrever o preço base). Abra logado: /api/bling/inspect-produto?sku=20419
export async function GET(req: NextRequest) {
  const bling = await tryCreateBlingDataSource();
  if (!bling) {
    return NextResponse.json({ error: "Bling não conectado" }, { status: 400 });
  }
  const sku = (req.nextUrl.searchParams.get("sku") ?? "").trim();
  if (!sku) return NextResponse.json({ error: "Informe ?sku=CODIGO" }, { status: 400 });
  try {
    return NextResponse.json(await bling.inspecionarProduto(sku));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
