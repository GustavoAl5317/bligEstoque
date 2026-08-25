// Motor de PRECIFICAÇÃO DINÂMICA de estoque excedente.
//
// Implementa a especificação: calcula, por SKU, o Estoque de Segurança (método
// estatístico), o Índice de Excesso (IE) e o desconto sugerido pela matriz
// (Curva ABC × Faixa de IE), com interpolação e teto de margem.
//
// TODOS os parâmetros vêm da CONFIG editável (a "matriz em aberto") — o motor
// só aplica a fórmula. Mudou o número na tela, o motor recalcula na hora.

import type { Curve } from "@/lib/bling/types";

export interface Faixa {
  nome: string;
  /** IE a partir de (inclusive). */
  ie_min: number;
  /** IE até (exclusive); na última faixa, é o "topo da escala". */
  ie_max: number;
  /** Margem mínima que o desconto nunca pode furar (fração, ex.: 0.45 = 45%). */
  piso_margem: number;
}

export interface PricingConfig {
  /** Meses da série usada no desvio-padrão da demanda. */
  janela_meses: number;
  /** Prazo (dias) usado quando o fornecedor não tem prazo cadastrado. */
  prazo_padrao_dias: number;
  /** Fator Z (nível de serviço) por curva. */
  z_por_curva: Record<string, number>;
  /** Faixas de IE + piso de margem de cada uma. */
  faixas: Faixa[];
  /** Matriz de desconto: curva -> faixa -> [min%, max%]. */
  matriz: Record<string, Record<string, [number, number]>>;
  /** % do excedente liberado pra promoção, por prazo do fornecedor (dias). */
  prazo_liberacao: { ate_dias: number | null; pct: number }[];
}

// ---- Configuração PADRÃO (vinda da especificação; toda editável) ----

const FAIXAS_PADRAO: Faixa[] = [
  { nome: "Leve", ie_min: 1.0, ie_max: 1.5, piso_margem: 0.45 },
  { nome: "Moderado", ie_min: 1.5, ie_max: 2.5, piso_margem: 0.4 },
  { nome: "Alto", ie_min: 2.5, ie_max: 4.0, piso_margem: 0.35 },
  { nome: "Crítico", ie_min: 4.0, ie_max: 8.0, piso_margem: 0.3 },
  { nome: "Extremo", ie_min: 8.0, ie_max: 15.0, piso_margem: 0.25 },
];

// Matriz base A/B/C (spec 6.1). AB/BC/D/New derivados como ponto de partida.
const MATRIZ_PADRAO: Record<string, Record<string, [number, number]>> = {
  A: { Leve: [0, 10], Moderado: [10, 20], Alto: [20, 30], Crítico: [30, 45], Extremo: [45, 50] },
  AB: { Leve: [2, 12], Moderado: [12, 22], Alto: [22, 32], Crítico: [32, 47], Extremo: [47, 52] },
  B: { Leve: [5, 15], Moderado: [15, 25], Alto: [25, 35], Crítico: [35, 50], Extremo: [50, 55] },
  BC: { Leve: [7, 17], Moderado: [17, 27], Alto: [27, 37], Crítico: [37, 52], Extremo: [52, 57] },
  C: { Leve: [10, 20], Moderado: [20, 30], Alto: [30, 40], Crítico: [40, 55], Extremo: [55, 60] },
  D: { Leve: [10, 20], Moderado: [20, 30], Alto: [30, 40], Crítico: [40, 55], Extremo: [55, 60] },
  New: { Leve: [5, 15], Moderado: [15, 25], Alto: [25, 35], Crítico: [35, 50], Extremo: [50, 55] },
};

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  janela_meses: 12,
  prazo_padrao_dias: 30,
  z_por_curva: { A: 2.05, AB: 1.85, B: 1.65, BC: 1.46, C: 1.28, D: 1.1, New: 1.65 },
  faixas: FAIXAS_PADRAO,
  matriz: MATRIZ_PADRAO,
  prazo_liberacao: [
    { ate_dias: 15, pct: 100 },
    { ate_dias: 45, pct: 90 },
    { ate_dias: null, pct: 75 }, // acima de 45 dias
  ],
};

// ---- Entrada e saída do motor ----

export interface PricingInput {
  sku: string;
  name: string;
  curve: Curve | null;
  stock: number;
  cost: number;
  price: number;
  monthlyConsumption: number;
  leadTimeDays: number;
  /** Série mês a mês (qtd por mês) da janela — pra σ da demanda. */
  monthlySeries: number[];
}

export type PricingStatus = "promover" | "revisao" | "fora" | "sem_dado";

