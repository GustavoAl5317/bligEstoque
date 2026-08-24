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
// Pedaços que buscam DETALHE por item precisam ser menores para caber nos 60s
// da hospedagem (cada detalhe é uma consulta ao Bling, ~3/s).
const KIT_LIMIT = 25; // produtos por bloco na sincronização de kits
const SALES_LIMIT = 50; // pedidos por bloco no cálculo de consumo

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

/** Últimos `n` meses como "YYYY-MM" (do mais recente para o mais antigo). */
export function lastYms(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export class BlingApiDataSource implements BlingDataSource {
  readonly source = "bling" as const;

  constructor(private readonly accessToken: string) {}

  private async get<T = Json>(path: string, attempt = 0): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
    } catch (e) {
      // Falha de rede (conexão caiu): tenta de novo algumas vezes.
      if (attempt < 4) {
        await sleep(1000 * (attempt + 1));
        return this.get<T>(path, attempt + 1);
      }
      throw e;
    }
    // 429 = limite de requisições; 5xx = erro momentâneo do Bling.
    // Nos dois casos, espera e tenta de novo (evita derrubar o bloco inteiro).
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
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
    listHasEstrutura?: boolean;
    listItemKeys?: string[];
    componentLookup?: unknown;
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

    // Estrutura vem na LISTA de produtos ou só no detalhe? (define a estratégia de sync)
    const listResp = await this.get<{ data?: Json[] }>(`/produtos?limite=3&pagina=1`);
    const listItem = (listResp.data ?? [])[0] as Json | undefined;
    const listItemKeys = listItem ? Object.keys(listItem) : [];
    const listHasEstrutura = listItem ? "estrutura" in listItem : false;

    // O componente de um kit é localizável como produto (tem código/SKU)?
    let componentLookup: unknown = null;
    const firstEstrutura = samples[0]?.estrutura as Json | undefined;
    const comps = firstEstrutura?.componentes as Json[] | undefined;
    const compId = comps && comps.length > 0 ? str((comps[0].produto as Json)?.id) : "";
    if (compId) {
      try {
        const cd = await this.get<{ data?: Json }>(`/produtos/${compId}`);
        const c = cd.data as Json | undefined;
        componentLookup = c
          ? { id: compId, codigo: str(c.codigo), tipo: str(c.tipo), nome: str(c.nome) }
          : { id: compId, notFound: true };
      } catch {
        componentLookup = { id: compId, error: true };
      }
    }

    return {
      scanned: ids.length,
      withStructure,
      productKeys,
      samples,
      listHasEstrutura,
      listItemKeys,
      componentLookup,
    };
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

  /** Lista os depósitos do Bling (id + descrição) — p/ identificar Geral x FULL. */
  async listDepositos(): Promise<{ id: string; descricao: string; situacao: string }[]> {
    const r = await this.get<{ data?: Json[] }>(`/depositos`);
    return (r.data ?? []).map((d) => ({
      id: str(d.id),
      descricao: str(d.descricao, str(d.nome)),
      situacao: str(d.situacao),
    }));
  }

  /**
   * Saldos de UM produto por depósito (para ver quanto tem em cada um).
   * Usa GET /estoques/saldos?idsProdutos[]=... que devolve o detalhe por depósito.
   */
  async saldosPorDeposito(
    blingProductId: string,
  ): Promise<{ produtoId: string; depositos: { id: string; saldoFisico: number; saldoVirtual: number }[] }> {
    const r = await this.get<{ data?: Json[] }>(
      `/estoques/saldos?idsProdutos[]=${blingProductId}`,
    );
    const first = (r.data ?? [])[0] as Json | undefined;
    const deps = (first?.depositos as Json[] | undefined) ?? [];
    return {
      produtoId: blingProductId,
      depositos: deps.map((d) => ({
        id: str((d.deposito as Json)?.id ?? d.id),
        saldoFisico: num(d.saldoFisico),
        saldoVirtual: num(d.saldoVirtual),
      })),
    };
  }

  /**
   * Diagnóstico: pega a 1ª página de /produtos e diz se o campo "situacao" vem
   * na listagem e quais valores aparecem. Se "situacao" não vier, o filtro de
   * ativos falha aberto (deixa inativo passar).
   */
  async debugProdutosSituacao(): Promise<{
    total_na_pagina: number;
    tem_campo_situacao: boolean;
    campos_do_item: string[];
    contagem_situacao: Record<string, number>;
  }> {
    const r = await this.get<{ data?: Json[] }>(`/produtos?pagina=1&limite=100`);
    const data = r.data ?? [];
    const first = (data[0] ?? {}) as Json;
    const counts: Record<string, number> = {};
    for (const p of data) {
      const s = "situacao" in p ? String((p as Json).situacao) : "(campo ausente)";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return {
      total_na_pagina: data.length,
      tem_campo_situacao: "situacao" in first,
      campos_do_item: Object.keys(first),
      contagem_situacao: counts,
    };
  }

  /**
   * Busca no Bling um produto pelo CÓDIGO (SKU). Mostra tipo/situação — pra
   * entender por que um SKU não aparece no cadastro (inativo? não é produto?).
   */
  async buscarProdutoPorCodigo(codigo: string): Promise<
    { id: string; codigo: string; nome: string; tipo: string; situacao: string }[]
  > {
    const r = await this.get<{ data?: Json[] }>(
      `/produtos?codigo=${encodeURIComponent(codigo)}&limite=100`,
    );
    // Filtra pelo código exato (a API pode fazer busca "contém").
    return (r.data ?? [])
      .filter((p) => str(p.codigo) === codigo)
      .map((p) => ({
        id: str(p.id),
        codigo: str(p.codigo),
        nome: str(p.nome),
        tipo: str(p.tipo),
        situacao: str(p.situacao),
      }));
  }

  // ---- Sincronização (busca do Bling e grava no cache) ----

  /** Inicia a sincronização de produtos (zera cache e começa da página 1). */
  async startProductSync(): Promise<void> {
    const store = getStore();
    await store.startProductJob();
    await store.truncateProductCache();
  }

  /**
   * Processa UMA página de produtos (100): busca a listagem, mapeia para cache,
   * resolve saldo por depósito e salva no banco.
   */
  async processProductChunk(): Promise<{ done: boolean; processed: number }> {
    const store = getStore();
    const job = await store.getProductJob();
    if (!job) throw new Error("Nenhuma sincronização de produtos em andamento.");
    if (job.done) return { done: true, processed: job.processed };

    const res = await this.get<{ data?: Json[] }>(
      `/produtos?pagina=${job.nextPage}&limite=${PAGE_LIMIT}`,
    );
    const produtos = res.data ?? [];

    if (produtos.length === 0) {
      job.done = true;
      await store.saveProductProgress(job);
      return { done: true, processed: job.processed };
    }

    const cache: CachedProduct[] = produtos
      // Só produtos (tipo P), com código, e ATIVOS (situacao "A").
      .filter(
        (p) =>
          str(p.tipo, "P") === "P" &&
          str(p.codigo) !== "" &&
          str(p.situacao, "A").toUpperCase() === "A",
      )
      .map((p) => {
        return {
          blingId: str(p.id),
          sku: str(p.codigo),
          name: str(p.nome, str(p.codigo)),
          cost: num(p.precoCusto),
          price: num(p.preco),
          stock: 0, // será preenchido abaixo por depósito
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

    // Busca o saldo no depósito "Geral" para cada produto
    const depositoGeralId = process.env.BLING_DEPOSITO_GERAL || "7530561683";
    const batchSize = 20;

    const byId = new Map<string, CachedProduct>();
    for (const p of unique) {
      byId.set(p.blingId, p);
    }

    for (let i = 0; i < unique.length; i += batchSize) {
      const batch = unique.slice(i, i + batchSize);
      const query = batch.map((p) => `idsProdutos[]=${p.blingId}`).join("&");
      const started = Date.now();

      try {
        const r = await this.get<{ data?: Json[] }>(`/estoques/saldos?${query}`);
        const saldos = r.data ?? [];
        
        for (const saldo of saldos) {
          const produtoId = str(saldo.produtoId, str((saldo.produto as Json)?.id));
          const p = byId.get(produtoId);
          if (p) {
            const depositos = (saldo.depositos as Json[]) ?? [];
            const depGeral = depositos.find(
              (d) => str((d.deposito as Json)?.id ?? d.id) === depositoGeralId
            );
            if (depGeral) {
              p.stock = num(depGeral.saldoVirtual, num(depGeral.saldoFisico));
            }
          }
        }
      } catch (err) {
        console.error(`[processProductChunk] Erro ao buscar lote de saldo (índice ${i}):`, err);
      }
      
      const elapsed = Date.now() - started;
      if (i + batchSize < unique.length && elapsed < 1100) {
        await sleep(1100 - elapsed);
      }
    }

    await store.upsertProductCacheChunk(unique);
    
    job.nextPage++;
    job.processed += unique.length;
    await store.saveProductProgress(job);

    return { done: false, processed: job.processed };
  }

  /** Inicia a sincronização de fornecedores (zera a tabela e começa da página 1). */
  async startSupplierSync(): Promise<void> {
    const store = getStore();
    await store.startSupplierJob();
    await store.truncateProductSuppliers();
  }

  /**
   * Processa UMA página de links produto→fornecedor, busca o nome do fornecedor
   * e salva no banco em chunk.
   */
  async processSupplierChunk(): Promise<{ done: boolean; processed: number }> {
    const store = getStore();
    const job = await store.getSupplierJob();
    if (!job) throw new Error("Nenhuma sincronização de fornecedores em andamento.");
    if (job.done) return { done: true, processed: job.processed };

    const res = await this.get<{ data?: Json[] }>(
      `/produtos/fornecedores?pagina=${job.nextPage}&limite=${PAGE_LIMIT}`,
    );
    const rows = res.data ?? [];

    if (rows.length === 0) {
      job.done = true;
      await store.saveSupplierProgress(job);
      return { done: true, processed: job.processed };
    }

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
    await store.upsertProductSupplierChunk(links);
    
    job.nextPage++;
    job.processed += links.length;
    await store.saveSupplierProgress(job);

    return { done: false, processed: job.processed };
  }

  // ---- Composições de kits (para decompor o consumo) ----

  /** Inicia a sincronização das composições de kits (zera e começa da página 1). */
  async startKitSync(): Promise<void> {
    await getStore().startKitJob();
  }

  /**
   * Processa UMA página de produtos (100): busca o detalhe de cada um, extrai a
   * composição (estrutura.componentes) dos que são kits e grava kit→componente.
   * O componente vem por id do Bling → resolvido para SKU pelo cache. Resumível.
   */
  async processKitChunk(): Promise<{ done: boolean; processed: number; kits: number }> {
    const store = getStore();
    const job = await store.getKitJob();
    if (!job) throw new Error("Nenhuma sincronização de kits em andamento.");
    if (job.done) return { done: true, processed: job.processed, kits: job.kits };

    const idMap = await store.getBlingIdMap(); // id do Bling → SKU
    const list = await this.get<{ data?: Json[] }>(
      `/produtos?pagina=${job.nextPage}&limite=${KIT_LIMIT}`,
    );
    const items = list.data ?? [];
    const ids = items.map((p) => str(p.id)).filter(Boolean);

    const rows: { kitSku: string; componentSku: string; qty: number }[] = [];
    let kitsFound = 0;
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
        const kitSku = str(p.codigo);
        const estrutura = p.estrutura as Json | undefined;
        const comps = estrutura?.componentes as Json[] | undefined;
        if (!kitSku || !Array.isArray(comps) || comps.length === 0) continue;
        let added = false;
        for (const c of comps) {
          const compId = str((c.produto as Json)?.id);
          const qty = num(c.quantidade, 1);
          const compSku = idMap[compId];
          if (compSku && qty > 0) {
            rows.push({ kitSku, componentSku: compSku, qty });
            added = true;
          }
        }
        if (added) kitsFound++;
      }
      const elapsed = Date.now() - started;
      if (i + 3 < ids.length && elapsed < 1100) await sleep(1100 - elapsed);
    }

    await store.addKitComponents(rows);
    const processed = job.processed + items.length;
    const kits = job.kits + kitsFound;
    const done = items.length < KIT_LIMIT;
    await store.saveKitProgress({ nextPage: job.nextPage + 1, processed, kits, done });
    return { done, processed, kits };
  }

  // ---- Consumo por item (vendas com kits decompostos), por mês ----

  /** Inicia o cálculo: janela dos últimos `months` meses (padrão 12). */
  async startConsumptionCalc(months = 12): Promise<void> {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const store = getStore();
    await store.clearMonthlyItemSales();
    await store.startConsumptionJob({
      periodStart: fmt(start),
      periodEnd: fmt(end),
      months,
      nextPage: 1,
      processed: 0,
      done: false,
    });
  }

  /**
   * Processa UMA página de pedidos de venda: acha o mês de cada pedido, busca os
   * itens (em lotes, respeitando 3/s), e soma por (item, mês) — decompondo os
   * KITS nos seus componentes. No fim, grava o consumo médio (janela de 6 meses).
   */
  async processConsumptionChunk(): Promise<{
    done: boolean;
    processed: number;
    cmCount?: number;
  }> {
    const store = getStore();
    const job = await store.getConsumptionJob();
    if (!job) throw new Error("Nenhum cálculo em andamento.");
    if (job.done) return { done: true, processed: job.processed };

    const kits = await store.getKitComponents(); // kit_sku -> componentes

    const period = `dataInicial=${job.periodStart}&dataFinal=${job.periodEnd}`;
    const list = await this.get<{ data?: Json[] }>(
      `/pedidos/vendas?limite=${SALES_LIMIT}&pagina=${job.nextPage}&${period}`,
    );
    const orders = list.data ?? [];

    // Pedidos válidos (ignora cancelados, situacao 12) e o mês de cada um.
    const ymById = new Map<string, string>();
    for (const o of orders) {
      if (Number((o.situacao as Json)?.id) === 12) continue;
      const id = str(o.id);
      const ym = str(o.data).slice(0, 7); // "YYYY-MM"
      if (id && ym) ymById.set(id, ym);
    }
    const ids = [...ymById.keys()];

    const acc = new Map<string, number>(); // "sku|ym" -> qty
    const add = (sku: string, ym: string, qty: number) => {
      const k = `${sku}|${ym}`;
      acc.set(k, (acc.get(k) ?? 0) + qty);
    };

    for (let i = 0; i < ids.length; i += 3) {
      const batch = ids.slice(i, i + 3);
      const started = Date.now();
      const details = await Promise.all(
        batch.map((id) =>
          this.get<{ data?: { itens?: Json[] } }>(`/pedidos/vendas/${id}`).catch(
            () => ({ data: { itens: [] } }),
          ),
        ),
      );
      details.forEach((d, idx) => {
        const ym = ymById.get(batch[idx]) ?? "";
        if (!ym) return;
        for (const it of d.data?.itens ?? []) {
          const sku = str(it.codigo);
          const q = num(it.quantidade);
          if (!sku || q <= 0) continue;
          const comps = kits[sku];
          if (comps && comps.length > 0) {
            // KIT: o consumo vai para os itens que o formam (não para o kit).
            for (const c of comps) add(c.sku, ym, q * c.qty);
          } else {
            add(sku, ym, q);
          }
        }
      });
      const elapsed = Date.now() - started;
      if (i + 3 < ids.length && elapsed < 1100) await sleep(1100 - elapsed);
    }

    await store.addMonthlyItemSales(
      [...acc.entries()].map(([k, qty]) => {
        const [sku, ym] = k.split("|");
        return { sku, ym, qty };
      }),
    );

    const processed = job.processed + orders.length;
    const done = orders.length < SALES_LIMIT;
    await store.saveConsumptionProgress(job.nextPage + 1, processed, done);

    if (done) {
      const cmCount = await store.finalizeItemConsumption(lastYms(6));
      return { done: true, processed, cmCount };
    }
    return { done: false, processed };
  }

  // ---- Consumo mensal por snapshots de estoque (legado, não usado) ----

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
