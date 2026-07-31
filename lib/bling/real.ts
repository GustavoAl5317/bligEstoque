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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

  private async get<T = Json>(path: string, attempt = 0): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    // 429 = limite de requisições atingido: espera e tenta de novo.
    if (res.status === 429 && attempt < 5) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1));
      return this.get<T>(path, attempt + 1);
    }
    if (!res.ok) {
      throw new Error(`Bling API ${path} respondeu ${res.status}`);
    }
    return (await res.json()) as T;
  }

  /**
   * Percorre todas as páginas de um endpoint { data: [...] } em lotes paralelos,
   * respeitando o limite de ~3 requisições/segundo do Bling (BATCH por janela).
   */
  private async paginate(makePath: (page: number) => string): Promise<Json[]> {
    const BATCH = 3;
    const WINDOW_MS = 1100;
    const out: Json[] = [];
    let page = 1;
    let done = false;
    while (!done && page <= MAX_PAGES) {
      const pages: number[] = [];
      for (let i = 0; i < BATCH && page <= MAX_PAGES; i++, page++) pages.push(page);
      const started = Date.now();
      const results = await Promise.all(
        pages.map((p) => this.get<{ data?: Json[] }>(makePath(p))),
      );
      for (const r of results) {
        const d = r.data ?? [];
        out.push(...d);
        if (d.length < PAGE_LIMIT) done = true;
      }
      const elapsed = Date.now() - started;
      if (!done && elapsed < WINDOW_MS) await sleep(WINDOW_MS - elapsed);
    }
    return out;
  }

  /**
   * Diagnóstico: olha os produtos da conta e mostra se os KITS têm composição
   * cadastrada (aba "Estrutura" do Bling). Usado para decidir como decompor o
   * consumo de kits em seus itens. Se `sku` for passado, inspeciona esse produto.
   */
  async inspectKits(sku?: string): Promise<{
    scanned: number;
    withStructure: number;
    productKeys: string[];
    samples: { sku: string; name: string; estrutura: unknown }[];
  }> {
    // Pega os IDs a inspecionar: um produto específico (por SKU) ou os primeiros da lista.
    let ids: string[] = [];
    if (sku) {
      const found = await this.get<{ data?: Json[] }>(
        `/produtos?codigo=${encodeURIComponent(sku)}&limite=5`,
      );
      ids = (found.data ?? []).map((p) => str(p.id)).filter(Boolean);
    } else {
      const list = await this.get<{ data?: Json[] }>(`/produtos?limite=100&pagina=1`);
      ids = (list.data ?? []).map((p) => str(p.id)).filter(Boolean).slice(0, 60);
    }

    const samples: { sku: string; name: string; estrutura: unknown }[] = [];
    let productKeys: string[] = [];
    let withStructure = 0;

    for (let i = 0; i < ids.length; i += 3) {
      const batch = ids.slice(i, i + 3);
      const started = Date.now();
      const details = await Promise.all(
        batch.map((id) =>
          this.get<{ data?: Json }>(`/produtos/${id}`).catch(() => ({ data: undefined })),
        ),
      );
      for (const d of details) {
        const p = d.data as Json | undefined;
        if (!p) continue;
        if (productKeys.length === 0) productKeys = Object.keys(p);
        const estrutura = p.estrutura as Json | undefined;
        const comps = estrutura?.componentes;
        if (estrutura && Array.isArray(comps) && comps.length > 0) {
          withStructure++;
          if (samples.length < 5) {
            samples.push({ sku: str(p.codigo), name: str(p.nome), estrutura });
          }
        }
      }
      const elapsed = Date.now() - started;
      if (i + 3 < ids.length && elapsed < 1100) await sleep(1100 - elapsed);
    }

    return { scanned: ids.length, withStructure, productKeys, samples };
  }

  // ---- Leitura para a interface (do cache no banco) ----

  async listProducts(): Promise<Product[]> {
    const store = getStore();
    const [cached, curves, consumption, production] = await Promise.all([
      store.getCachedProducts(),
      store.getProductCurves(),
      store.getMonthlyConsumption(),
      store.getProductionIncoming(),
    ]);
    return cached.map((p) => ({
      id: p.sku,
      sku: p.sku,
      name: p.name,
      supplierId: p.supplierId || "sem-fornecedor",
      supplierCode: p.supplierCode,
      supplierDesc: p.supplierDesc,
      curve: curves[p.sku] ?? null,
      stock: p.stock,
      inProduction: production[p.sku] ?? 0,
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
    const produtos = await this.paginate(
      (page) => `/produtos?pagina=${page}&limite=${PAGE_LIMIT}`,
    );

    const cache: CachedProduct[] = produtos
      // Só produtos (tipo P), com código, e ATIVOS (situacao "A").
      // Bling: situacao "A" = Ativo, "I" = Inativo, "E" = Excluído.
      .filter(
        (p) =>
          str(p.tipo, "P") === "P" &&
          str(p.codigo) !== "" &&
          str(p.situacao, "A").toUpperCase() === "A",
      )
      .map((p) => {
        const estoque = (p.estoque as Json) ?? {};
        return {
          blingId: str(p.id),
          sku: str(p.codigo),
          name: str(p.nome, str(p.codigo)),
          cost: num(p.precoCusto),
          price: num(p.preco),
          stock: num(estoque.saldoVirtualTotal, num(estoque.saldoFisicoTotal)),
          supplierId: "",
          supplierName: "",
          supplierCode: "",
          supplierDesc: "",
        };
      });

    // Remove SKUs duplicados (mantém o primeiro).
    const seen = new Set<string>();
    const unique = cache.filter((p) =>
      seen.has(p.sku) ? false : (seen.add(p.sku), true),
    );

    await getStore().replaceProductCache(unique);

    // Tira a foto do estoque hoje para cálculo de consumo e já atualiza o consumo médio
    await this.saveStockSnapshot();
    await this.calcConsumptionFromSnapshots();

    return unique.length;
  }

  /**
   * Busca as ligações produto→fornecedor (/produtos/fornecedores), resolve o
   * nome de cada fornecedor e grava no banco. Retorna quantos produtos ficaram
   * com fornecedor.
   */
  async syncSuppliers(): Promise<number> {
    // 1) Todas as ligações produto→fornecedor (prioriza o fornecedor padrão).
    const rows = await this.paginate(
      (page) => `/produtos/fornecedores?pagina=${page}&limite=${PAGE_LIMIT}`,
    );
    const linkByProduct = new Map<
      string,
      { supplierId: string; padrao: boolean; code: string; desc: string }
    >();
    for (const row of rows) {
      const produtoId = str((row.produto as Json)?.id);
      const fornecedorId = str((row.fornecedor as Json)?.id);
      const padrao = Boolean(row.padrao);
      if (!produtoId || !fornecedorId) continue;
      const cur = linkByProduct.get(produtoId);
      if (!cur || (padrao && !cur.padrao)) {
        linkByProduct.set(produtoId, {
          supplierId: fornecedorId,
          padrao,
          // Código e descrição do produto NO fornecedor (para o pedido).
          code: str(row.codigo),
          desc: str(row.descricao),
        });
      }
    }

    // 2) Nome de cada fornecedor único, em lotes paralelos (respeita 3/s).
    const supplierIds = [...new Set([...linkByProduct.values()].map((l) => l.supplierId))];
    const nameById = new Map<string, string>();
    for (let i = 0; i < supplierIds.length; i += 3) {
      const batch = supplierIds.slice(i, i + 3);
      const started = Date.now();
      await Promise.all(
        batch.map(async (id) => {
          try {
            const c = await this.get<{ data?: Json }>(`/contatos/${id}`);
            nameById.set(id, str(c.data?.nome, `Fornecedor ${id}`));
          } catch {
            nameById.set(id, `Fornecedor ${id}`);
          }
        }),
      );
      const elapsed = Date.now() - started;
      if (i + 3 < supplierIds.length && elapsed < 1100) await sleep(1100 - elapsed);
    }

    // 3) Grava as ligações com nome.
    const links = [...linkByProduct.entries()].map(([blingId, l]) => ({
      blingId,
      supplierId: l.supplierId,
      supplierName: nameById.get(l.supplierId) ?? `Fornecedor ${l.supplierId}`,
      supplierCode: l.code,
      supplierDesc: l.desc,
    }));
    await getStore().replaceProductSuppliers(links);
    return links.length;
  }

  // ---- Consumo mensal por snapshots de estoque ----

  /**
   * Tira uma "foto" do estoque atual (lido do cache) e salva como snapshot.
   * Cada snapshot tem a data de hoje. Chamar periodicamente (ex.: a cada sync).
   */
  async saveStockSnapshot(): Promise<number> {
    const store = getStore();
    const products = await store.getCachedProducts();
    const today = new Date().toISOString().slice(0, 10);
    const entries = products.map((p) => ({
      sku: p.sku,
      stock: p.stock,
      date: today,
    }));
    await store.saveStockSnapshot(entries);
    return entries.length;
  }

  /**
   * Calcula o consumo mensal comparando o snapshot mais antigo com o mais recente.
   * Retorna quantos SKUs foram atualizados.
   */
  async calcConsumptionFromSnapshots(): Promise<number> {
    return getStore().calcConsumptionFromSnapshots();
  }

  /** Retorna as datas de snapshots disponíveis. */
  async getSnapshotDates(): Promise<string[]> {
    return getStore().getSnapshotDates();
  }
}

/** Cria a fonte real se houver token válido; caso contrário, retorna null. */
export async function tryCreateBlingDataSource(): Promise<BlingApiDataSource | null> {
  const token = await getValidAccessToken();
  return token ? new BlingApiDataSource(token) : null;
}
