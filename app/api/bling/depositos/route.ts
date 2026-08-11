import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// Lista os depósitos do Bling (id + descrição) para identificar qual é o "Geral"
// e qual é o "FULL" (Mercado Livre). Opcional: ?sku=CODIGO_BLING_ID mostra também
// o saldo daquele produto por depósito.
//
// Abra logado: /api/bling/depositos   (ou /api/bling/depositos?produtoId=16215930033)
export async function GET(req: NextRequest) {
  const bling = await tryCreateBlingDataSource();
  if (!bling) {
    return NextResponse.json({ error: "Bling não conectado" }, { status: 400 });
  }

  const produtoId = req.nextUrl.searchParams.get("produtoId") ?? undefined;
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // Cada chamada é isolada, pra sabermos qual permissão falta (uma pode funcionar
  // e a outra não). 403 = o app do Bling não tem o escopo daquele recurso.
  const out: Record<string, unknown> = {};
  try {
    out.depositos = await bling.listDepositos();
  } catch (e) {
    out.depositos_erro = msg(e);
  }
  if (produtoId) {
    try {
      out.saldos_do_produto = await bling.saldosPorDeposito(produtoId);
    } catch (e) {
      out.saldos_erro = msg(e);
    }
  }
  return NextResponse.json(out);
}
