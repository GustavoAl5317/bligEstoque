import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { CURVES, type Curve } from "@/lib/bling/types";

// Lista os produtos com fornecedor e curva atual (para a tela de curvas).
// Lê direto do cache do banco numa consulta só (rápido) — não chama o Bling.
export async function GET() {
  const rows = await getStore().getProductsForListing();
  return NextResponse.json({
    products: rows.map((p) => ({ id: p.sku, ...p })),
  });
}

const VALID_CURVES = new Set<string>(CURVES);

/** Curva vinda do cliente: uma das válidas, ou vazio/null = não classificado. */
type IncomingCurve = Curve | "" | null;

/**
 * Salva curvas. Aceita três formatos:
 *   { sku, curve }                    -> um produto
 *   { skus:[...], curve }             -> vários com a MESMA curva
 *   { changes:[{sku, curve}, ...] }   -> vários com curvas diferentes (lote)
 * curve vazio/null "descla­ssifica" o produto (remove a curva).
 */
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    sku?: string;
    skus?: string[];
    curve?: IncomingCurve;
    changes?: { sku: string; curve: IncomingCurve }[];
  };

  const store = getStore();

  // Normaliza tudo para uma lista de {sku, curve}.
  let changes: { sku: string; curve: IncomingCurve }[] = [];
  if (Array.isArray(body.changes)) {
    changes = body.changes;
  } else if (Array.isArray(body.skus)) {
    changes = body.skus.map((sku) => ({ sku, curve: body.curve ?? null }));
  } else if (body.sku) {
    changes = [{ sku: body.sku, curve: body.curve ?? null }];
  }

  changes = changes.filter((c) => c && typeof c.sku === "string" && c.sku);
  if (changes.length === 0) {
    return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });
  }

  // Valida e agrupa por curva (e a lista dos que ficam sem curva).
  const byCurve = new Map<Curve, string[]>();
  const toClear: string[] = [];
  for (const c of changes) {
    if (c.curve === "" || c.curve == null) {
      toClear.push(c.sku);
    } else if (VALID_CURVES.has(c.curve)) {
      const arr = byCurve.get(c.curve) ?? [];
      arr.push(c.sku);
      byCurve.set(c.curve, arr);
    } else {
      return NextResponse.json(
        { error: `Curva inválida: ${c.curve}` },
        { status: 400 },
      );
    }
  }

  for (const [curve, skus] of byCurve) await store.setProductCurves(skus, curve);
  if (toClear.length > 0) await store.clearProductCurves(toClear);

  return NextResponse.json({ ok: true, count: changes.length });
}
