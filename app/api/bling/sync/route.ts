import { NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// A sincronização busca milhares de produtos: pode levar dezenas de segundos.
export const maxDuration = 60;

export async function POST() {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json(
      { error: "Não conectado ao Bling." },
      { status: 400 },
    );
  }
  try {
    const count = await ds.syncProducts();
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    console.error("Sync falhou:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na sincronização." },
      { status: 500 },
    );
  }
}
