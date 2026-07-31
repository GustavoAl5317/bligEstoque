import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// Diagnóstico: mostra se os kits da conta têm composição cadastrada no Bling.
// Abra /api/bling/inspect-kits (ou ?sku=CODIGO para checar um produto específico).
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const ds = await tryCreateBlingDataSource();
  if (!ds) {
    return NextResponse.json({ error: "Não conectado ao Bling." }, { status: 400 });
  }
  const sku = req.nextUrl.searchParams.get("sku") ?? undefined;
  try {
    const result = await ds.inspectKits(sku);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao inspecionar." },
      { status: 500 },
    );
  }
}
