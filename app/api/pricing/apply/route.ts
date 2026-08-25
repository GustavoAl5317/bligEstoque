import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";
import { getStore } from "@/lib/db/store";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lista os descontos já aplicados (com o preço original guardado).
export async function GET() {
  const aplicados = await getStore().getPricingStates();
  return NextResponse.json({ aplicados });
}

// Aplica ou reverte um desconto num produto — escreve o preço no Bling.
// body: { action: "apply", sku, preco }  |  { action: "restore", sku }
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { action?: string; sku?: string; preco?: number };
  const sku = String(body.sku ?? "").trim();
  if (!sku) return NextResponse.json({ error: "sku obrigatório" }, { status: 400 });

  const bling = await tryCreateBlingDataSource();
  if (!bling) return NextResponse.json({ error: "Bling não conectado." }, { status: 400 });

  const store = getStore();
  const states = await store.getPricingStates();

  if (body.action === "restore") {
    const st = states[sku];
    if (!st) return NextResponse.json({ error: "Não há desconto aplicado nesse SKU." }, { status: 400 });
    const r = await bling.aplicarPreco(sku, st.precoOriginal);
    if (!r.ok) {
      return NextResponse.json(
        { error: `Bling recusou (${r.status}).`, resposta: r.resposta },
        { status: 200 },
      );
    }
    await store.deletePricingState(sku);
    return NextResponse.json({ ok: true, sku, precoRestaurado: st.precoOriginal });
  }

  // action = apply
  const preco = Number(body.preco);
  if (!(preco > 0)) return NextResponse.json({ error: "preco inválido" }, { status: 400 });

  const r = await bling.aplicarPreco(sku, preco);
  if (!r.ok) {
    return NextResponse.json(
      { error: `Bling recusou (${r.status}).`, resposta: r.resposta },
      { status: 200 },
    );
  }
  // Guarda o preço ORIGINAL: se já havia desconto, mantém o original; senão, usa
  // o preço que estava lá antes desta alteração.
  const precoOriginal = states[sku]?.precoOriginal ?? r.precoAnterior ?? preco;
  const desconto =
    precoOriginal > 0 ? Math.round((1 - preco / precoOriginal) * 1000) / 10 : 0;
  await store.setPricingState(sku, precoOriginal, preco, desconto);

  return NextResponse.json({ ok: true, sku, precoAnterior: r.precoAnterior, precoAplicado: preco, precoOriginal });
}
