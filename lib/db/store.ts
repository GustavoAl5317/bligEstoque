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

export interface BlingToken {
  accessToken: string;
  refreshToken: string;
  /** Epoch em milissegundos de quando o access_token expira. */
  expiresAt: number;
}

export interface SettingsStore {
  getProductCurves(): Promise<Record<string, Curve>>;
  setProductCurve(sku: string, curve: Curve): Promise<void>;
  getSupplierLeadTimes(): Promise<Record<string, number>>;
  setSupplierLeadTime(id: string, days: number): Promise<void>;
  getMonthlyConsumption(): Promise<Record<string, number>>;
  setMonthlyConsumption(sku: string, cm: number): Promise<void>;
  getBlingToken(): Promise<BlingToken | null>;
  saveBlingToken(token: BlingToken): Promise<void>;
  clearBlingToken(): Promise<void>;
}

// ---------- Implementação em memória (dev sem banco) ----------

class MemoryStore implements SettingsStore {
  private curves = new Map<string, Curve>();
  private leadTimes = new Map<string, number>();
  private consumption = new Map<string, number>();
  private token: BlingToken | null = null;

  async getProductCurves() {
    return Object.fromEntries(this.curves);
  }
  async setProductCurve(sku: string, curve: Curve) {
    this.curves.set(sku, curve);
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
  async getBlingToken() {
    return this.token;
  }
  async saveBlingToken(token: BlingToken) {
    this.token = token;
  }
  async clearBlingToken() {
    this.token = null;
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
