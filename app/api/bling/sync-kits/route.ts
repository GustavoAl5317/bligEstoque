import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";
import { getStore } from "@/lib/db/store";

// Sincroniza as composições dos kits (processada em blocos, resumível).
// GET: status do job. POST { restart?: true }: processa um bloco.
export const maxDuration = 60;

export async function GET() {
  const job = await getStore().getKitJob();
  return NextResponse.json({ job });
}

export async function POST(req: NextRequest) {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json({ error: "Não conectado ao Bling." }, { status: 400 });
  }
  let restart = false;
  try {
    const body = await req.json();
    restart = Boolean(body?.restart);
  } catch {
    /* sem corpo = continua */
  }
  try {
    if (restart) await ds.startKitSync();
    const r = await ds.processKitChunk();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao sincronizar kits." },
      { status: 500 },
    );
  }
}
