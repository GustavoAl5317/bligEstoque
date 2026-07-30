// Motor de cálculo de reposição de estoque.
//
// ATENÇÃO: esta é uma fórmula simplificada e transparente, pensada para ser
// trocada pela lógica exata da sua planilha. Toda a matemática está isolada
// aqui — o resto do app não precisa mudar quando a fórmula for ajustada.

import type { Product, Supplier } from "@/lib/bling/types";

const DAYS_IN_MONTH = 30;

export interface CalcFilters {
  /** IDs de fornecedores a incluir. Vazio = todos. */
  supplierIds: string[];
  /** Curvas a incluir. Vazio = todas. */
  curves: string[];
  /** SKUs específicos a incluir. Vazio = todos. */
  productSkus?: string[];
  /** Cobertura desejada de estoque, em dias (fallback quando não há por curva). */
  coverageDays: number;
  /** Cobertura por curva (ex.: A=60, B=30, C=30). Tem prioridade sobre coverageDays. */
  coverageByCurve?: Record<string, number>;
  /** Fator de segurança (nº de desvios padrão). 0 = sem estoque de segurança. */
  safetyFactor: number;
  /** Override opcional do prazo de produção (dias). Vazio = usa o do fornecedor. */
  leadTimeOverrideDays?: number | null;
}

export interface SuggestionRow {
  productId: string;
  sku: string;
  name: string;
  supplierName: string;
  curve: string;
  currentStock: number;
  monthlyConsumption: number;
  leadTimeDays: number;
  dailyDemand: number;
  safetyStock: number;
  /** Quantidade sugerida de compra (unidades). */
  suggestedQty: number;
  cost: number;
  /** suggestedQty * cost. */
  totalCost: number;
}

export interface SuggestionResult {
  rows: SuggestionRow[];
  totals: {
    items: number;
    units: number;
    cost: number;
  };
}

/**
 * Calcula a quantidade sugerida de compra para um produto.
 *
 * MODELO FIEL À PLANILHA DO CLIENTE (aba "Geral", coluna "Qntd. Compra"):
 *
 *   ARREDONDA.PARA.CIMA(
 *     MÁX(0, (CM/30)*Cobertura − MÁX(0, EstoqueFinal − (CM/30)*Prazo))
 *   )
 *
 * Em palavras:
 *   demandaDiaria    = consumoMensal / 30
 *   estoqueNaChegada = máx(0, estoqueFinal − demandaDiaria * prazo)   -> o que ainda
 *                      sobra no estoque quando o pedido chega
 *   demandaCobertura = demandaDiaria * cobertura   -> quanto o pedido deve cobrir
 *   sugestao         = teto(máx(0, demandaCobertura − estoqueNaChegada))
 *
 * O estoque de segurança (desvio padrão) NÃO existe na planilha atual dela —
 * é uma melhoria pedida no anúncio, aqui somada de forma opcional. Com
 * fatorSeguranca = 0, o resultado é idêntico ao da planilha.
 */
function calcProduct(
  product: Product,
  leadTimeDays: number,
  filters: CalcFilters,
  supplierName: string,
): SuggestionRow {
  const dailyDemand = product.monthlyConsumption / DAYS_IN_MONTH;
  const dailyStdDev = product.monthlyConsumptionStdDev / Math.sqrt(DAYS_IN_MONTH);

  const coverageDays =
    (product.curve && filters.coverageByCurve?.[product.curve]) ??
    filters.coverageDays;
  // Estoque final = estoque do dia + o que está em produção no fornecedor.
  const effectiveStock = product.stock + (product.inProduction ?? 0);
  const stockAtArrival = Math.max(0, effectiveStock - dailyDemand * leadTimeDays);
  const coverageDemand = dailyDemand * coverageDays;
  const safetyStock =
    filters.safetyFactor * dailyStdDev * Math.sqrt(Math.max(leadTimeDays, 0));

  const raw = coverageDemand + safetyStock - stockAtArrival;
  const suggestedQty = Math.max(0, Math.ceil(raw));

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    supplierName,
    curve: product.curve ?? "",
    // Estoque considerado no cálculo = estoque do dia + em produção.
    currentStock: effectiveStock,
    monthlyConsumption: product.monthlyConsumption,
    leadTimeDays,
    dailyDemand: round(dailyDemand, 2),
    safetyStock: Math.round(safetyStock),
    suggestedQty,
    cost: product.cost,
    totalCost: round(suggestedQty * product.cost, 2),
  };
}

export function calcReplenishment(
  products: Product[],
  suppliers: Supplier[],
  filters: CalcFilters,
): SuggestionResult {
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const skuSet = new Set(filters.productSkus ?? []);

  const rows = products
    .filter((p) => filters.supplierIds.length === 0 || filters.supplierIds.includes(p.supplierId))
    .filter(
      (p) =>
        filters.curves.length === 0 ||
        (p.curve != null && filters.curves.includes(p.curve)),
    )
    .filter((p) => skuSet.size === 0 || skuSet.has(p.sku))
    .map((p) => {
      const supplier = supplierById.get(p.supplierId);
      const leadTimeDays =
        filters.leadTimeOverrideDays != null && filters.leadTimeOverrideDays > 0
          ? filters.leadTimeOverrideDays
          : supplier?.leadTimeDays ?? 0;
      return calcProduct(p, leadTimeDays, filters, supplier?.name ?? "—");
    })
    // Mais úteis primeiro: quem precisa comprar aparece no topo.
    .sort((a, b) => b.suggestedQty - a.suggestedQty);

  const totals = rows.reduce(
    (acc, r) => {
      if (r.suggestedQty > 0) acc.items += 1;
      acc.units += r.suggestedQty;
      acc.cost += r.totalCost;
      return acc;
    },
    { items: 0, units: 0, cost: 0 },
  );
  totals.cost = round(totals.cost, 2);

  return { rows, totals };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
