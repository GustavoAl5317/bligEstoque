// Fonte de dados real da API do Bling v3.
//
// A conta tem milhares de produtos, então NÃO buscamos tudo do Bling a cada
// abertura de tela (seria lento e daria timeout). Em vez disso:
//   - syncProducts() busca todos os produtos do Bling e grava no banco (cache);
//   - listProducts()/listSuppliers() leem do cache (rápido) e cruzam com as
//     configurações internas (curva, prazo, consumo mensal).
//
// Campos confirmados na API real (GET /produtos):
//   codigo -> SKU · nome -> nome · preco -> preço de venda ·
//   precoCusto -> custo · estoque.saldoVirtualTotal -> saldo.
// (O fornecedor por produto não vem nessa listagem — fica como próximo passo.)

import type { BlingDataSource, Product, Supplier } from "./types";
import { getValidAccessToken } from "./token-manager";
import { getStore, type CachedProduct } from "@/lib/db/store";

const BASE_URL = "https://www.bling.com.br/Api/v3";
const PAGE_LIMIT = 100;
const MAX_PAGES = 100; // trava de segurança (até 10.000 produtos)

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

  // ---- Leitura para a interface (do cache no banco) ----

  async listProducts(): Promise<Product[]> {
    const store = getStore();
    const [cached, curves, consumption] = await Promise.all([
      store.getCachedProducts(),
      store.getProductCurves(),
      store.getMonthlyConsumption(),
    ]);
    return cached.map((p) => ({
      id: p.sku,
      sku: p.sku,
      name: p.name,
      supplierId: p.supplierId || "sem-fornecedor",
      curve: curves[p.sku] ?? "C",
      stock: p.stock,
      cost: p.cost,
      price: p.price,
      monthlyConsumption: consumption[p.sku] ?? 0,
      monthlyConsumptionStdDev: 0,
    }));
  }

  async listSuppliers(): Promise<Supplier[]> {
    const [cached, leadTimes] = await Promise.all([
      getStore().getCachedProducts(),
      getStore().getSupplierLeadTimes(),
    ]);
    const byId = new Map<string, Supplier>();
    for (const p of cached) {
      const id = p.supplierId || "sem-fornecedor";
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          name: p.supplierName || "Sem fornecedor",
          leadTimeDays: leadTimes[id] ?? 0,
        });
      }
    }
    return [...byId.values()];
  }

  // ---- Sincronização (busca do Bling e grava no cache) ----

  /** Busca todos os produtos do Bling e regrava o cache. Retorna a quantidade. */
  async syncProducts(): Promise<number> {
    const produtos: Json[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await this.get<{ data?: Json[] }>(
        `/produtos?pagina=${page}&limite=${PAGE_LIMIT}`,
      );
      const data = res.data ?? [];
      produtos.push(...data);
      if (data.length < PAGE_LIMIT) break;
    }

    const cache: CachedProduct[] = produtos
      .filter((p) => str(p.tipo, "P") === "P" && str(p.codigo) !== "")
      .map((p) => {
        const estoque = (p.estoque as Json) ?? {};
        return {
          sku: str(p.codigo),
          name: str(p.nome, str(p.codigo)),
          cost: num(p.precoCusto),
          price: num(p.preco),
          stock: num(estoque.saldoVirtualTotal),
          supplierId: "",
          supplierName: "",
        };
      });

    // Remove SKUs duplicados (mantém o primeiro).
    const seen = new Set<string>();
    const unique = cache.filter((p) =>
      seen.has(p.sku) ? false : (seen.add(p.sku), true),
    );

    await getStore().replaceProductCache(unique);
    return unique.length;
  }
}

/** Cria a fonte real se houver token válido; caso contrário, retorna null. */
export async function tryCreateBlingDataSource(): Promise<BlingApiDataSource | null> {
  const token = await getValidAccessToken();
  return token ? new BlingApiDataSource(token) : null;
}
