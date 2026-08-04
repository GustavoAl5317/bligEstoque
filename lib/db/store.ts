// Armazenamento dos dados que o sistema mantém por conta própria (não vêm do Bling):
//   - token de acesso do Bling (OAuth);
//   - curva ABC de cada produto (definida manualmente pela empresa);
//   - prazo de produção de cada fornecedor;
//   - consumo mensal (CM) por produto (importado ou calculado).
//
// Se houver DATABASE_URL/POSTGRES_URL, usa Postgres (produção). Caso contrário,
// usa memória (dev sem banco). A interface é a mesma para o resto do sistema.
//
// IMPORTANTE (serverless): NÃO reaproveitamos uma conexão persistente. Em
// ambientes serverless (Vercel) o pooler do Postgres derruba conexões ociosas, e
// reusar uma conexão morta faz a requisição "pendurar". Por isso cada operação
// abre uma conexão nova e curta pelo pooler (que é feito exatamente para isso).

import postgres from "postgres";
import type { Curve } from "@/lib/bling/types";

/** Formata um valor de data (Date do driver ou string) como YYYY-MM-DD. */
function isoDate(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  return String(v).slice(0, 10);
}

export interface BlingToken {
  accessToken: string;
  refreshToken: string;
  /** Epoch em milissegundos de quando o access_token expira. */
  expiresAt: number;
}

/** Produto sincronizado do Bling para o banco (lido rápido pela interface). */
export interface CachedProduct {
  /** ID interno do produto no Bling (para cruzar com fornecedores). */
  blingId: string;
  sku: string;
  name: string;
  cost: number;
  price: number;
  stock: number;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  supplierDesc: string;
}

/** Ligação produto→fornecedor, sincronizada à parte. */
export interface ProductSupplierLink {
  blingId: string;
  supplierId: string;
  supplierName: string;
  /** Código do produto no fornecedor. */
  supplierCode: string;
  /** Descrição do produto no fornecedor. */
  supplierDesc: string;
}

/** Linha pronta para a tela de Produtos e curvas (já com curva/consumo/fornecedor). */
export interface ProductListing {
  sku: string;
  name: string;
  supplierName: string;
  /** null = não classificado. */
  curve: Curve | null;
  monthlyConsumption: number;
  stock: number;
  /** Quantidade em produção no fornecedor (importada). */
  inProduction: number;
  cost: number;
  price: number;
}

/** Estado do cálculo de consumo pelas vendas (processado em etapas). */
export interface ConsumptionJob {
  periodStart: string;
  periodEnd: string;
  months: number;
  nextPage: number;
  processed: number;
  done: boolean;
  /** Quando o job foi atualizado pela última vez (ISO). */
  updatedAt?: string;
}

/** Snapshot de saldo de estoque (para calcular consumo real). */
export interface StockSnapshot {
  sku: string;
  stock: number;
  date: string; // YYYY-MM-DD
}

/** Estado da sincronização das composições de kits (processada em etapas). */
export interface KitJob {
  nextPage: number;
  processed: number;
  kits: number;
  done: boolean;
  /** Quando o job foi atualizado pela última vez (ISO). */
  updatedAt?: string;
}

/** Ligação kit → componente (item que forma o kit). */
export interface KitComponent {
  kitSku: string;
  componentSku: string;
  qty: number;
}

export interface SettingsStore {
  getProductCurves(): Promise<Record<string, Curve>>;
  setProductCurve(sku: string, curve: Curve): Promise<void>;
  /** Define a mesma curva para vários produtos de uma vez. */
  setProductCurves(skus: string[], curve: Curve): Promise<void>;
  /** Remove a curva (volta a "não classificado") de vários produtos. */
  clearProductCurves(skus: string[]): Promise<void>;
  getSupplierLeadTimes(): Promise<Record<string, number>>;
  setSupplierLeadTime(id: string, days: number): Promise<void>;
  getMonthlyConsumption(): Promise<Record<string, number>>;
  setMonthlyConsumption(sku: string, cm: number): Promise<void>;
  /** Quantidade em produção no fornecedor, por SKU. */
  getProductionIncoming(): Promise<Record<string, number>>;
  /** Substitui TODA a tabela de "em produção" (snapshot do momento). */
  replaceProductionIncoming(entries: { sku: string; qty: number }[]): Promise<void>;
  /** Zera a tabela de "em produção". */
  clearProductionIncoming(): Promise<void>;
  getBlingToken(): Promise<BlingToken | null>;
  saveBlingToken(token: BlingToken): Promise<void>;
  clearBlingToken(): Promise<void>;
  replaceProductCache(products: CachedProduct[]): Promise<void>;
  getCachedProducts(): Promise<CachedProduct[]>;
  /** Lista pronta para a tela de curvas (uma consulta só, com tudo junto). */
  getProductsForListing(): Promise<ProductListing[]>;
  replaceProductSuppliers(links: ProductSupplierLink[]): Promise<void>;

