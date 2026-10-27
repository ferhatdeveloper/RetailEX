/**
 * Dış kaynaklardan döviz (Hatwan) ve altın (Salar Golds) verisi çeker.
 * Tarayıcı: pg_bridge proxy; Tauri: plugin-http.
 */

import { getBridgeUrl, IS_TAURI } from '../utils/env';
import type { MarketRatesConfig } from './marketRatesConfig';
import { MARKET_RATES_SNAPSHOT_KEY } from './marketRatesConfig';
import { exchangeRateAPI } from './api/masterData';

const MITHQAL_GRAMS = 5;
const GRAM_PER_OUNCE = 31.1035;

function isValidPrice(v: unknown): v is number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/** Hatwan / sheet: 100 USD notu kuru (ör. 150000) ile 1 USD kuru (ör. 1500) ayrımı */
export const USD_PER100_THRESHOLD = 10_000;

export function normalizeUsdToPer1(value: number): number {
  if (!isValidPrice(value)) return 0;
  return value >= USD_PER100_THRESHOLD ? value / 100 : value;
}

export function usdPer1ToPer100(value: number): number {
  if (!isValidPrice(value)) return 0;
  return value * 100;
}

export function resolveUsdRatePair(rawSell: number, rawBuy: number): {
  sellPer1: number;
  buyPer1: number;
  sellPer100: number;
  buyPer100: number;
} {
  const sellPer1 = normalizeUsdToPer1(rawSell);
  const buyPer1 = normalizeUsdToPer1(rawBuy);
  const sellPer100 =
    isValidPrice(rawSell) && rawSell >= USD_PER100_THRESHOLD
      ? rawSell
      : usdPer1ToPer100(sellPer1);
  const buyPer100 =
    isValidPrice(rawBuy) && rawBuy >= USD_PER100_THRESHOLD
      ? rawBuy
      : usdPer1ToPer100(buyPer1);
  return { sellPer1, buyPer1, sellPer100, buyPer100 };
}

export interface ExternalCurrencyRate {
  code: string;
  name: string;
  buy: number;
  sell: number;
  source: 'hatwan' | 'salargold';
  updatedAt?: string;
}

export interface GoldMithqalPrices {
  sell18: number;
  sell21: number;
  sell22: number;
  buy18: number;
  buy21: number;
  buy22: number;
}

export interface MarketRatesSnapshot {
  fetchedAt: string;
  exchangeSource: string;
  goldSource: string;
  currencies: ExternalCurrencyRate[];
  gold: {
    ounceUsd: number;
    /** 1 USD = ? IQD (sistem / altın hesabı) */
    usdSellPer1: number;
    usdBuyPer1: number;
    /** 100 USD notu piyasası (gösterim) */
    usdSellPer100: number;
    usdBuyPer100: number;
    mithqal: GoldMithqalPrices;
    sheetCurrencies: ExternalCurrencyRate[];
  };
}

