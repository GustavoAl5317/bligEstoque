// Tipos de domínio do sistema de reposição.
// Espelham os dados que virão da API do Bling (produtos, estoque, fornecedores).

export type Curve = "A" | "B" | "C";

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
  /** Classificação ABC do produto. */
  curve: Curve;
  /** Saldo de estoque atual (Bling: estoque.saldoVirtualTotal). */
  stock: number;
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
