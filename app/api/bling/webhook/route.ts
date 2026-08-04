import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getStore } from "@/lib/db/store";

// Webhook de ESTOQUE do Bling. A cada movimentação física (venda, NF, kit dando
// baixa nos componentes, etc.), o Bling manda o novo saldo. A gente calcula a
// SAÍDA = queda do saldo e acumula por item/mês — é o consumo real, já com kits.
//
// Configurar no Bling: evento "Estoque", URL desta rota. A assinatura é validada
// com HMAC-SHA256 usando o BLING_CLIENT_SECRET (header X-Bling-Signature-256).
export const runtime = "nodejs";
export const maxDuration = 30;

type Json = Record<string, unknown>;

/** Procura, em profundidade rasa, o primeiro número em vários nomes possíveis. */
function pickNum(obj: Json | undefined, names: string[]): number | null {
  if (!obj) return null;
  for (const n of names) {
    const v = obj[n];
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
}

function pickId(obj: Json | undefined, names: string[]): string | null {
  if (!obj) return null;
  for (const n of names) {
    const v = obj[n];
    if (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) {
      return String(v);
    }
  }
  return null;
}

export async function GET() {
  const store = getStore();
  const [status, debug] = await Promise.all([
    store.getStockExitStatus(),
    store.getWebhookDebug(),
  ]);
  return NextResponse.json({ status, ultimos_eventos: debug });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Validação da assinatura (HMAC-SHA256 do corpo com o client secret).
  const secret = process.env.BLING_CLIENT_SECRET;
  const sig = req.headers.get("x-bling-signature-256") || "";
  if (secret) {
    const expected =
      "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    const ok =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) {
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
  }

  let body: Json;
  try {
    body = JSON.parse(raw) as Json;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const store = getStore();
  // Guarda o payload cru para depuração (ajuda a ajustar os campos).
  await store.saveWebhookDebug(event, raw).catch(() => {});

  // Só tratamos eventos de estoque.
  if (!event.startsWith("stock")) {
    return NextResponse.json({ ok: true, ignorado: event });
  }

  const data = (body.data ?? {}) as Json;
  const produto = (data.produto ?? {}) as Json;

  const blingId =
    pickId(produto, ["id"]) ??
    pickId(data, ["produtoId", "idProduto", "produto_id", "id"]);
  const saldo = pickNum(data, [
    "saldoFisico",
    "saldoFisicoTotal",
    "saldo",
    "saldoVirtual",
    "saldoVirtualTotal",
    "quantidade",
    "estoque",
  ]);

  if (!blingId || saldo == null) {
    // Não conseguimos ler os campos: já ficou salvo no debug para ajustarmos.
    return NextResponse.json({ ok: true, aviso: "campos não reconhecidos" });
  }

  const dateStr = typeof body.date === "string" ? body.date : "";
  const ym = (dateStr || new Date().toISOString()).slice(0, 7); // YYYY-MM

  const sku = await store.getSkuByBlingId(blingId);
  const r = await store.recordStockBalance(blingId, sku, saldo, ym);

  return NextResponse.json({ ok: true, sku, ...r });
}
