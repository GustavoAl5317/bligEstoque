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
  const [depositos, saldos] = await Promise.all([
    bling.listDepositos(),
    produtoId ? bling.saldosPorDeposito(produtoId) : Promise.resolve(null),
  ]);

  return NextResponse.json({ depositos, saldos_do_produto: saldos });
}
