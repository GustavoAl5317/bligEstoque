import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getStore } from "@/lib/db/store";

// "Em produção no fornecedor": quantidades importadas que somam ao estoque
// na hora de calcular a compra. Um snapshot — cada importação substitui o total.
export const runtime = "nodejs";
export const maxDuration = 60;

/** Normaliza o SKU: número/texto -> texto, sem ".0" no fim. */
function normSku(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().replace(/\.0+$/, "");
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Acha o valor de uma coluna testando vários nomes de cabeçalho. */
function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (names.some((n) => k === n)) return row[key];
  }
  return undefined;
}

const SKU_COLS = ["sku", "código", "codigo", "cod"];
const QTY_COLS = [
  "quantidade",
  "qtd",
  "qtde",
  "em produção",
  "em producao",
  "produção",
  "producao",
  "produzindo",
  "quantidade em produção",
];

// Lista o que está em produção (só os produtos com quantidade > 0).
export async function GET() {
  const rows = await getStore().getProductsForListing();
  const items = rows
    .filter((r) => r.inProduction > 0)
    .map((r) => ({ sku: r.sku, name: r.name, inProduction: r.inProduction }));
  const totalUnits = items.reduce((a, r) => a + r.inProduction, 0);
  return NextResponse.json({ items, count: items.length, totalUnits });
}

// Importa a planilha (SKU + quantidade) e substitui o "em produção".
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
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);
    let found = 0;
    for (const row of rows) {
      const sku = normSku(pick(row, SKU_COLS));
      const qty = num(pick(row, QTY_COLS));
      if (!sku || qty <= 0) continue;
      bySku.set(sku, (bySku.get(sku) ?? 0) + qty); // soma se o SKU repetir
      found++;
    }
    if (found > 0) break; // usa a primeira aba que tiver os dados
  }

  if (bySku.size === 0) {
    return NextResponse.json(
      {
        error:
          "Não encontrei colunas de SKU e Quantidade na planilha. Confira os cabeçalhos.",
      },
      { status: 400 },
    );
  }

  const entries = [...bySku.entries()].map(([sku, qty]) => ({ sku, qty }));
  await getStore().replaceProductionIncoming(entries);
  const totalUnits = entries.reduce((a, e) => a + e.qty, 0);
  return NextResponse.json({ ok: true, count: entries.length, totalUnits });
}

// Zera o "em produção".
export async function DELETE() {
  await getStore().clearProductionIncoming();
  return NextResponse.json({ ok: true });
}
