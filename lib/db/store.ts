// Armazenamento dos dados que o sistema mantém por conta própria (não vêm do Bling):
//   - token de acesso do Bling (OAuth);
//   - curva ABC de cada produto (definida manualmente pela empresa);
//   - prazo de produção de cada fornecedor;
//   - consumo mensal (CM) por produto (importado ou calculado).
//
// Se DATABASE_URL estiver definido, usa Postgres (produção). Caso contrário,
// usa memória (desenvolvimento local sem banco). A interface é a mesma, então
// o resto do sistema não muda.

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

class PostgresStore implements SettingsStore {
  private ready: Promise<void> | null = null;

  constructor(private sql: Sql) {}

  private ensureSchema() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.sql`
          create table if not exists bling_oauth (
            id text primary key default 'default',
            access_token text not null,
            refresh_token text not null,
            expires_at bigint not null,
            updated_at timestamptz not null default now()
          )`;
        await this.sql`
          create table if not exists product_settings (
            sku text primary key,
            curve text not null,
            updated_at timestamptz not null default now()
          )`;
        await this.sql`
          create table if not exists supplier_settings (
            id text primary key,
            lead_time_days integer not null,
            updated_at timestamptz not null default now()
          )`;
        await this.sql`
          create table if not exists monthly_consumption (
            sku text primary key,
            cm numeric not null default 0,
            updated_at timestamptz not null default now()
          )`;
      })();
    }
    return this.ready;
  }

  async getProductCurves() {
    try {
      await this.ensureSchema();
      const rows = await this.sql<{ sku: string; curve: Curve }[]>`
        select sku, curve from product_settings`;
      return Object.fromEntries(rows.map((r) => [r.sku, r.curve]));
    } catch (e) {
      console.error("DB getProductCurves falhou:", e);
      return {};
    }
  }
  async setProductCurve(sku: string, curve: Curve) {
    await this.ensureSchema();
    await this.sql`
      insert into product_settings (sku, curve, updated_at)
      values (${sku}, ${curve}, now())
      on conflict (sku) do update set curve = excluded.curve, updated_at = now()`;
  }
  async getSupplierLeadTimes() {
    try {
      await this.ensureSchema();
      const rows = await this.sql<{ id: string; lead_time_days: number }[]>`
        select id, lead_time_days from supplier_settings`;
      return Object.fromEntries(rows.map((r) => [r.id, r.lead_time_days]));
    } catch (e) {
      console.error("DB getSupplierLeadTimes falhou:", e);
      return {};
    }
  }
  async setSupplierLeadTime(id: string, days: number) {
    await this.ensureSchema();
    await this.sql`
      insert into supplier_settings (id, lead_time_days, updated_at)
      values (${id}, ${days}, now())
      on conflict (id) do update set lead_time_days = excluded.lead_time_days, updated_at = now()`;
  }
  async getMonthlyConsumption() {
    try {
      await this.ensureSchema();
      const rows = await this.sql<{ sku: string; cm: number }[]>`
        select sku, cm from monthly_consumption`;
      return Object.fromEntries(rows.map((r) => [r.sku, Number(r.cm)]));
    } catch (e) {
      console.error("DB getMonthlyConsumption falhou:", e);
      return {};
    }
  }
  async setMonthlyConsumption(sku: string, cm: number) {
    await this.ensureSchema();
    await this.sql`
      insert into monthly_consumption (sku, cm, updated_at)
      values (${sku}, ${cm}, now())
      on conflict (sku) do update set cm = excluded.cm, updated_at = now()`;
  }
  async getBlingToken() {
    try {
      await this.ensureSchema();
      const rows = await this.sql<
        { access_token: string; refresh_token: string; expires_at: string }[]
      >`select access_token, refresh_token, expires_at from bling_oauth where id = 'default'`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        accessToken: r.access_token,
        refreshToken: r.refresh_token,
        expiresAt: Number(r.expires_at),
      };
    } catch (e) {
      console.error("DB getBlingToken falhou:", e);
      return null;
    }
  }
  async saveBlingToken(token: BlingToken) {
    await this.ensureSchema();
    await this.sql`
      insert into bling_oauth (id, access_token, refresh_token, expires_at, updated_at)
      values ('default', ${token.accessToken}, ${token.refreshToken}, ${token.expiresAt}, now())
      on conflict (id) do update set
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = now()`;
  }
  async clearBlingToken() {
    await this.ensureSchema();
    await this.sql`delete from bling_oauth where id = 'default'`;
  }
}

// ---------- Fábrica (singleton de processo) ----------
//
// Guardado em globalThis para ser compartilhado entre todas as rotas e
// sobreviver ao hot-reload em desenvolvimento. (Em produção serverless, cada
// instância tem seu próprio processo — por isso a memória é só fallback de dev
// e a persistência de verdade exige DATABASE_URL/Postgres.)

const globalForStore = globalThis as unknown as { blingStore?: SettingsStore };

// Aceita os nomes de variável mais comuns (Vercel Postgres/Neon usam DATABASE_URL
// ou POSTGRES_URL).
function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function getStore(): SettingsStore {
  if (globalForStore.blingStore) return globalForStore.blingStore;
  const url = databaseUrl();
  const store: SettingsStore = url
    ? // max:1/prepare:false amigáveis a serverless + pooler (pgbouncer);
      // connect_timeout evita que uma falha de rede "pendure" a requisição.
      new PostgresStore(
        postgres(url, {
          max: 1,
          prepare: false,
          ssl: "require",
          connect_timeout: 10,
          idle_timeout: 20,
        }),
      )
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
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 8,
  });
  try {
    await sql`select 1`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
