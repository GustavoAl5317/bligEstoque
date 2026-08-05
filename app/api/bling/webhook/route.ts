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
    await getStore().saveWebhookDebug("json inválido", raw).catch(() => {});
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const event = String(body.event ?? "");
  const store = getStore();
  const sigLabel = signatureOk ? "sig ok" : "sem sig";

  // Só interessa o ESTOQUE FÍSICO (stock.*). Ignoramos virtual_stock.* (duplicaria
  // a contagem e mistura produtos compostos), produtos, pedidos, etc.
  if (!event.startsWith("stock.")) {
    await store.saveWebhookDebug(`${event || "?"} [${sigLabel}] ignorado`, raw).catch(() => {});
    return NextResponse.json({ ok: true, ignorado: event });
  }

  // Formato real do webhook v3 (evento stock.created):
  //   data.produto.id, data.operacao ("S" saída / "E" entrada), data.quantidade
  const data = (body.data ?? {}) as Json;
  const produto = (data.produto ?? {}) as Json;
  const blingId =
    pickId(produto, ["id"]) ?? pickId(data, ["produtoId", "idProduto", "id"]);
  const operacao = typeof data.operacao === "string" ? data.operacao : "";
  const quantidade = pickNum(data, ["quantidade"]) ?? 0;

  const dateStr = typeof body.date === "string" ? body.date : "";
  const ym = (dateStr || new Date().toISOString()).slice(0, 7); // YYYY-MM

  const sku = blingId ? await store.getSkuByBlingId(blingId) : null;

  // Movimento discreto = stock.created com operacao definida (S/E) e quantidade.
  const isMovimento = event === "stock.created" && operacao !== "" && quantidade > 0;
  let outcome = "sem movimento";
  if (isMovimento && blingId) {
    const r = await store.recordStockExit(blingId, sku, quantidade, ym, operacao);
    outcome = r.recorded
      ? `saída ${quantidade} registrada`
      : operacao === "E"
        ? "entrada (ignorada)"
        : sku
          ? "não registrada"
          : "SKU não encontrado no cadastro";
  }

  // Rótulo do debug já mostra a leitura e o desfecho (facilita conferir no GET).
  const label = `${event} [${sigLabel}] id=${blingId ?? "?"} sku=${sku ?? "?"} op=${operacao || "-"} q=${quantidade || "-"} → ${outcome}`;
  await store.saveWebhookDebug(label, raw).catch(() => {});

  return NextResponse.json({ ok: true, event, blingId, sku, operacao, quantidade, outcome });
}