  // Cálculo de consumo pelas vendas (processado em etapas).
  getConsumptionJob(): Promise<ConsumptionJob | null>;
  startConsumptionJob(job: ConsumptionJob): Promise<void>;
  saveConsumptionProgress(nextPage: number, processed: number, done: boolean): Promise<void>;
  addConsumptionSales(entries: { sku: string; qty: number }[]): Promise<void>;
  /** Grava o consumo mensal (total vendido / meses) e devolve quantos produtos. */
  finalizeConsumption(months: number): Promise<number>;

  // Consumo por item, por mês (kits já decompostos nos itens).
  /** Zera o histórico mensal por item (início de um novo cálculo). */
  clearMonthlyItemSales(): Promise<void>;
  /** Soma quantidades por (sku, mês "YYYY-MM"). */
  addMonthlyItemSales(entries: { sku: string; ym: string; qty: number }[]): Promise<void>;
  /** Total vendido por SKU somando os meses informados (para calcular o CM da janela). */
  getItemConsumption(yms: string[]): Promise<Record<string, number>>;
  /** Total de saída por mês (para a aba de Análise). */
  getMonthlyTotals(): Promise<{ ym: string; qty: number }[]>;
  /** Itens que mais saíram na janela (yms), com o total. */
  getTopItems(yms: string[], limit: number): Promise<{ sku: string; total: number }[]>;
  /** Grava monthly_consumption a partir do histórico mensal (janela de N meses). */
  finalizeItemConsumption(yms: string[]): Promise<number>;

  // Composições de kits (sincronizadas do Bling, em etapas).
  /** Mapa id-do-Bling → SKU (para resolver os componentes dos kits). */
  getBlingIdMap(): Promise<Record<string, string>>;
  getKitJob(): Promise<KitJob | null>;
  startKitJob(): Promise<void>;
  saveKitProgress(job: KitJob): Promise<void>;
  /** Adiciona ligações kit→componente (acumula durante o processamento). */
  addKitComponents(rows: KitComponent[]): Promise<void>;
  /** Kit → lista de componentes (para decompor o consumo). */
  getKitComponents(): Promise<Record<string, { sku: string; qty: number }[]>>;

  // Snapshots de estoque (consumo por variação de saldo).
  /** Salva snapshot do saldo atual de todos os produtos (uma foto do estoque). */
  saveStockSnapshot(entries: StockSnapshot[]): Promise<void>;
  /** Retorna as datas distintas de snapshots já salvos, do mais antigo ao mais recente. */
  getSnapshotDates(): Promise<string[]>;
  /** Calcula consumo mensal = (saldo_antigo − saldo_atual) / meses, grava em monthly_consumption. */
  calcConsumptionFromSnapshots(): Promise<number>;
}

// ---------- Implementação em memória (dev sem banco) ----------

class MemoryStore implements SettingsStore {
  private curves = new Map<string, Curve>();
  private leadTimes = new Map<string, number>();
  private consumption = new Map<string, number>();
  private production = new Map<string, number>();
  private token: BlingToken | null = null;
  private productCache: CachedProduct[] = [];
  private supplierLinks = new Map<string, ProductSupplierLink>();
  private job: ConsumptionJob | null = null;
  private sales = new Map<string, number>();
  private snapshots: StockSnapshot[] = [];
  private kitJob: KitJob | null = null;
  private kitComponents: KitComponent[] = [];
  private itemSales = new Map<string, number>(); // "sku|ym" -> qty

  async getProductCurves() {
    return Object.fromEntries(this.curves);
  }
  async setProductCurve(sku: string, curve: Curve) {
    this.curves.set(sku, curve);
  }
  async setProductCurves(skus: string[], curve: Curve) {
    for (const sku of skus) this.curves.set(sku, curve);
  }
  async clearProductCurves(skus: string[]) {
    for (const sku of skus) this.curves.delete(sku);
  }
  async getSupplierLeadTimes() {
    return Object.fromEntries(this.leadTimes);
  }
  async setSupplierLeadTime(id: string, days: number) {
    this.leadTimes.set(id, days);
  }
  async getMonthlyConsumption() {
    return Object.fromEntries(this.consumption);
  }
  async setMonthlyConsumption(sku: string, cm: number) {
    this.consumption.set(sku, cm);
  }
  async getProductionIncoming() {
    return Object.fromEntries(this.production);
  }
  async replaceProductionIncoming(entries: { sku: string; qty: number }[]) {
    this.production = new Map(entries.map((e) => [e.sku, e.qty]));
  }
  async clearProductionIncoming() {
    this.production.clear();
  }
  async getBlingToken() {
    return this.token;
  }
  async saveBlingToken(token: BlingToken) {
    this.token = token;
  }
  async clearBlingToken() {
    this.token = null;
  }
  async replaceProductCache(products: CachedProduct[]) {
    // Upsert por SKU: atualiza os existentes e adiciona os novos (não apaga).
    const bySku = new Map(this.productCache.map((p) => [p.sku, p]));
    for (const p of products) bySku.set(p.sku, p);
    this.productCache = [...bySku.values()];
  }
  async replaceProductSuppliers(links: ProductSupplierLink[]) {
    this.supplierLinks = new Map(links.map((l) => [l.blingId, l]));
  }
  async getConsumptionJob() {
    return this.job;
  }
  async startConsumptionJob(job: ConsumptionJob) {
    this.job = job;
    this.sales.clear();
  }
  async saveConsumptionProgress(nextPage: number, processed: number, done: boolean) {
    if (this.job) this.job = { ...this.job, nextPage, processed, done };
  }
  async addConsumptionSales(entries: { sku: string; qty: number }[]) {
    for (const e of entries) this.sales.set(e.sku, (this.sales.get(e.sku) ?? 0) + e.qty);
  }
  async finalizeConsumption(months: number) {
    let n = 0;
    for (const [sku, qty] of this.sales) {
      this.consumption.set(sku, qty / months);
      n++;
    }
    return n;
  }

