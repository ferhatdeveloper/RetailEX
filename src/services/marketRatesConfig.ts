/** Mavi çubuk — dış kur/altın kaynak yapılandırması (localStorage) */

export const MARKET_RATES_CONFIG_KEY = 'retailex_market_rates_config_v1';
export const MARKET_RATES_SNAPSHOT_KEY = 'retailex_market_rates_snapshot_v1';

export interface MarketRatesGoldCells {
  usdSell: string;
  usdBuy: string;
  deduction21: string;
  fee21: string;
  extraFee5g: string;
  extraFee7g: string;
  lira22SellExtra: string;
  buyAdjust22: string;
  buyAdjust18: string;
  liraMithqalAdjust21: string;
}

export interface MarketRatesConfig {
  exchangePageUrl: string;
  goldPageUrl: string;
  spreadsheetId: string;
  sheetGid: string;
  currencyRange: string;
  goldCells: MarketRatesGoldCells;
  goldSpotApiUrl: string;
}

export const DEFAULT_MARKET_RATES_CONFIG: MarketRatesConfig = {
  exchangePageUrl: 'https://hatwanexchange.com/',
  goldPageUrl: 'https://salargolds.com/',
  spreadsheetId: '1p-sbZUCbRtOiyhDMWRpqiY6shnQM2rM_UdwU2W91MIM',
  sheetGid: '0',
  currencyRange: 'A20:C40',
  goldCells: {
    usdSell: 'A5',
    usdBuy: 'A6',
    deduction21: 'A7',
    fee21: 'A14',
    extraFee5g: 'A3',
    extraFee7g: 'A4',
    lira22SellExtra: 'A1',
    buyAdjust22: 'A8',
    buyAdjust18: 'A9',
    liraMithqalAdjust21: 'D12',
  },
  goldSpotApiUrl: 'https://api.gold-api.com/price/XAU',
};

export function loadMarketRatesConfig(): MarketRatesConfig {
  try {
    const raw = localStorage.getItem(MARKET_RATES_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_MARKET_RATES_CONFIG };
    const parsed = JSON.parse(raw) as Partial<MarketRatesConfig>;
    return {
      ...DEFAULT_MARKET_RATES_CONFIG,
      ...parsed,
      goldCells: { ...DEFAULT_MARKET_RATES_CONFIG.goldCells, ...(parsed.goldCells ?? {}) },
    };
  } catch {
    return { ...DEFAULT_MARKET_RATES_CONFIG };
  }
}

export function saveMarketRatesConfig(config: MarketRatesConfig): void {
  localStorage.setItem(MARKET_RATES_CONFIG_KEY, JSON.stringify(config));
}
