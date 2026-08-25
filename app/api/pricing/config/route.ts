import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { DEFAULT_PRICING_CONFIG, type PricingConfig } from "@/lib/calc/pricing";

const KEY = "pricing_config";

// Config da precificação dinâmica (a "matriz em aberto" — editável pela cliente).
export async function GET() {
  const store = getStore();
  const saved = (await store.getAppConfig(KEY)) as PricingConfig | null;
  return NextResponse.json({ config: saved ?? DEFAULT_PRICING_CONFIG, isDefault: !saved });
}

// Salva a config editada. Validação básica pra não gravar lixo.
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as Partial<PricingConfig>;
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray(body.faixas) ||
    typeof body.matriz !== "object" ||
    typeof body.z_por_curva !== "object"
  ) {
    return NextResponse.json({ error: "Configuração inválida." }, { status: 400 });
  }
  // Normaliza números básicos.
  const cfg: PricingConfig = {
    janela_meses: Math.max(1, Math.min(24, Number(body.janela_meses) || 12)),
    prazo_padrao_dias: Math.max(1, Math.min(365, Number(body.prazo_padrao_dias) || 30)),
    z_por_curva: body.z_por_curva as Record<string, number>,
    faixas: body.faixas.map((f) => ({
      nome: String(f.nome),
      ie_min: Number(f.ie_min) || 0,
      ie_max: Number(f.ie_max) || 0,
      piso_margem: Math.max(0, Math.min(0.99, Number(f.piso_margem) || 0)),
    })),
    matriz: body.matriz as Record<string, Record<string, [number, number]>>,
    prazo_liberacao: Array.isArray(body.prazo_liberacao)
      ? body.prazo_liberacao.map((r) => ({
          ate_dias: r.ate_dias == null ? null : Number(r.ate_dias),
          pct: Math.max(0, Math.min(100, Number(r.pct) || 0)),
        }))
      : DEFAULT_PRICING_CONFIG.prazo_liberacao,
  };
  await getStore().saveAppConfig(KEY, cfg);
  return NextResponse.json({ ok: true, config: cfg });
}

// Volta pro padrão da especificação.
export async function DELETE() {
  await getStore().saveAppConfig(KEY, DEFAULT_PRICING_CONFIG);
  return NextResponse.json({ ok: true, config: DEFAULT_PRICING_CONFIG });
}
