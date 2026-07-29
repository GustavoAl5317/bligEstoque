import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getStore } from "@/lib/db/store";
import type { Curve } from "@/lib/bling/types";

// Lê a planilha enviada e importa a CURVA de cada produto (por SKU).
// A curva é a única informação manual da planilha — o resto vem do Bling.
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID: Curve[] = ["A", "B", "C"];

/** Normaliza o SKU: número/texto -> texto, sem ".0" no fim. */
function normSku(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().replace(/\.0+$/, "");
}

/** Acha o valor de uma coluna testando vários nomes de cabeçalho. */
function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (names.some((n) => k === n)) return row[key];
  }
  return undefined;
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

  // Procura a aba com SKU + Curva (prioriza CM-jun; depois qualquer uma).
  const preferred = wb.SheetNames.find((n) => n.toLowerCase().includes("cm"));
  const order = preferred
    ? [preferred, ...wb.SheetNames.filter((n) => n !== preferred)]
    : wb.SheetNames;

  const bySku = new Map<string, Curve>();
  let usedSheet: string | null = null;

  for (const name of order) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);
    let found = 0;
    for (const row of rows) {
      const sku = normSku(pick(row, ["sku", "código", "codigo", "cod"]));
      const raw = pick(row, ["curva", "classif.", "classif", "curva abc"]);
      const curve = String(raw ?? "").trim().toUpperCase();
      if (!sku || !VALID.includes(curve as Curve)) continue;
      bySku.set(sku, curve as Curve); // última ocorrência vence
      found++;
    }
    if (found > 0) {
      usedSheet = name;
      break;
    }
  }

  if (bySku.size === 0) {
    return NextResponse.json(
      {
        error:
          "Não encontrei colunas de SKU e Curva na planilha. Confira se a aba tem essas colunas.",
      },
      { status: 400 },
    );
  }

  // Agrupa por curva e grava em lote.
  const groups: Record<Curve, string[]> = { A: [], B: [], C: [] };
  for (const [sku, curve] of bySku) groups[curve].push(sku);

  const store = getStore();
  for (const curve of VALID) {
    if (groups[curve].length > 0) await store.setProductCurves(groups[curve], curve);
  }

  return NextResponse.json({
    ok: true,
    sheet: usedSheet,
    total: bySku.size,
    byCurve: { A: groups.A.length, B: groups.B.length, C: groups.C.length },
  });
}
