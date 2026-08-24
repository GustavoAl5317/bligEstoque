import { NextRequest, NextResponse } from "next/server";
import { tryCreateBlingDataSource } from "@/lib/bling/real";

// Diagnóstico de produtos. Abra logado:
//   /api/bling/diag-produtos              → a listagem traz o campo "situacao"?
//   /api/bling/diag-produtos?codigo=6543  → esse SKU existe no Bling? tipo/situação?
//   /api/bling/diag-produtos?codigo=6543,6544,6503  → vários de uma vez
export async function GET(req: NextRequest) {
  const bling = await tryCreateBlingDataSource();
  if (!bling) {
    return NextResponse.json({ error: "Bling não conectado" }, { status: 400 });
  }
  const codigos = (req.nextUrl.searchParams.get("codigo") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  try {
    if (codigos.length > 0) {
      const busca = await Promise.all(
        codigos.map(async (c) => ({
          codigo: c,
          encontrados: await bling.buscarProdutoPorCodigo(c),
        })),
      );
      return NextResponse.json({ busca });
    }
    return NextResponse.json(await bling.debugProdutosSituacao());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}
