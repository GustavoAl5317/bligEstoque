import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";
import { getStore } from "@/lib/db/store";

// Consumo por item (vendas dos últimos 12 meses, com kits decompostos), por mês.
// Processado em blocos (resumível). GET: status. POST { restart? }: processa um bloco.
export const maxDuration = 60;

export async function GET() {
  const job = await getStore().getConsumptionJob();
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
    if (restart) await ds.startConsumptionCalc(12);
    const r = await ds.processConsumptionChunk();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no cálculo de consumo." },
      { status: 500 },
    );
  }
}
