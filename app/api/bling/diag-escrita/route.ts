import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// Testa se o token tem permissão de ESCRITA em produtos, SEM alterar nada
// (define a situação do produto para a mesma que ele já tem).
// Abra logado: /api/bling/diag-escrita?sku=20419
export async function GET(req: NextRequest) {
  const bling = await tryCreateBlingDataSource();
  if (!bling) {
    return NextResponse.json({ error: "Bling não conectado" }, { status: 400 });
  }
  const sku = (req.nextUrl.searchParams.get("sku") ?? "").trim();
  if (!sku) {
    return NextResponse.json({ error: "Informe ?sku=CODIGO" }, { status: 400 });
  }
  try {
    return NextResponse.json(await bling.testarEscrita(sku));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
