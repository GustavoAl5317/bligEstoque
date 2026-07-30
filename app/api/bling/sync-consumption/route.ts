import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

export const maxDuration = 60;

// Estado atual: datas de snapshots disponíveis.
export async function GET() {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json({ error: "Não conectado ao Bling." }, { status: 400 });
  }
  const dates = await ds.getSnapshotDates();
  return NextResponse.json({ dates, count: dates.length });
}

/**
 * POST — duas ações:
 *   { action: "snapshot" }  → salva um snapshot do estoque atual
 *   { action: "calc" }     → calcula consumo mensal entre snapshots
 *
 * Sem body ou action vazio → salva snapshot (padrão).
 */
export async function POST(req: NextRequest) {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json({ error: "Não conectado ao Bling." }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action ?? "snapshot";

    if (action === "calc") {
      const dates = await ds.getSnapshotDates();
      if (dates.length < 2) {
        return NextResponse.json({
          error: `Precisa de pelo menos 2 snapshots para calcular (tem ${dates.length}). Salve um snapshot agora e outro após alguns dias.`,
        }, { status: 400 });
      }
      const count = await ds.calcConsumptionFromSnapshots();
      return NextResponse.json({
        ok: true,
        action: "calc",
        count,
        period: { from: dates[0], to: dates[dates.length - 1] },
      });
    }

    // Padrão: salvar snapshot
    const count = await ds.saveStockSnapshot();
    const dates = await ds.getSnapshotDates();
    return NextResponse.json({
      ok: true,
      action: "snapshot",
      count,
      date: new Date().toISOString().slice(0, 10),
      totalSnapshots: dates.length,
    });
  } catch (e) {
    console.error("Consumo/snapshot falhou:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha no cálculo." },
      { status: 500 },
    );
  }
}
