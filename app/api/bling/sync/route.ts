import { NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";
import { getStore } from "@/lib/db/store";

// A sincronização busca milhares de produtos: pode levar dezenas de segundos.
export const maxDuration = 60;

export async function GET() {
  const store = getStore();
  const [job, ultimoErro] = await Promise.all([
    store.getProductJob(),
    store.getAppConfig("sync_last_error"),
  ]);
  return NextResponse.json({ job, ultimo_erro: ultimoErro ?? null });
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
    const msg = e instanceof Error ? e.message : "Falha na sincronização.";
    await getStore()
      .saveAppConfig("sync_last_error", { msg, at: new Date().toISOString() })
      .catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