  async clearMonthlyItemSales() {
    this.itemSales.clear();
  }
  async addMonthlyItemSales(entries: { sku: string; ym: string; qty: number }[]) {
    for (const e of entries) {
      const key = `${e.sku}|${e.ym}`;
      this.itemSales.set(key, (this.itemSales.get(key) ?? 0) + e.qty);
    }
  }
  async getItemConsumption(yms: string[]) {
    const set = new Set(yms);
    const out: Record<string, number> = {};
    for (const [key, qty] of this.itemSales) {
      const [sku, ym] = key.split("|");
      if (set.has(ym)) out[sku] = (out[sku] ?? 0) + qty;
    }
    return out;
  }
  async getMonthlyTotals() {
    const byYm = new Map<string, number>();
    for (const [key, qty] of this.itemSales) {
      const ym = key.split("|")[1];
      byYm.set(ym, (byYm.get(ym) ?? 0) + qty);
    }
    return [...byYm.entries()]
      .map(([ym, qty]) => ({ ym, qty }))
      .sort((a, b) => a.ym.localeCompare(b.ym));
  }
  async getTopItems(yms: string[], limit: number) {
    const totals = await this.getItemConsumption(yms);
    return Object.entries(totals)
      .map(([sku, total]) => ({ sku, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
  async finalizeItemConsumption(yms: string[]) {
    const totals = await this.getItemConsumption(yms);
    const months = Math.max(1, yms.length);
    let n = 0;
    for (const [sku, total] of Object.entries(totals)) {
      this.consumption.set(sku, total / months);
      n++;
    }
    return n;
  }

  async getBlingIdMap() {
    const map: Record<string, string> = {};
    for (const p of this.productCache) if (p.blingId) map[p.blingId] = p.sku;
    return map;
  }
  async getKitJob() {
    return this.kitJob;
  }
  async startKitJob() {
    this.kitJob = { nextPage: 1, processed: 0, kits: 0, done: false };
    this.kitComponents = [];
  }
  async saveKitProgress(job: KitJob) {
    this.kitJob = job;
  }
  async addKitComponents(rows: KitComponent[]) {
    this.kitComponents.push(...rows);
  }
  async getKitComponents() {
    const out: Record<string, { sku: string; qty: number }[]> = {};
    for (const r of this.kitComponents) {
      (out[r.kitSku] ??= []).push({ sku: r.componentSku, qty: r.qty });
    }
    return out;
  }

  async saveStockSnapshot(entries: StockSnapshot[]) {
    // Remove snapshots antigos da mesma data e adiciona os novos.
    const date = entries[0]?.date;
    if (!date) return;
    this.snapshots = this.snapshots.filter((s) => s.date !== date);
    this.snapshots.push(...entries);
  }

  async getSnapshotDates() {
    const dates = [...new Set(this.snapshots.map((s) => s.date))].sort();
    return dates;
  }

  async calcConsumptionFromSnapshots() {
    const dates = [...new Set(this.snapshots.map((s) => s.date))].sort();
    if (dates.length < 2) return 0;
    const oldest = dates[0];
    const newest = dates[dates.length - 1];
    // Período em meses (mínimo 1).
    const daysDiff = (new Date(newest).getTime() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24);
    const months = Math.max(1, daysDiff / 30);
    // Mapeia saldos.
    const oldStock = new Map<string, number>();
    const newStock = new Map<string, number>();
    for (const s of this.snapshots) {
      if (s.date === oldest) oldStock.set(s.sku, s.stock);
      if (s.date === newest) newStock.set(s.sku, s.stock);
    }
    let n = 0;
    for (const [sku, old] of oldStock) {
      const cur = newStock.get(sku) ?? old;
      const consumed = Math.max(0, old - cur);
      const cm = Math.round(consumed / months);
      this.consumption.set(sku, cm);
      n++;
    }
    return n;
  }
  async getCachedProducts() {
    return this.productCache.map((p) => {
      const link = this.supplierLinks.get(p.blingId);
      return link
        ? {
            ...p,
            supplierId: link.supplierId,
            supplierName: link.supplierName,
            supplierCode: link.supplierCode,
            supplierDesc: link.supplierDesc,
          }
        : p;
    });
  }

  async getProductsForListing(): Promise<ProductListing[]> {
    return this.productCache.map((p) => {
      const link = this.supplierLinks.get(p.blingId);
      return {
        sku: p.sku,
        name: p.name,
        supplierName: link?.supplierName || p.supplierName || "—",
        curve: this.curves.get(p.sku) ?? null,
        monthlyConsumption: this.consumption.get(p.sku) ?? 0,
        stock: p.stock,
        inProduction: this.production.get(p.sku) ?? 0,
        cost: p.cost,
        price: p.price,
      };
    });
  }
}

// ---------- Implementação Postgres (produção) ----------

type Sql = ReturnType<typeof postgres>;

function connect(url: string): Sql {
  return postgres(url, {
    max: 1,
    prepare: false, // pooler em modo transação (pgbouncer) não suporta prepared
    ssl: "require",
    connect_timeout: 8,
  });
}

// Executado uma vez por processo (cacheado), cria as tabelas se não existirem.
let schemaReady: Promise<void> | null = null;

async function ensureSchema(url: string): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = connect(url);
      try {
        await sql`create table if not exists bling_oauth (
          id text primary key default 'default',
          access_token text not null,
          refresh_token text not null,
          expires_at bigint not null,
          updated_at timestamptz not null default now()
        )`;
        await sql`create table if not exists product_settings (
          sku text primary key,
          curve text not null,
          updated_at timestamptz not null default now()
        )`;
        await sql`create table if not exists supplier_settings (
          id text primary key,
          lead_time_days integer not null,
          updated_at timestamptz not null default now()
        )`;
        await sql`create table if not exists monthly_consumption (
          sku text primary key,
          cm numeric not null default 0,
          updated_at timestamptz not null default now()
        )`;
        await sql`create table if not exists product_cache (
          sku text primary key,
          bling_id text not null default '',
          name text not null default '',
          cost numeric not null default 0,
          price numeric not null default 0,
          stock numeric not null default 0,
          supplier_id text not null default '',
          supplier_name text not null default '',
          updated_at timestamptz not null default now()
        )`;
        await sql`alter table product_cache add column if not exists bling_id text not null default ''`;
        await sql`create table if not exists consumption_job (
          id text primary key default 'current',
          period_start date not null,
          period_end date not null,
          months integer not null,
          next_page integer not null default 1,
          processed integer not null default 0,
          done boolean not null default false,
          updated_at timestamptz not null default now()
        )`;
        await sql`create table if not exists consumption_sales (
          sku text primary key,
          qty numeric not null default 0
        )`;
        await sql`create table if not exists product_supplier (
          bling_id text primary key,
          supplier_id text not null default '',
          supplier_name text not null default '',
          supplier_code text not null default '',
          supplier_desc text not null default ''
        )`;
        await sql`alter table product_supplier add column if not exists supplier_code text not null default ''`;
        await sql`alter table product_supplier add column if not exists supplier_desc text not null default ''`;
        await sql`create table if not exists production_incoming (
          sku text primary key,
          qty numeric not null default 0
        )`;
        await sql`create table if not exists kit_component (
          kit_sku text not null,
          component_sku text not null,
          qty numeric not null default 1,
          primary key (kit_sku, component_sku)
        )`;
        await sql`create table if not exists monthly_item_sales (
          sku text not null,
          ym text not null,
          qty numeric not null default 0,
          primary key (sku, ym)
        )`;
        await sql`create table if not exists kit_job (
          id text primary key default 'current',
          next_page integer not null default 1,
          processed integer not null default 0,
          kits integer not null default 0,
          done boolean not null default false,
          updated_at timestamptz not null default now()
        )`;
        await sql`create table if not exists stock_snapshots (
          sku text not null,
          stock numeric not null default 0,
          snapshot_date date not null,
          primary key (sku, snapshot_date)
        )`;
      } finally {
        await sql.end({ timeout: 5 });
      }
    })().catch((e) => {
      schemaReady = null; // permite nova tentativa numa próxima chamada
      throw e;
    });
  }
  return schemaReady;
}

