// Tipos de domínio do sistema de reposição.
// Espelham os dados que virão da API do Bling (produtos, estoque, fornecedores).

export type Curve = "A" | "AB" | "B" | "BC" | "C" | "D" | "New";

/** Todas as curvas, na ordem em que aparecem na interface. */
export const CURVES: Curve[] = ["A", "AB", "B", "BC", "C", "D", "New"];

/** Cobertura (dias) padrão de cada curva — base na planilha da cliente. */
export const DEFAULT_COVERAGE_BY_CURVE: Record<Curve, number> = {
  A: 60,
  AB: 45,
  B: 30,
  BC: 30,
  C: 30,
  D: 30,
  New: 30,
};

export interface Supplier {
  id: string;
  name: string;
  /** Prazo de produção/entrega padrão do fornecedor, em dias. */
  leadTimeDays: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  supplierId: string;
  /** Código do produto no fornecedor (para fazer o pedido). */
  supplierCode: string;
  /** Descrição do produto no fornecedor. */
  supplierDesc: string;
  /** Classificação ABC do produto. null = não classificado. */
  curve: Curve | null;
  /** Saldo de estoque atual (Bling: estoque.saldoVirtualTotal). */
  stock: number;
  /** Quantidade em produção no fornecedor (importada). Soma ao estoque no cálculo. */
  inProduction: number;
  /** Custo unitário de compra. */
  cost: number;
  /** Preço de venda. */
  price: number;
  /** Consumo médio mensal (unidades). Hoje calculado 1x/mês na planilha. */
  monthlyConsumption: number;
  /** Desvio padrão do consumo mensal (para o fator de segurança). */
  monthlyConsumptionStdDev: number;
}

/** Fonte de dados de estoque/produtos — implementada por mock e, futuramente, pela API do Bling. */
export interface BlingDataSource {
  /** Identifica a origem dos dados para exibição na interface. */
  readonly source: "mock" | "bling";
  listSuppliers(): Promise<Supplier[]>;
  listProducts(): Promise<Product[]>;
}
