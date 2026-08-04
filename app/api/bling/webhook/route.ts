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
  let signatureOk = false;
  if (secret && sig) {
    const expected =
      "sha256=" + crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    signatureOk =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }

  let body: Json;
  try {
    body = JSON.parse(raw) as Json;
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const store = getStore();
  // FASE DE TESTE: guardamos TODO payload cru (mesmo sem assinatura válida) para
  // descobrir o formato real que o Bling envia e ajustar. Depois de validado,
  // passamos a exigir a assinatura. O rótulo registra se a assinatura bateu.
  const label = `${event || "?"}${signatureOk ? " [sig ok]" : " [sem sig]"}`;
  await store.saveWebhookDebug(label, raw).catch(() => {});

  // Tenta achar produto + saldo em vários formatos (webhook novo ou callback
  // clássico de estoque). Procura o objeto de estoque em locais comuns.
  const data = (body.data ?? body) as Json;
  const estoque = (data.estoque ?? data) as Json;
  const produto = (data.produto ?? estoque.produto ?? {}) as Json;

  const blingId =
    pickId(produto, ["id"]) ??
    pickId(data, ["produtoId", "idProduto", "produto_id", "id"]) ??
    pickId(estoque, ["produtoId", "idProduto", "id"]);
  const saldo = pickNum(estoque, [
    "saldoFisico",
    "saldoFisicoTotal",
    "saldo",
    "saldoVirtual",
    "saldoVirtualTotal",
    "quantidade",
  ]);

  if (!blingId || saldo == null) {
    // Não conseguimos ler os campos: já ficou salvo no debug para ajustarmos.
    return NextResponse.json({ ok: true, aviso: "campos não reconhecidos", event });
  }

  const dateStr = typeof body.date === "string" ? body.date : "";
  const ym = (dateStr || new Date().toISOString()).slice(0, 7); // YYYY-MM

  const sku = await store.getSkuByBlingId(blingId);
  const r = await store.recordStockBalance(blingId, sku, saldo, ym);

  return NextResponse.json({ ok: true, sku, ...r });
}
