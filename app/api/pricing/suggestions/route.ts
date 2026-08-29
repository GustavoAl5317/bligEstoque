import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/bling/client";
import { getStore } from "@/lib/db/store";
import { lastYms } from "@/lib/bling/real";
import {
  computePricing,
  DEFAULT_PRICING_CONFIG,
  type PricingConfig,
  type PricingInput,
} from "@/lib/calc/pricing";

// Roda o motor de precificação dinâmica sobre todos os produtos e devolve os
// que estão em EXCESSO (com desconto sugerido). Lê os parâmetros da config
// editável — muda a matriz, muda o resultado aqui.
export async function GET() {
  const store = getStore();
  const [cfgRaw, ds, series] = await Promise.all([
    store.getAppConfig("pricing_config"),
    getDataSource(),
    store.getAllMonthlySeries(),
  ]);
  const cfg = (cfgRaw as PricingConfig | null) ?? DEFAULT_PRICING_CONFIG;

  const [products, suppliers] = await Promise.all([
    ds.listProducts(),
    ds.listSuppliers(),
  ]);
  const leadBySupplier = new Map(suppliers.map((s) => [s.id, s.leadTimeDays]));
  const yms = lastYms(cfg.janela_meses);

  const inputs: PricingInput[] = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    curve: p.curve,
    stock: p.stock,
    cost: p.cost,
    price: p.price,
    monthlyConsumption: p.monthlyConsumption,
    leadTimeDays: leadBySupplier.get(p.supplierId) ?? 0,
    monthlySeries: yms.map((ym) => series[p.sku]?.[ym] ?? 0),
  }));

  const all = computePricing(inputs, cfg);
  // Contagem por faixa (só dos que entram em promoção: IE > 1).
  const por_faixa: Record<string, number> = {};
  for (const f of cfg.faixas) por_faixa[f.nome] = 0;
  for (const r of all) {
    if ((r.status === "promover" || r.status === "revisao") && por_faixa[r.faixa] != null) {
      por_faixa[r.faixa]++;
    }
  }
  const resumo = {
    promover: all.filter((r) => r.status === "promover").length,
    revisao: all.filter((r) => r.status === "revisao").length,
    fora: all.filter((r) => r.status === "fora").length,
    sem_dado: all.filter((r) => r.status === "sem_dado").length,
    total: all.length,
    por_faixa,
  };
  // Diagnóstico: quantos produtos têm cada insumo necessário (pra achar o que
  // está zerado pra todo mundo quando ninguém é calculado).
  const diagnostico = {
    total: inputs.length,
    com_curva: inputs.filter((p) => p.curve).length,
    com_prazo_fornecedor: inputs.filter((p) => p.leadTimeDays > 0).length,
    com_serie_de_vendas: inputs.filter((p) => p.monthlySeries.some((v) => v > 0)).length,
    com_estoque: inputs.filter((p) => p.stock > 0).length,
  };
  // Devolve TODOS os produtos (com status) — a cliente quer exportar tudo, e os
  // que não entram em promoção aparecem como "Não promover".
  return NextResponse.json({
    config: cfg,
    resumo,
    diagnostico,
    rows: all,
    geradoEm: new Date().toISOString(),
  });
}