async function fetchExternalText(url: string): Promise<string> {
  const target = (url || '').trim();
  if (!target) throw new Error('URL boş');

  const tryBridgeProxy = async (): Promise<string | null> => {
    try {
      const bridge = getBridgeUrl();
      const proxy = `${bridge}/api/market-rates/proxy?url=${encodeURIComponent(target)}`;
      const res = await fetch(proxy, { method: 'GET' });
      if (!res.ok) return null;
      const data = (await res.json()) as { text?: string; ok?: boolean };
      return typeof data.text === 'string' ? data.text : null;
    } catch {
      return null;
    }
  };

  if (IS_TAURI) {
    const viaBridge = await tryBridgeProxy();
    if (viaBridge !== null) return viaBridge;

    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(target, { method: 'GET', connectTimeout: 30_000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  const viaBridge = await tryBridgeProxy();
  if (viaBridge !== null) return viaBridge;

  const res = await fetch(target, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchExternalJson<T>(url: string): Promise<T> {
  const text = await fetchExternalText(url);
  return JSON.parse(text) as T;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

function sheetCsvUrl(config: MarketRatesConfig, range: string): string {
  return `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/export?format=csv&gid=${config.sheetGid}&range=${encodeURIComponent(range)}`;
}

async function fetchSheetCell(config: MarketRatesConfig, range: string): Promise<number | null> {
  try {
    const text = (await fetchExternalText(sheetCsvUrl(config, range))).trim();
    const val = parseFloat(text);
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

function parseCurrencyCsv(text: string, source: 'salargold'): ExternalCurrencyRate[] {
  const rates: ExternalCurrencyRate[] = [];
  for (const line of text.split('\n')) {
    const row = line.split(',').map((c) => c.trim());
    if (row.length < 3) continue;
    const name = row[0];
    const buy = parseFloat(row[1]);
    const sell = parseFloat(row[2]);
    if (!name || !isValidPrice(buy) || !isValidPrice(sell)) continue;
    rates.push({
      code: name.slice(0, 12).toUpperCase().replace(/\s+/g, '_'),
      name,
      buy,
      sell,
      source,
    });
  }
  return rates;
}

function calculateMithqalPrices(input: {
  goldSpotUsd: number;
  usdSellPer1: number;
  fee21: number;
  deduction21: number;
  buyAdjust22: number;
  buyAdjust18: number;
}): GoldMithqalPrices {
  const gramUsd = isValidPrice(input.goldSpotUsd) ? input.goldSpotUsd / GRAM_PER_OUNCE : 0;
  const iqdPerUsd = isValidPrice(input.usdSellPer1) ? input.usdSellPer1 : 0;
  const base21 = gramUsd * (21 / 24) * iqdPerUsd * MITHQAL_GRAMS;
  const s21 = base21 + (input.fee21 || 0);
  const b21 = Math.max(0, s21 + (input.deduction21 || 0));
  const ratio22 = 22 / 21;
  const ratio18 = 18 / 21;
  const s22 = s21 * ratio22;
  const s18 = s21 * ratio18;
  let b22 = b21 * ratio22 + (input.buyAdjust22 || 0);
  let b18 = b21 * ratio18 + (input.buyAdjust18 || 0);
  b22 = Math.max(0, b22);
  b18 = Math.max(0, b18);
  return { sell21: s21, sell22: s22, sell18: s18, buy21: b21, buy22: b22, buy18: b18 };
}

export async function fetchHatwanCurrencies(config: MarketRatesConfig): Promise<ExternalCurrencyRate[]> {
  const html = await fetchExternalText(config.exchangePageUrl);
  const match = html.match(/data-page="([^"]+)"/);
  if (!match?.[1]) throw new Error('Hatwan: sayfa verisi bulunamadı');
  const page = JSON.parse(decodeHtmlEntities(match[1])) as {
    props?: { currencies?: Array<{ currency_code?: string; name?: string; buy?: number; sale?: number; updated_at?: string }> };
  };
  const list = page.props?.currencies ?? [];
  return list
    .filter((c) => c.currency_code && isValidPrice(c.buy) && isValidPrice(c.sale))
    .map((c) => {
      const code = String(c.currency_code).trim().toUpperCase();
      let buy = Number(c.buy);
      let sell = Number(c.sale);
      if (code === 'USD') {
        buy = normalizeUsdToPer1(buy);
        sell = normalizeUsdToPer1(sell);
      }
      return {
        code,
        name: String(c.name ?? c.currency_code),
        buy,
        sell,
        source: 'hatwan' as const,
        updatedAt: c.updated_at,
      };
    });
}

export async function fetchSalargoldsData(config: MarketRatesConfig): Promise<MarketRatesSnapshot['gold']> {
  const cells = config.goldCells;
  const [
    usdSell,
    usdBuy,
    deduction21,
    fee21,
    buyAdjust22,
    buyAdjust18,
  ] = await Promise.all([
    fetchSheetCell(config, cells.usdSell),
    fetchSheetCell(config, cells.usdBuy),
    fetchSheetCell(config, cells.deduction21),
    fetchSheetCell(config, cells.fee21),
    fetchSheetCell(config, cells.buyAdjust22),
    fetchSheetCell(config, cells.buyAdjust18),
  ]);

  let ounceUsd = 0;
  try {
    const spot = await fetchExternalJson<{ price?: number }>(config.goldSpotApiUrl);
    if (isValidPrice(spot?.price)) ounceUsd = spot.price;
  } catch {
    /* opsiyonel */
  }

  const usdRates = resolveUsdRatePair(usdSell ?? 0, usdBuy ?? 0);

  const mithqal = calculateMithqalPrices({
    goldSpotUsd: ounceUsd,
    usdSellPer1: usdRates.sellPer1,
    fee21: fee21 ?? 0,
    deduction21: deduction21 ?? 0,
    buyAdjust22: buyAdjust22 ?? 0,
    buyAdjust18: buyAdjust18 ?? 0,
  });

  let sheetCurrencies: ExternalCurrencyRate[] = [];
  try {
    const csv = await fetchExternalText(sheetCsvUrl(config, config.currencyRange));
    sheetCurrencies = parseCurrencyCsv(csv, 'salargold');
  } catch {
    sheetCurrencies = [];
  }

  return {
    ounceUsd,
    usdSellPer1: usdRates.sellPer1,
    usdBuyPer1: usdRates.buyPer1,
    usdSellPer100: usdRates.sellPer100,
    usdBuyPer100: usdRates.buyPer100,
    mithqal,
    sheetCurrencies,
  };
}

export async function fetchAllMarketRates(config: MarketRatesConfig): Promise<MarketRatesSnapshot> {
  const [currencies, gold] = await Promise.all([
    fetchHatwanCurrencies(config),
    fetchSalargoldsData(config),
  ]);

  const snapshot: MarketRatesSnapshot = {
    fetchedAt: new Date().toISOString(),
    exchangeSource: config.exchangePageUrl,
    goldSource: config.goldPageUrl,
    currencies,
    gold,
  };

  try {
    localStorage.setItem(MARKET_RATES_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }

  return snapshot;
}

export function loadMarketRatesSnapshot(): MarketRatesSnapshot | null {
  try {
    const raw = localStorage.getItem(MARKET_RATES_SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as MarketRatesSnapshot;
    if (!snap?.gold) return snap;
    const g = snap.gold as MarketRatesSnapshot['gold'] & {
      usdSellPer1?: number;
      usdBuyPer1?: number;
    };
    if (!isValidPrice(g.usdSellPer1) && isValidPrice(g.usdSellPer100)) {
      g.usdSellPer1 = normalizeUsdToPer1(g.usdSellPer100);
    }
    if (!isValidPrice(g.usdBuyPer1) && isValidPrice(g.usdBuyPer100)) {
      g.usdBuyPer1 = normalizeUsdToPer1(g.usdBuyPer100);
    }
    if (!isValidPrice(g.usdSellPer100) && isValidPrice(g.usdSellPer1)) {
      g.usdSellPer100 = usdPer1ToPer100(g.usdSellPer1);
    }
    if (!isValidPrice(g.usdBuyPer100) && isValidPrice(g.usdBuyPer1)) {
      g.usdBuyPer100 = usdPer1ToPer100(g.usdBuyPer1);
    }
    return { ...snap, gold: g };
  } catch {
    return null;
  }
}

export async function applyMarketRatesToDatabase(
  currencies: ExternalCurrencyRate[]
): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  let saved = 0;
  for (const row of currencies) {
    const code = row.code.trim().toUpperCase();
    if (!code || !isValidPrice(row.buy) || !isValidPrice(row.sell)) continue;
    const result = await exchangeRateAPI.save({
      currency_code: code,
      date: today,
      buy_rate: row.buy,
      sell_rate: row.sell,
      source: row.source,
      is_active: true,
    });
    if (result) saved += 1;
  }
  return saved;
}

/**
 * Kur & Altın (Hatwan) anlık görüntüsünden «1 CODE = ? IQD» kuru.
 * Önce Döviz sekmesi satırı, yoksa altın bloğundaki USD per-1.
 */
export function pickHatwanPivotRate(
  currencyCode: string,
  rateType: 'Satış' | 'Alış' = 'Satış',
): number | null {
  const code = String(currencyCode || '').trim().toUpperCase();
  if (!code) return null;
  const snap = loadMarketRatesSnapshot();
  if (!snap) return null;

  const row = (snap.currencies || []).find(
    (r) => String(r.code || '').trim().toUpperCase() === code,
  );
  if (row) {
    const raw = rateType === 'Alış' ? Number(row.buy) : Number(row.sell);
    const n = code === 'USD' ? normalizeUsdToPer1(raw) : raw;
    return isValidPrice(n) ? n : null;
  }

  if (code === 'USD' && snap.gold) {
    const n =
      rateType === 'Alış'
        ? Number(snap.gold.usdBuyPer1)
        : Number(snap.gold.usdSellPer1);
    const normalized = normalizeUsdToPer1(n);
    return isValidPrice(normalized) ? normalized : null;
  }
  return null;
}

/**
 * Hatwan tipi kur çifti (Irak piyasası): her zaman «1 yabancı = X IQD».
 * documentToLedger = 1 birim kasa dövizi → kaç birim cari (firma ana para).
 */
export type CashFxHatwanQuote = {
  /** Gösterim sol: örn. USD */
  quoteCode: string;
  /** Gösterim sağ / pivot: genelde IQD */
  pivotCode: string;
  /** 1 quoteCode = rateInPivot pivotCode (örn. 1677,5) */
  rateInPivot: number;
  /** cash_lines.exchange_rate: 1 cash → ? ledger */
  documentToLedger: number;
};

/**
 * Cari tahsilat için Hatwan uyumlu kur.
 * Örn. kasa USD + cari IQD → rateInPivot=1677,5; documentToLedger=1677,5 (çarpma).
 * Örn. kasa IQD + cari USD → rateInPivot=1677,5; documentToLedger=1/1677,5 (bölme).
 */
export async function resolveCashFxHatwanQuote(
  cashCurrency: string,
  ledgerCurrency: string,
  asOfDate: string,
  rateType: 'Satış' | 'Alış' = 'Satış',
): Promise<CashFxHatwanQuote | null> {
  const cash = String(cashCurrency || '').trim().toUpperCase();
  const ledger = String(ledgerCurrency || '').trim().toUpperCase();
  if (!cash || !ledger) return null;
  if (cash === ledger) {
    return {
      quoteCode: cash,
      pivotCode: cash,
      rateInPivot: 1,
      documentToLedger: 1,
    };
  }

  const pivot = 'IQD';
  const foreign = cash === pivot ? ledger : ledger === pivot ? cash : null;

  if (foreign) {
    let rateInPivot = pickHatwanPivotRate(foreign, rateType);
    if (rateInPivot == null) {
      const { resolveDocumentCurrencyRateToLedger } = await import('./api/masterData');
      // 1 foreign → ? IQD
      const foreignToIqd = await resolveDocumentCurrencyRateToLedger(
        foreign,
        pivot,
        asOfDate,
        rateType,
      );
      if (foreignToIqd != null && foreignToIqd > 0) rateInPivot = foreignToIqd;
    }
    if (rateInPivot == null || !(rateInPivot > 0)) return null;

    // Kasa = yabancı (USD), cari = IQD → çarp
    // Kasa = IQD, cari = yabancı (USD) → böl
    const documentToLedger = cash === pivot ? 1 / rateInPivot : rateInPivot;
    return {
      quoteCode: foreign,
      pivotCode: pivot,
      rateInPivot,
      documentToLedger,
    };
  }

  // IQD dışındaki çapraz (örn. USD↔EUR): belge→ledger çapraz kur
  const { resolveDocumentCurrencyRateToLedger } = await import('./api/masterData');
  const docToLed = await resolveDocumentCurrencyRateToLedger(
    cash,
    ledger,
    asOfDate,
    rateType,
  );
  if (docToLed == null || !(docToLed > 0)) return null;
  return {
    quoteCode: cash,
    pivotCode: ledger,
    rateInPivot: docToLed,
    documentToLedger: docToLed,
  };
}

/** @deprecated resolveCashFxHatwanQuote kullanın */
export async function resolveOneLedgerUnitInCash(
  cashCurrency: string,
  ledgerCurrency: string,
  asOfDate: string,
  rateType: 'Satış' | 'Alış' = 'Satış',
): Promise<number | null> {
  const q = await resolveCashFxHatwanQuote(cashCurrency, ledgerCurrency, asOfDate, rateType);
  if (!q || !(q.documentToLedger > 0)) return null;
  return 1 / q.documentToLedger;
}
