import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPost, postgrestUpsert } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { newUuid } from './erpTables';

export type CurrencyRow = {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  is_base_currency: boolean;
  is_active: boolean;
};

export type ExchangeRateRow = {
  id: string;
  currency_code: string;
  date: string;
  buy_rate: number;
  sell_rate: number;
  source: string | null;
};

export type CurrencyInput = {
  code: string;
  name: string;
  symbol?: string;
  isBase?: boolean;
};

export type ExchangeRateInput = {
  currencyCode: string;
  buyRate: number;
  sellRate: number;
  date?: string;
  source?: string;
};

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

function mapCurrency(r: Record<string, unknown>): CurrencyRow {
  return {
    id: String(r.id ?? ''),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    symbol: r.symbol != null ? String(r.symbol) : null,
    is_base_currency: r.is_base_currency === true || r.is_base_currency === 'true',
    is_active: !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'),
  };
}

export async function fetchCurrencies(limit = 100): Promise<CurrencyRow[]> {
  return runDataTransport({
    label: 'fetchCurrencies',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/currencies',
        {
          select: 'id,code,name,symbol,is_base_currency,is_active,sort_order',
          order: 'sort_order.asc,code.asc',
          limit,
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : []).map(mapCurrency);
    },
    viaBridge: () =>
      tryQueries<CurrencyRow>([
        {
          sql: `SELECT id::text AS id, code, name, symbol,
                   COALESCE(is_base_currency, false) AS is_base_currency,
                   COALESCE(is_active, true) AS is_active
            FROM currencies
            ORDER BY COALESCE(sort_order, 0) ASC, code ASC
            LIMIT $1`,
          params: [limit],
        },
        {
          sql: `SELECT id::text AS id, code, name, symbol,
                   COALESCE(is_base_currency, false) AS is_base_currency,
                   COALESCE(is_active, true) AS is_active
            FROM public.currencies
            ORDER BY code ASC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function fetchExchangeRates(limit = 50): Promise<ExchangeRateRow[]> {
  return runDataTransport({
    label: 'fetchExchangeRates',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/exchange_rates',
        {
          select: 'id,currency_code,date,buy_rate,sell_rate,source',
          order: 'date.desc',
          limit,
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id ?? ''),
        currency_code: String(r.currency_code ?? ''),
        date: String(r.date ?? '').slice(0, 10),
        buy_rate: Number(r.buy_rate ?? 0) || 0,
        sell_rate: Number(r.sell_rate ?? 0) || 0,
        source: r.source != null ? String(r.source) : null,
      }));
    },
    viaBridge: () =>
      tryQueries<ExchangeRateRow>([
        {
          sql: `SELECT id::text AS id, currency_code,
                   date::text AS date,
                   buy_rate::float8 AS buy_rate,
                   sell_rate::float8 AS sell_rate,
                   source
            FROM exchange_rates
            ORDER BY date DESC, created_at DESC NULLS LAST
            LIMIT $1`,
          params: [limit],
        },
        {
          sql: `SELECT id::text AS id, currency_code,
                   date::text AS date,
                   buy_rate::float8 AS buy_rate,
                   sell_rate::float8 AS sell_rate,
                   source
            FROM public.exchange_rates
            ORDER BY date DESC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function createCurrency(input: CurrencyInput): Promise<string> {
  const id = newUuid();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw new Error('Kod ve ad zorunlu');

  return runDataTransport({
    label: 'createCurrency',
    viaRest: async () => {
      await postgrestPost(
        '/currencies',
        {
          id,
          code,
          name,
          symbol: input.symbol?.trim() || code,
          is_base_currency: Boolean(input.isBase),
          is_active: true,
        },
        { schema: 'public', prefer: 'return=minimal' },
      );
      return id;
    },
    viaBridge: async () => {
      await pgQuery(
        `INSERT INTO currencies (id, code, name, symbol, is_base_currency, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id, code, name, input.symbol?.trim() || code, Boolean(input.isBase)],
      );
      return id;
    },
  });
}

export async function createExchangeRate(input: ExchangeRateInput): Promise<string> {
  const id = newUuid();
  const code = input.currencyCode.trim().toUpperCase();
  const buy = Number(input.buyRate);
  const sell = Number(input.sellRate);
  if (!code) throw new Error('Para birimi kodu zorunlu');
  if (!(buy > 0) || !(sell > 0)) throw new Error('Alış/satış kuru pozitif olmalı');
  const date = input.date?.trim() || new Date().toISOString().slice(0, 10);
  const source = input.source?.trim() || 'manual';

  return runDataTransport({
    label: 'createExchangeRate',
    viaRest: async () => {
      try {
        await postgrestUpsert(
          '/exchange_rates',
          {
            id,
            currency_code: code,
            date,
            buy_rate: buy,
            sell_rate: sell,
            source,
            is_active: true,
          },
          'currency_code,date,source',
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch {
        await postgrestPost(
          '/exchange_rates',
          { id, currency_code: code, date, buy_rate: buy, sell_rate: sell, source },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
      return id;
    },
    viaBridge: async () => {
      try {
        await pgQuery(
          `INSERT INTO exchange_rates (id, currency_code, date, buy_rate, sell_rate, source, is_active)
           VALUES ($1, $2, $3::date, $4, $5, $6, true)
           ON CONFLICT (currency_code, date, source) DO UPDATE
             SET buy_rate = EXCLUDED.buy_rate,
                 sell_rate = EXCLUDED.sell_rate,
                 updated_at = NOW()`,
          [id, code, date, buy, sell, source],
        );
      } catch {
        await pgQuery(
          `INSERT INTO exchange_rates (id, currency_code, date, buy_rate, sell_rate, source)
           VALUES ($1, $2, $3::date, $4, $5, $6)`,
          [id, code, date, buy, sell, source],
        );
      }
      return id;
    },
  });
}