export interface PricingRow {
  sku: string;
  name: string;
  curve: string;
  stock: number;
  monthlyConsumption: number;
  sigmaDemanda: number;
  estoqueSeguranca: number;
  ie: number | null;
  faixa: string;
  margem: number;
  descontoSugerido: number; // %
  descontoMaximo: number; // % (teto de margem)
  descontoFinal: number; // %
  precoPromocional: number;
  excedente: number; // unidades acima da segurança
  qtdePromocao: number; // excedente liberado pelo prazo
  status: PricingStatus;
}

// Desvio-padrão amostral.
function stdDev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const varSum = values.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(varSum / (n - 1));
}

function pctLiberacao(cfg: PricingConfig, leadTimeDays: number): number {
  for (const r of cfg.prazo_liberacao) {
    if (r.ate_dias == null) return r.pct;
    if (leadTimeDays <= r.ate_dias) return r.pct;
  }
  return 100;
}

export function computePricingRow(p: PricingInput, cfg: PricingConfig): PricingRow {
  const curve = p.curve ?? "";
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const base: PricingRow = {
    sku: p.sku,
    name: p.name,
    curve,
    stock: p.stock,
    monthlyConsumption: round2(p.monthlyConsumption),
    sigmaDemanda: 0,
    estoqueSeguranca: 0,
    ie: null,
    faixa: "—",
    margem: p.price > 0 ? round2((p.price - p.cost) / p.price) : 0,
    descontoSugerido: 0,
    descontoMaximo: 0,
    descontoFinal: 0,
    precoPromocional: round2(p.price),
    excedente: 0,
    qtdePromocao: 0,
    status: "fora",
  };

  // Sem curva ou sem demanda medível → não dá pra classificar excesso.
  if (!curve || !cfg.z_por_curva[curve]) {
    return { ...base, status: "sem_dado" };
  }

  const sigma = stdDev(p.monthlySeries);
  // Prazo do fornecedor; se não cadastrado (0), usa o prazo padrão da config.
  const leadDias = p.leadTimeDays > 0 ? p.leadTimeDays : cfg.prazo_padrao_dias || 30;
  const prazoMeses = leadDias / 30;
  const sigmaComb = Math.sqrt(prazoMeses * sigma ** 2); // σ_prazo = 0 (sem histórico)
  const z = cfg.z_por_curva[curve];
  const estoqueSeg = z * sigmaComb;

  base.sigmaDemanda = round2(sigma);
  base.estoqueSeguranca = Math.round(estoqueSeg);

  // Sem variância de demanda (item sem giro) → não entra na régua.
  if (estoqueSeg <= 0) return { ...base, status: "sem_dado" };

  const ie = p.stock / estoqueSeg;
  base.ie = round2(ie);
  base.excedente = Math.max(0, p.stock - estoqueSeg);

  // IE <= 1 → estoque no nível certo, não promociona.
  if (ie <= 1.0) return { ...base, status: "fora" };

  // Acha a faixa (a última cobre até o "topo da escala").
  const faixas = cfg.faixas;
  let faixa = faixas.find((f) => ie >= f.ie_min && ie < f.ie_max);
  if (!faixa && ie >= faixas[faixas.length - 1].ie_min) faixa = faixas[faixas.length - 1];
  if (!faixa) return { ...base, status: "fora" };
  base.faixa = faixa.nome;

  // Interpolação dentro da faixa (evita saltos).
  const range = cfg.matriz[curve]?.[faixa.nome] ?? [0, 0];
  const ieClamped = Math.min(ie, faixa.ie_max);
  const span = faixa.ie_max - faixa.ie_min;
  const frac = span > 0 ? (ieClamped - faixa.ie_min) / span : 0;
  const descSugerido = range[0] + frac * (range[1] - range[0]); // %

  // Teto pela margem: nunca furar o piso da faixa.
  const margem = p.price > 0 ? (p.price - p.cost) / p.price : 0;
  const piso = faixa.piso_margem;
  const descMax = piso < 1 ? Math.max(0, 1 - (1 - margem) / (1 - piso)) : 0; // fração

  const descFinalFrac = Math.min(descSugerido / 100, descMax);
  const excedeMargem = descSugerido / 100 > descMax + 1e-9;

  base.descontoSugerido = round2(descSugerido);
  base.descontoMaximo = round2(descMax * 100);
  base.descontoFinal = round2(descFinalFrac * 100);
  base.precoPromocional = round2(p.price * (1 - descFinalFrac));

  const pct = pctLiberacao(cfg, leadDias);
  base.qtdePromocao = Math.ceil(base.excedente * (pct / 100));

  base.status = excedeMargem ? "revisao" : "promover";
  return base;
}

/** Roda o motor para uma lista de produtos. */
export function computePricing(inputs: PricingInput[], cfg: PricingConfig): PricingRow[] {
  return inputs
    .map((p) => computePricingRow(p, cfg))
    .sort((a, b) => (b.ie ?? 0) - (a.ie ?? 0)); // maior excesso primeiro
}
