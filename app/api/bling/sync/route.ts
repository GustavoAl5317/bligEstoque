import { NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";
import { getStore } from "@/lib/db/store";

// A sincronização busca milhares de produtos: pode levar dezenas de segundos.
export const maxDuration = 60;

export async function GET() {
  const job = await getStore().getProductJob();
  return NextResponse.json({ job });
}

export async function POST(req: Request) {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json(
      { error: "Não conectado ao Bling." },
      { status: 400 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (body.restart) {
      await ds.startProductSync();
    }
    const r = await ds.processProductChunk();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("Sync falhou:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha na sincronização." },
      { status: 500 },
    );
  }
}
