import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getStore } from "@/lib/db/store";

// Importa o CONSUMO MENSAL (CM) por produto a partir da planilha da cliente.
// Esse consumo tem PRECEDÊNCIA sobre o calculado pelas vendas (é o número real
// dela, que já conta as saídas via kit).
export const runtime = "nodejs";
export const maxDuration = 60;

/** Normaliza o SKU: número/texto -> texto, sem ".0" no fim. */
function normSku(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().replace(/\.0+$/, "");
}

/** Converte para número aceitando vírgula decimal ("186,7") e ponto. */
function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Acha o valor de uma coluna testando vários nomes de cabeçalho. */
function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (names.some((n) => k === n)) return row[key];
  }
  return undefined;
}

export async function GET() {
  const manual = await getStore().getManualConsumption();
  return NextResponse.json({ count: Object.keys(manual).length });
}

export async function DELETE() {
  await getStore().clearManualConsumption();
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo da planilha." }, { status: 400 });
  }

  let wb: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json(
      { error: "Não consegui ler o arquivo. Envie um Excel (.xlsx)." },
      { status: 400 },
    );
  }

  const bySku = new Map<string, number>();

  // Estratégia A — template simples: colunas com cabeçalho SKU e Consumo/CM.
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);
    let found = 0;
    for (const row of rows) {
      const sku = normSku(pick(row, ["sku", "código", "codigo", "cod"]));
      const cm = toNum(
        pick(row, ["cm", "consumo mensal", "consumo", "consumo/mês", "consumo/mes"]),
      );
      if (!sku || cm == null || cm < 0) continue;
      bySku.set(sku, cm); // última ocorrência vence
      found++;
    }
    if (found > 0) break;
  }

  // Estratégia B — planilha da cliente: aba "CONSUMO MENSAL", código na coluna C
  // (índice 2) e o CM GERAL na coluna H (índice 7).
  if (bySku.size === 0) {
    const sheetName =
      wb.SheetNames.find((n) => n.trim().toUpperCase() === "CONSUMO MENSAL") ??
      wb.SheetNames.find((n) => n.toLowerCase().includes("consumo")) ??
      wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      raw: true,
    });
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const sku = normSku(row[2]);
      const cm = toNum(row[7]);
      // Só linhas de dado: SKU numérico e CM numérico válido.
      if (!/^\d+$/.test(sku) || cm == null || cm < 0) continue;
      bySku.set(sku, cm);
    }
  }

  if (bySku.size === 0) {
    return NextResponse.json(
      {
        error:
          "Não encontrei o consumo na planilha. Use o modelo (colunas SKU e Consumo Mensal) ou a aba 'CONSUMO MENSAL' com o código na coluna C e o CM na coluna H.",
      },
      { status: 400 },
    );
  }

  const entries = [...bySku].map(([sku, cm]) => ({ sku, cm }));
  await getStore().replaceManualConsumption(entries);

  return NextResponse.json({ ok: true, total: entries.length });
}
