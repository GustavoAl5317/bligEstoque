import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";
import { getStore } from "@/lib/db/store";

export const maxDuration = 60;

// Estado atual do cálculo (para retomar/mostrar progresso).
export async function GET() {
  const job = await getStore().getConsumptionJob();
  return NextResponse.json({ job });
}

// Processa um bloco. Passe { start: <meses> } para (re)iniciar; sem corpo, continua.
export async function POST(req: NextRequest) {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json({ error: "Não conectado ao Bling." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const start = Number(body?.start);
    if (start > 0) {
      await ds.startConsumptionCalc(start);
    }
    const result = await ds.processConsumptionChunk();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("Cálculo de consumo falhou:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no cálculo." },
      { status: 500 },
    );
  }
}
