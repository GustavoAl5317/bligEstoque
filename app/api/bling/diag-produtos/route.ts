import { NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// Diagnóstico: a listagem de produtos do Bling traz o campo "situacao"?
// Se não trouxer, o filtro de ativos deixa inativo passar. Abra logado:
//   /api/bling/diag-produtos
export async function GET() {
  const bling = await tryCreateBlingDataSource();
  if (!bling) {
    return NextResponse.json({ error: "Bling não conectado" }, { status: 400 });
  }
  try {
    return NextResponse.json(await bling.debugProdutosSituacao());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