class PostgresStore implements SettingsStore {
  constructor(private url: string) {}

  /** Abre conexão curta, garante o schema, roda a operação e fecha. */
  private async run<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
    await ensureSchema(this.url);
    const sql = connect(this.url);
    try {
      return await fn(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  private async safeRead<T>(fn: (sql: Sql) => Promise<T>, fallback: T): Promise<T> {
    try {
      return await this.run(fn);
    } catch (e) {
      console.error("DB leitura falhou:", e);
      return fallback;
    }
  }

  getProductCurves() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ sku: string; curve: Curve }[]>`
        select sku, curve from product_settings`;
      return Object.fromEntries(rows.map((r) => [r.sku, r.curve]));
    }, {} as Record<string, Curve>);
  }

  async setProductCurve(sku: string, curve: Curve) {
    await this.run(
      (sql) => sql`
        insert into product_settings (sku, curve, updated_at)
        values (${sku}, ${curve}, now())
        on conflict (sku) do update set curve = excluded.curve, updated_at = now()`,
    );
  }

  async setProductCurves(skus: string[], curve: Curve) {
    if (skus.length === 0) return;
    await this.run(async (sql) => {
      const CHUNK = 500;
      for (let i = 0; i < skus.length; i += CHUNK) {
        const slice = skus.slice(i, i + CHUNK).map((sku) => ({ sku, curve }));
        await sql`insert into product_settings ${sql(slice, "sku", "curve")}
          on conflict (sku) do update set curve = excluded.curve, updated_at = now()`;
      }
    });
  }

  async clearProductCurves(skus: string[]) {
    if (skus.length === 0) return;
    await this.run(async (sql) => {
      const CHUNK = 500;
      for (let i = 0; i < skus.length; i += CHUNK) {
        const slice = skus.slice(i, i + CHUNK);
        await sql`delete from product_settings where sku in ${sql(slice)}`;
      }
    });
  }

  getSupplierLeadTimes() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ id: string; lead_time_days: number }[]>`
        select id, lead_time_days from supplier_settings`;
      return Object.fromEntries(rows.map((r) => [r.id, r.lead_time_days]));
    }, {} as Record<string, number>);
  }

  async setSupplierLeadTime(id: string, days: number) {
    await this.run(
      (sql) => sql`
        insert into supplier_settings (id, lead_time_days, updated_at)
        values (${id}, ${days}, now())
        on conflict (id) do update set lead_time_days = excluded.lead_time_days, updated_at = now()`,
    );
  }

  getMonthlyConsumption() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ sku: string; cm: number }[]>`
        select sku, cm from monthly_consumption`;
      return Object.fromEntries(rows.map((r) => [r.sku, Number(r.cm)]));
    }, {} as Record<string, number>);
  }

  async setMonthlyConsumption(sku: string, cm: number) {
    await this.run(
      (sql) => sql`
        insert into monthly_consumption (sku, cm, updated_at)
        values (${sku}, ${cm}, now())
        on conflict (sku) do update set cm = excluded.cm, updated_at = now()`,
    );
  }

  getProductionIncoming() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ sku: string; qty: number }[]>`
        select sku, qty from production_incoming where qty <> 0`;
      return Object.fromEntries(rows.map((r) => [r.sku, Number(r.qty)]));
    }, {} as Record<string, number>);
  }

  async replaceProductionIncoming(entries: { sku: string; qty: number }[]) {
    await this.run(async (sql) => {
      await sql`truncate table production_incoming`;
      const CHUNK = 500;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const slice = entries.slice(i, i + CHUNK);
        await sql`insert into production_incoming ${sql(slice, "sku", "qty")}
          on conflict (sku) do update set qty = excluded.qty`;
      }
    });
  }

  async clearProductionIncoming() {
    await this.run((sql) => sql`truncate table production_incoming`);
  }

  getBlingToken() {
    return this.safeRead(async (sql) => {
      const rows = await sql<
        { access_token: string; refresh_token: string; expires_at: string }[]
      >`select access_token, refresh_token, expires_at from bling_oauth where id = 'default'`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        accessToken: r.access_token,
        refreshToken: r.refresh_token,
        expiresAt: Number(r.expires_at),
      };
    }, null as BlingToken | null);
  }

  async saveBlingToken(token: BlingToken) {
    await this.run(
      (sql) => sql`
        insert into bling_oauth (id, access_token, refresh_token, expires_at, updated_at)
        values ('default', ${token.accessToken}, ${token.refreshToken}, ${token.expiresAt}, now())
        on conflict (id) do update set
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          updated_at = now()`,
    );
  }

  async clearBlingToken() {
    await this.run((sql) => sql`delete from bling_oauth where id = 'default'`);
  }

  async replaceProductCache(products: CachedProduct[]) {
    await this.run(async (sql) => {
      // Upsert por SKU: atualiza estoque/preço dos existentes e adiciona novos,
      // sem apagar nada. Não toca em curvas/consumo (tabelas separadas).
      const CHUNK = 500;
      for (let i = 0; i < products.length; i += CHUNK) {
        const slice = products.slice(i, i + CHUNK).map((p) => ({
          sku: p.sku,
          bling_id: p.blingId,
          name: p.name,
          cost: p.cost,
          price: p.price,
          stock: p.stock,
          supplier_id: p.supplierId,
          supplier_name: p.supplierName,
        }));
        await sql`insert into product_cache ${sql(
          slice,
          "sku",
          "bling_id",
          "name",
          "cost",
          "price",
          "stock",
          "supplier_id",
          "supplier_name",
        )}
        on conflict (sku) do update set
          bling_id = excluded.bling_id,
          name = excluded.name,
          cost = excluded.cost,
          price = excluded.price,
          stock = excluded.stock,
          updated_at = now()`;
      }
    });
  }

  async replaceProductSuppliers(links: ProductSupplierLink[]) {
    await this.run(async (sql) => {
      await sql`truncate table product_supplier`;
      const CHUNK = 500;
      for (let i = 0; i < links.length; i += CHUNK) {
        const slice = links.slice(i, i + CHUNK).map((l) => ({
          bling_id: l.blingId,
          supplier_id: l.supplierId,
          supplier_name: l.supplierName,
          supplier_code: l.supplierCode,
          supplier_desc: l.supplierDesc,
        }));
        await sql`insert into product_supplier ${sql(
          slice,
          "bling_id",
          "supplier_id",
          "supplier_name",
          "supplier_code",
          "supplier_desc",
        )}`;
      }
    });
  }

  async getConsumptionJob() {
    return this.safeRead(async (sql) => {
      const rows = await sql<
        {
          period_start: string;
          period_end: string;
          months: number;
          next_page: number;
          processed: number;
          done: boolean;
          updated_at: string;
        }[]
      >`select period_start, period_end, months, next_page, processed, done, updated_at
          from consumption_job where id = 'current'`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        periodStart: isoDate(r.period_start),
        periodEnd: isoDate(r.period_end),
        months: r.months,
        nextPage: r.next_page,
        processed: r.processed,
        done: r.done,
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    }, null as ConsumptionJob | null);
  }

  async startConsumptionJob(job: ConsumptionJob) {
    await this.run(async (sql) => {
      await sql`truncate table consumption_sales`;
      await sql`insert into consumption_job (id, period_start, period_end, months, next_page, processed, done, updated_at)
        values ('current', ${job.periodStart}, ${job.periodEnd}, ${job.months}, ${job.nextPage}, ${job.processed}, ${job.done}, now())
        on conflict (id) do update set
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          months = excluded.months,
          next_page = excluded.next_page,
          processed = excluded.processed,
          done = excluded.done,
          updated_at = now()`;
    });
  }

  async saveConsumptionProgress(nextPage: number, processed: number, done: boolean) {
    await this.run(
      (sql) => sql`update consumption_job set next_page = ${nextPage},
        processed = ${processed}, done = ${done}, updated_at = now() where id = 'current'`,
    );
  }

  async addConsumptionSales(entries: { sku: string; qty: number }[]) {
    if (entries.length === 0) return;
    await this.run(async (sql) => {
      const CHUNK = 500;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const slice = entries.slice(i, i + CHUNK);
        await sql`insert into consumption_sales ${sql(slice, "sku", "qty")}
          on conflict (sku) do update set qty = consumption_sales.qty + excluded.qty`;
      }
    });
  }

  async finalizeConsumption(months: number) {
    return this.run(async (sql) => {
      // CM = total vendido ÷ meses, só para SKUs que existem no cadastro.
      const res = await sql`
        insert into monthly_consumption (sku, cm, updated_at)
        select cs.sku, cs.qty / ${months}, now()
          from consumption_sales cs
          join product_cache pc on pc.sku = cs.sku
        on conflict (sku) do update set cm = excluded.cm, updated_at = now()`;
      return res.count;
    });
  }

  async clearMonthlyItemSales() {
    await this.run((sql) => sql`truncate table monthly_item_sales`);
  }

  async addMonthlyItemSales(entries: { sku: string; ym: string; qty: number }[]) {
    if (entries.length === 0) return;
    // Junta pares (sku, mes) repetidos SOMANDO a quantidade. O mesmo item
    // vendido em dois pedidos no mesmo mes geraria duas linhas iguais e o
    // Postgres reclamaria "ON CONFLICT DO UPDATE command cannot affect row a
    // second time".
    const merged = new Map<string, { sku: string; ym: string; qty: number }>();
    for (const e of entries) {
      const key = `${e.sku} ${e.ym}`;
      const cur = merged.get(key);
      if (cur) cur.qty += e.qty;
      else merged.set(key, { ...e });
    }
    const deduped = [...merged.values()];
    await this.run(async (sql) => {
      const CHUNK = 500;
      for (let i = 0; i < deduped.length; i += CHUNK) {
        const slice = deduped.slice(i, i + CHUNK);
        await sql`insert into monthly_item_sales ${sql(slice, "sku", "ym", "qty")}
          on conflict (sku, ym) do update set qty = monthly_item_sales.qty + excluded.qty`;
      }
    });
  }

  getItemConsumption(yms: string[]) {
    if (yms.length === 0) return Promise.resolve({} as Record<string, number>);
    return this.safeRead(async (sql) => {
      const rows = await sql<{ sku: string; total: number }[]>`
        select sku, sum(qty) as total from monthly_item_sales
        where ym in ${sql(yms)} group by sku`;
      return Object.fromEntries(rows.map((r) => [r.sku, Number(r.total)]));
    }, {} as Record<string, number>);
  }

  getMonthlyTotals() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ ym: string; qty: number }[]>`
        select ym, sum(qty) as qty from monthly_item_sales group by ym order by ym`;
      return rows.map((r) => ({ ym: r.ym, qty: Number(r.qty) }));
    }, [] as { ym: string; qty: number }[]);
  }

  getTopItems(yms: string[], limit: number) {
    if (yms.length === 0) return Promise.resolve([] as { sku: string; total: number }[]);
    return this.safeRead(async (sql) => {
      const rows = await sql<{ sku: string; total: number }[]>`
        select sku, sum(qty) as total from monthly_item_sales
        where ym in ${sql(yms)} group by sku order by total desc limit ${limit}`;
      return rows.map((r) => ({ sku: r.sku, total: Number(r.total) }));
    }, [] as { sku: string; total: number }[]);
  }

  async finalizeItemConsumption(yms: string[]) {
    if (yms.length === 0) return 0;
    const months = Math.max(1, yms.length);
    return this.run(async (sql) => {
      // Recalcula TODOS os produtos: quem nao vendeu no periodo (kits mapeados
      // inclusos) recebe cm = 0. Sem isso, um kit que antes teve consumo errado
      // e agora sumiu das vendas manteria o valor antigo no relatorio.
      const res = await sql`
        insert into monthly_consumption (sku, cm, updated_at)
        select pc.sku, coalesce(s.total, 0) / ${months}, now()
          from product_cache pc
          left join (
            select mis.sku, sum(mis.qty) as total
              from monthly_item_sales mis
             where mis.ym in ${sql(yms)}
             group by mis.sku
          ) s on s.sku = pc.sku
        on conflict (sku) do update set cm = excluded.cm, updated_at = now()`;
      return res.count;
    });
  }

  getBlingIdMap() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ bling_id: string; sku: string }[]>`
        select bling_id, sku from product_cache where bling_id <> ''`;
      return Object.fromEntries(rows.map((r) => [r.bling_id, r.sku]));
    }, {} as Record<string, string>);
  }

  async getKitJob() {
    return this.safeRead(async (sql) => {
      const rows = await sql<
        {
          next_page: number;
          processed: number;
          kits: number;
          done: boolean;
          updated_at: string;
        }[]
      >`select next_page, processed, kits, done, updated_at from kit_job where id = 'current'`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        nextPage: r.next_page,
        processed: r.processed,
        kits: r.kits,
        done: r.done,
        updatedAt: new Date(r.updated_at).toISOString(),
      };
    }, null as KitJob | null);
  }

  async startKitJob() {
    await this.run(async (sql) => {
      await sql`truncate table kit_component`;
      await sql`insert into kit_job (id, next_page, processed, kits, done, updated_at)
        values ('current', 1, 0, 0, false, now())
        on conflict (id) do update set next_page = 1, processed = 0, kits = 0, done = false, updated_at = now()`;
    });
  }

  async saveKitProgress(job: KitJob) {
    await this.run(
      (sql) => sql`update kit_job set next_page = ${job.nextPage},
        processed = ${job.processed}, kits = ${job.kits}, done = ${job.done},
        updated_at = now() where id = 'current'`,
    );
  }

  async addKitComponents(rows: KitComponent[]) {
    if (rows.length === 0) return;
    // Junta pares (kit, componente) repetidos SOMANDO a quantidade. Sem isso,
    // um componente listado 2x (ou 2 ids do Bling que caem no mesmo SKU) faria
    // o Postgres reclamar "ON CONFLICT DO UPDATE command cannot affect row a
    // second time" e o bloco inteiro viraria 500.
    const merged = new Map<string, KitComponent>();
    for (const r of rows) {
      const key = `${r.kitSku} ${r.componentSku}`;
      const cur = merged.get(key);
      if (cur) cur.qty += r.qty;
      else merged.set(key, { ...r });
    }
    const deduped = [...merged.values()];
    await this.run(async (sql) => {
      const CHUNK = 500;
      for (let i = 0; i < deduped.length; i += CHUNK) {
        const slice = deduped.slice(i, i + CHUNK).map((r) => ({
          kit_sku: r.kitSku,
          component_sku: r.componentSku,
          qty: r.qty,
        }));
        await sql`insert into kit_component ${sql(slice, "kit_sku", "component_sku", "qty")}
          on conflict (kit_sku, component_sku) do update set qty = excluded.qty`;
      }
    });
  }

  getKitComponents() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ kit_sku: string; component_sku: string; qty: number }[]>`
        select kit_sku, component_sku, qty from kit_component`;
      const out: Record<string, { sku: string; qty: number }[]> = {};
      for (const r of rows) {
        (out[r.kit_sku] ??= []).push({ sku: r.component_sku, qty: Number(r.qty) });
      }
      return out;
    }, {} as Record<string, { sku: string; qty: number }[]>);
  }

  async saveStockSnapshot(entries: StockSnapshot[]) {
    if (entries.length === 0) return;
    await this.run(async (sql) => {
      const date = entries[0].date;
      // Remove snapshot da mesma data (substitui).
      await sql`delete from stock_snapshots where snapshot_date = ${date}`;
      const CHUNK = 500;
      for (let i = 0; i < entries.length; i += CHUNK) {
        const slice = entries.slice(i, i + CHUNK).map((e) => ({
          sku: e.sku,
          stock: e.stock,
          snapshot_date: e.date,
        }));
        await sql`insert into stock_snapshots ${sql(slice, "sku", "stock", "snapshot_date")}`;
      }
    });
  }

  async getSnapshotDates() {
    return this.safeRead(async (sql) => {
      const rows = await sql<{ snapshot_date: string }[]>`
        select distinct snapshot_date from stock_snapshots order by snapshot_date`;
      return rows.map((r) => isoDate(r.snapshot_date));
    }, [] as string[]);
  }

  async calcConsumptionFromSnapshots() {
    return this.run(async (sql) => {
      // Pega a data mais antiga e mais recente.
      const dates = await sql<{ oldest: string; newest: string }[]>`
        select min(snapshot_date) as oldest, max(snapshot_date) as newest
          from stock_snapshots`;
      if (dates.length === 0 || !dates[0].oldest || !dates[0].newest) return 0;
      const oldest = isoDate(dates[0].oldest);
      const newest = isoDate(dates[0].newest);
      if (oldest === newest) return 0;
      // Período em meses (mínimo 1).
      const daysDiff = (new Date(newest).getTime() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24);
      const months = Math.max(1, daysDiff / 30);
      // Calcula consumo: (saldo_antigo − saldo_atual), se positivo.
      const res = await sql`
        insert into monthly_consumption (sku, cm, updated_at)
        select old_s.sku,
               greatest(0, (old_s.stock - coalesce(new_s.stock, old_s.stock))) / ${months},
               now()
          from stock_snapshots old_s
          left join stock_snapshots new_s
            on new_s.sku = old_s.sku and new_s.snapshot_date = ${newest}::date
          join product_cache pc on pc.sku = old_s.sku
         where old_s.snapshot_date = ${oldest}::date
        on conflict (sku) do update set cm = excluded.cm, updated_at = now()`;
      return res.count;
    });
  }

  getCachedProducts() {
    return this.safeRead(async (sql) => {
      // Junta o produto com o fornecedor (quando já sincronizado).
      const rows = await sql<
        {
          sku: string;
          name: string;
          cost: number;
          price: number;
          stock: number;
          supplier_id: string | null;
          supplier_name: string | null;
          supplier_code: string | null;
          supplier_desc: string | null;
        }[]
      >`select pc.sku, pc.name, pc.cost, pc.price, pc.stock,
               coalesce(ps.supplier_id, pc.supplier_id) as supplier_id,
               coalesce(ps.supplier_name, pc.supplier_name) as supplier_name,
               ps.supplier_code as supplier_code,
               ps.supplier_desc as supplier_desc
          from product_cache pc
          left join product_supplier ps on ps.bling_id = pc.bling_id`;
      return rows.map((r) => ({
        blingId: "",
        sku: r.sku,
        name: r.name,
        cost: Number(r.cost),
        price: Number(r.price),
        stock: Number(r.stock),
        supplierId: r.supplier_id ?? "",
        supplierName: r.supplier_name ?? "",
        supplierCode: r.supplier_code ?? "",
        supplierDesc: r.supplier_desc ?? "",
      }));
    }, [] as CachedProduct[]);
  }

  getProductsForListing() {
    // UMA consulta só: produto + fornecedor + curva + consumo mensal.
    // Todos os joins são por chave primária (rápidos). Evita abrir várias
    // conexões e ler a tabela de produtos duas vezes.
    return this.safeRead(async (sql) => {
      const rows = await sql<
        {
          sku: string;
          name: string;
          supplier_name: string | null;
          curve: string | null;
          cm: number | null;
          stock: number;
          in_production: number | null;
          cost: number;
          price: number;
        }[]
      >`select pc.sku, pc.name, pc.stock, pc.cost, pc.price,
               coalesce(nullif(ps.supplier_name, ''), nullif(pc.supplier_name, '')) as supplier_name,
               s.curve as curve,
               mc.cm as cm,
               pi.qty as in_production
          from product_cache pc
          left join product_supplier ps on ps.bling_id = pc.bling_id
          left join product_settings s on s.sku = pc.sku
          left join monthly_consumption mc on mc.sku = pc.sku
          left join production_incoming pi on pi.sku = pc.sku
         order by pc.name`;
      return rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        supplierName: r.supplier_name ?? "—",
        curve: (r.curve as Curve) ?? null,
        monthlyConsumption: r.cm != null ? Number(r.cm) : 0,
        stock: Number(r.stock),
        inProduction: r.in_production != null ? Number(r.in_production) : 0,
        cost: Number(r.cost),
        price: Number(r.price),
      }));
    }, [] as ProductListing[]);
  }
}

// ---------- Fábrica (singleton de processo) ----------

const globalForStore = globalThis as unknown as { blingStore?: SettingsStore };

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function getStore(): SettingsStore {
  if (globalForStore.blingStore) return globalForStore.blingStore;
  const url = databaseUrl();
  const store: SettingsStore = url
    ? new PostgresStore(url)
    : new MemoryStore();
  globalForStore.blingStore = store;
  return store;
}

/** Indica se o banco Postgres está configurado (senão, memória). */
export function isDatabaseConfigured(): boolean {
  return Boolean(databaseUrl());
}

/** Testa a conexão com o banco e devolve o erro real, se houver (diagnóstico). */
export async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  const url = databaseUrl();
  if (!url) return { ok: false, error: "sem DATABASE_URL/POSTGRES_URL" };
  const sql = connect(url);
  try {
    await sql`select 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
