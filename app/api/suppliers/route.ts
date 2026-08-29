import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { getStore } from "@/lib/db/store";

// Fornecedores com o PRAZO de entrega (usado no estoque de segurança da
// precificação e na sugestão de compra).
export async function GET() {
  const ds = await getDataSource();
  const [suppliers, products] = await Promise.all([ds.listSuppliers(), ds.listProducts()]);
  const count: Record<string, number> = {};
  for (const p of products) count[p.supplierId] = (count[p.supplierId] ?? 0) + 1;

  const fornecedores = suppliers
    .map((s) => ({
      id: s.id,
      name: s.name,
      leadTimeDays: s.leadTimeDays,
      produtos: count[s.id] ?? 0,
    }))
    // Mais produtos primeiro (prioriza quem mais importa), depois por nome.
    .sort((a, b) => b.produtos - a.produtos || a.name.localeCompare(b.name));

  return NextResponse.json({ fornecedores });
}

// Salva o prazo de um ou vários fornecedores.
// body: { id, days }  |  { changes: [{ id, days }] }
export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as {
    id?: string;
    days?: number;
    changes?: { id: string; days: number }[];
  };
  const changes = Array.isArray(body.changes)
    ? body.changes
    : body.id
      ? [{ id: body.id, days: Number(body.days) }]
      : [];
  const valid = changes.filter((c) => c && c.id && Number.isFinite(Number(c.days)));
  if (valid.length === 0) {
    return NextResponse.json({ error: "Nada para salvar." }, { status: 400 });
  }
  const store = getStore();
  for (const c of valid) {
    await store.setSupplierLeadTime(c.id, Math.max(0, Math.round(Number(c.days))));
  }
  return NextResponse.json({ ok: true, count: valid.length });
}
