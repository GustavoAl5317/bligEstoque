import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getDataSource } from "@/lib/bling/client";
import { getStore } from "@/lib/db/store";

export const runtime = "nodejs";
export const maxDuration = 30;

function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (names.some((n) => k === n)) return row[key];
  }
  return undefined;
}
function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const NOME_COLS = ["fornecedor", "forne", "nome", "fornecedor nome"];
const PRAZO_COLS = ["prazo", "prazo forne", "prazo fornecedor", "dias", "prazo (dias)"];

// Importa a planilha (Fornecedor + Prazo em dias) e grava o prazo de cada um.
// Casa pelo NOME do fornecedor (igual ao que aparece no sistema).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo da planilha." }, { status: 400 });
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Não consegui ler o arquivo (.xlsx)." }, { status: 400 });
  }

  // Mapa nome(min) -> id do fornecedor.
  const ds = await getDataSource();
  const suppliers = await ds.listSuppliers();
  const idByName = new Map(suppliers.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const store = getStore();
  let aplicados = 0;
  const naoEncontrados: string[] = [];
  const vistos = new Set<string>();

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);
    let achouAlgo = false;
    for (const row of rows) {
      const nome = String(pick(row, NOME_COLS) ?? "").trim();
      const dias = num(pick(row, PRAZO_COLS));
      if (!nome || !Number.isFinite(dias)) continue;
      achouAlgo = true;
      const key = nome.toLowerCase();
      if (vistos.has(key)) continue;
      vistos.add(key);
      const id = idByName.get(key);
      if (!id) {
        naoEncontrados.push(nome);
        continue;
      }
      await store.setSupplierLeadTime(id, Math.max(0, Math.round(dias)));
      aplicados++;
    }
    if (achouAlgo) break; // usa a primeira aba com dados
  }

  if (aplicados === 0 && naoEncontrados.length === 0) {
    return NextResponse.json(
      { error: "Não achei colunas de Fornecedor e Prazo na planilha. Confira os cabeçalhos." },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    aplicados,
    nao_encontrados: naoEncontrados.slice(0, 50),
    total_nao_encontrados: naoEncontrados.length,
  });
}
