import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { lastYms } from "@/lib/bling/real";

// Diagnóstico do estado do consumo/kits.
// Abra /api/bling/diag (ou ?sku=CODIGO para checar um produto específico).
export async function GET(req: NextRequest) {
  const store = getStore();
  const sku = req.nextUrl.searchParams.get("sku") ?? undefined;

  const [kits, kitJob, consJob, months, itemCons, listingCm, serie] =
    await Promise.all([
      store.getKitComponents(),
      store.getKitJob(),
      store.getConsumptionJob(),
      store.getMonthlyTotals(),
      // Consumo que o RELATÓRIO usa (vendas por item, kits decompostos).
      store.getItemConsumption(lastYms(12)),
      // Consumo que a tela PRODUTOS E CURVAS usa (monthly_consumption.cm).
      store.getMonthlyConsumption(),
      // Série mês a mês do item pedido (se houver sku).
      sku ? store.getItemMonthlySeries(sku) : Promise.resolve([]),
    ]);

  // Reverso: em quantos kits MAPEADOS este sku é componente (e a soma de qtd).
  let ehComponenteDeKits = 0;
  let qtdPorVendaDessesKits = 0;
  if (sku) {
    for (const comps of Object.values(kits)) {
      const hit = comps.find((c) => c.sku === sku);
      if (hit) {
        ehComponenteDeKits++;
        qtdPorVendaDessesKits += hit.qty;
      }
    }
  }

  const skuInfo = sku
    ? {
        sku,
        ehKit: Boolean(kits[sku]),
        componentes: kits[sku] ?? [],
        // Se ehKit=true e estes vierem > 0, o consumo NÃO zerou como deveria.
        consumo_no_relatorio_12m: itemCons[sku] ?? 0,
        consumo_na_tela_curvas_cm: listingCm[sku] ?? 0,
        // Quantos kits mapeados o incluem. Se for baixo mas ele deveria estar em
        // muitos kits, é sinal de que faltam composições no Bling.
        eh_componente_de_kits_mapeados: ehComponenteDeKits,
        qtd_por_venda_desses_kits: qtdPorVendaDessesKits,
        // Consumo real mês a mês (para comparar com a contagem manual).
        serie_mensal: serie,
      }
    : null;

  return NextResponse.json({
    kits_mapeados: Object.keys(kits).length,
    kit_job: kitJob,
    consumo_job: consJob,
    meses_com_venda: months.length,
    produto: skuInfo,
  });
}
