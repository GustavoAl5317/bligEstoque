import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { lastYms } from "@/lib/bling/real";

// Detalhe item a item das SAÍDAS que o webhook de estoque já acumulou.
// Serve para acompanhar o consumo automático "enchendo" durante o mês, sem
// mexer no relatório (que segue usando a planilha enquanto ela tiver prioridade).
// Fica ATRÁS do login (rota comum) — diferente do endpoint público do webhook,
// aqui aparecem nomes de produto.
export async function GET() {
  const store = getStore();
  const yms = lastYms(6);
  const [status, detail] = await Promise.all([
    store.getStockExitStatus(),
    store.getStockExitDetail(yms, 300),
  ]);
  return NextResponse.json({ status, detail });
}
