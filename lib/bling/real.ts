// Fonte de dados real da API do Bling v3.
//
// Combina três origens do Bling e as configurações internas do sistema:
//   /produtos          -> cadastro (SKU, nome, preços, fornecedor)
//   /estoques/saldos   -> saldo de estoque
//   store (banco)      -> curva ABC (manual), prazo por fornecedor, consumo mensal
//
// NOTA: os nomes exatos de alguns campos da resposta do Bling só podem ser
// confirmados com uma conta real conectada. Por isso o mapeamento é defensivo
// (usa valores padrão quando um campo não vem) e está centralizado em mapProduto().

import type { BlingDataSource, Curve, Product, Supplier } from "./types";
import { getValidAccessToken } from "./token-manager";
import { getStore } from "@/lib/db/store";

const BASE_URL = "https://www.bling.com.br/Api/v3";
const PAGE_LIMIT = 100;

type Json = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : fallback;
}

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

export class BlingApiDataSource implements BlingDataSource {
  readonly source = "bling" as const;

  constructor(private readonly accessToken: string) {}

  private async get<T = Json>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Bling API ${path} respondeu ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /** Busca todas as páginas de um endpoint que retorna { data: [...] }. */
  private async getAll(path: string): Promise<Json[]> {
    const out: Json[] = [];
    for (let page = 1; ; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const res = await this.get<{ data?: Json[] }>(
        `${path}${sep}pagina=${page}&limite=${PAGE_LIMIT}`,
      );
      const data = res.data ?? [];
      out.push(...data);
      if (data.length < PAGE_LIMIT) break;
      if (page > 200) break; // trava de segurança
    }
    return out;
  }

  async listSuppliers(): Promise<Supplier[]> {
    const leadTimes = await getStore().getSupplierLeadTimes();
    // Fornecedores no Bling são contatos do tipo "Fornecedor".
    const contatos = await this.getAll("/contatos?idTipoContato=fornecedor").catch(
      () => [] as Json[],
    );
    return contatos.map((c) => {
      const id = str(c.id);
      return {
        id,
        name: str(c.nome, `Fornecedor ${id}`),
        leadTimeDays: leadTimes[id] ?? 0,
      };
    });
  }

  async listProducts(): Promise<Product[]> {
    const [store, saldos] = await Promise.all([
      Promise.resolve(getStore()),
      this.fetchSaldosBySku(),
    ]);
    const [curves, consumption] = await Promise.all([
      store.getProductCurves(),
      store.getMonthlyConsumption(),
    ]);

    const produtos = await this.getAll("/produtos");
    return produtos.map((p) => this.mapProduto(p, saldos, curves, consumption));
  }

  /** Saldos de estoque indexados por SKU (código do produto). */
  private async fetchSaldosBySku(): Promise<Record<string, number>> {
    const saldos = await this.getAll("/estoques/saldos").catch(
      () => [] as Json[],
    );
    const bySku: Record<string, number> = {};
    for (const s of saldos) {
      const produto = (s.produto as Json) ?? {};
      const sku = str(produto.codigo ?? s.codigo);
      if (sku) bySku[sku] = num(s.saldoVirtualTotal ?? s.saldoFisicoTotal);
    }
    return bySku;
  }

  private mapProduto(
    p: Json,
    saldos: Record<string, number>,
    curves: Record<string, Curve>,
    consumption: Record<string, number>,
  ): Product {
    const sku = str(p.codigo, str(p.id));
    const fornecedor = (p.fornecedor as Json) ?? {};
    const supplierId = str(fornecedor.id ?? fornecedor.contato ?? "sem-fornecedor");

    return {
      id: str(p.id, sku),
      sku,
      name: str(p.nome, sku),
      supplierId,
      curve: curves[sku] ?? "C",
      stock: saldos[sku] ?? num(p.estoque),
      cost: num(p.precoCusto ?? (p.custo as Json)?.custoMedio),
      price: num(p.preco),
      monthlyConsumption: consumption[sku] ?? 0,
      monthlyConsumptionStdDev: 0,
    };
  }
}

/** Cria a fonte real se houver token válido; caso contrário, retorna null. */
export async function tryCreateBlingDataSource(): Promise<BlingApiDataSource | null> {
  const token = await getValidAccessToken();
  return token ? new BlingApiDataSource(token) : null;
}
