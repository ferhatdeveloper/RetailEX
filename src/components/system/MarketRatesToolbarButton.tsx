import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, Save, Settings2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import {
  DEFAULT_MARKET_RATES_CONFIG,
  loadMarketRatesConfig,
  saveMarketRatesConfig,
  type MarketRatesConfig,
} from '../../services/marketRatesConfig';
import {
  applyMarketRatesToDatabase,
  fetchAllMarketRates,
  loadMarketRatesSnapshot,
  usdPer1ToPer100,
  type ExternalCurrencyRate,
  type MarketRatesSnapshot,
} from '../../services/marketRatesService';

type TabId = 'fx' | 'gold' | 'settings';

interface MarketRatesToolbarModalProps {
  open: boolean;
  onClose: () => void;
}

function formatNum(n: number, digits = 2): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function MarketRatesToolbarModal({ open, onClose }: MarketRatesToolbarModalProps) {
  const { tm } = useLanguage();
  const [tab, setTab] = useState<TabId>('fx');
  const [config, setConfig] = useState<MarketRatesConfig>(() => loadMarketRatesConfig());
  const [snapshot, setSnapshot] = useState<MarketRatesSnapshot | null>(() => loadMarketRatesSnapshot());
  const [editableFx, setEditableFx] = useState<ExternalCurrencyRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfig(loadMarketRatesConfig());
    const snap = loadMarketRatesSnapshot();
    setSnapshot(snap);
    setEditableFx(snap?.currencies ? [...snap.currencies] : []);
  }, [open]);

  const handleFetch = useCallback(async () => {
    setLoading(true);
    try {
      saveMarketRatesConfig(config);
      const data = await fetchAllMarketRates(config);
      setSnapshot(data);
      setEditableFx([...data.currencies]);
      toast.success(tm('marketRatesFetchOk'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`${tm('marketRatesFetchFail')}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [config, tm]);

  const handleSaveConfig = () => {
    saveMarketRatesConfig(config);
    toast.success(tm('marketRatesConfigSaved'));
  };

  const handleApplyToDb = async () => {
    if (!editableFx.length) {
      toast.error(tm('marketRatesNothingToSave'));
      return;
    }
    setSaving(true);
    try {
      const n = await applyMarketRatesToDatabase(editableFx);
      toast.success(tm('marketRatesSavedToDb').replace('{count}', String(n)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateFxRow = (index: number, field: 'buy' | 'sell', raw: string) => {
    const val = parseFloat(raw.replace(',', '.'));
    setEditableFx((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: Number.isFinite(val) ? val : row[field] } : row))
    );
  };

  const lastFetchLabel = useMemo(() => {
    if (!snapshot?.fetchedAt) return tm('marketRatesNeverFetched');
    try {
      return new Date(snapshot.fetchedAt).toLocaleString('tr-TR');
    } catch {
      return snapshot.fetchedAt;
    }
  }, [snapshot?.fetchedAt, tm]);

  if (!open) return null;

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('marketRatesTitle')}>
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 bg-[var(--asin-primary,#0E2433)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-white min-w-0">
          <Coins className="w-5 h-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold truncate">{tm('marketRatesTitle')}</h2>
            <p className="text-[10px] text-blue-100 truncate">{lastFetchLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => void handleFetch()}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {tm('marketRatesFetch')}
          </button>
        </div>
      </div>

      <div className="shrink-0 flex border-b border-gray-200 bg-gray-50 px-2 gap-1">
        {([
          ['fx', tm('marketRatesTabFx')],
          ['gold', tm('marketRatesTabGold')],
          ['settings', tm('marketRatesTabSettings')],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <PercentBodyModalScrollBody className="p-4">
        {tab === 'fx' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">{tm('marketRatesFxHint')}</p>
            {editableFx.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{tm('marketRatesNoData')}</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left">{tm('code')}</th>
                      <th className="px-2 py-2 text-left">{tm('definitionName')}</th>
                      <th className="px-2 py-2 text-right">{tm('buyRate')}</th>
                      <th className="px-2 py-2 text-right">{tm('sellRate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableFx.map((row, idx) => (
                      <tr key={`${row.code}-${idx}`} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 font-mono font-semibold">
                          {row.code}
                          {row.code === 'USD' && (
                            <p className="text-[9px] font-normal text-gray-400 mt-0.5">
                              {tm('marketRatesFxUsdPer100Note')}: {formatNum(usdPer1ToPer100(row.sell), 0)} / {formatNum(usdPer1ToPer100(row.buy), 0)}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">{row.name}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={row.buy}
                            onChange={(e) => updateFxRow(idx, 'buy', e.target.value)}
                            className="w-full max-w-[8rem] ml-auto block px-2 py-1 border border-gray-300 rounded text-right"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={row.sell}
                            onChange={(e) => updateFxRow(idx, 'sell', e.target.value)}
                            className="w-full max-w-[8rem] ml-auto block px-2 py-1 border border-gray-300 rounded text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'gold' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">{tm('marketRatesGoldHint')}</p>
            {!snapshot?.gold ? (
              <p className="text-sm text-gray-400 text-center py-8">{tm('marketRatesNoData')}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    [tm('marketRatesOunceUsd'), `$${formatNum(snapshot.gold.ounceUsd, 2)}`],
                    [tm('marketRatesUsdSell1'), formatNum(snapshot.gold.usdSellPer1, 2)],
                    [tm('marketRatesUsdBuy1'), formatNum(snapshot.gold.usdBuyPer1, 2)],
                    [tm('marketRatesUsdSell100'), formatNum(snapshot.gold.usdSellPer100, 0)],
                    [tm('marketRatesUsdBuy100'), formatNum(snapshot.gold.usdBuyPer100, 0)],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                      <p className="text-[10px] text-amber-800 font-semibold uppercase">{label}</p>
                      <p className="text-lg font-bold text-amber-950 tabular-nums">{val}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-700 mb-2">{tm('marketRatesMithqal')}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {([
                      ['21', snapshot.gold.mithqal.sell21, snapshot.gold.mithqal.buy21],
                      ['22', snapshot.gold.mithqal.sell22, snapshot.gold.mithqal.buy22],
                      ['18', snapshot.gold.mithqal.sell18, snapshot.gold.mithqal.buy18],
                    ] as const).map(([karat, sell, buy]) => (
                      <div key={`k-${karat}`} className="col-span-2 sm:col-span-1 rounded border border-gray-200 p-2 bg-white space-y-1">
                        <p className="text-[10px] font-bold text-gray-600">{karat} ayar</p>
                        <p className="flex justify-between"><span>{tm('sellRate')}</span><span className="font-bold tabular-nums">{formatNum(sell, 0)}</span></p>
                        <p className="flex justify-between"><span>{tm('buyRate')}</span><span className="font-bold tabular-nums">{formatNum(buy, 0)}</span></p>
                      </div>
                    ))}
                  </div>
                </div>
                {snapshot.gold.sheetCurrencies.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold text-gray-700 mb-2">{tm('marketRatesSheetFx')}</h3>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1.5 text-left">{tm('definitionName')}</th>
                            <th className="px-2 py-1.5 text-right">{tm('buyRate')}</th>
                            <th className="px-2 py-1.5 text-right">{tm('sellRate')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.gold.sheetCurrencies.map((r, i) => (
                            <tr key={`${r.name}-${i}`} className="border-t border-gray-100">
                              <td className="px-2 py-1">{r.name}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{formatNum(r.buy, 0)}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{formatNum(r.sell, 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4 max-w-xl">
            <p className="text-xs text-gray-500">{tm('marketRatesSettingsHint')}</p>
            {([
              ['exchangePageUrl', tm('marketRatesExchangeUrl')],
              ['goldPageUrl', tm('marketRatesGoldUrl')],
              ['spreadsheetId', tm('marketRatesSpreadsheetId')],
              ['sheetGid', tm('marketRatesSheetGid')],
              ['currencyRange', tm('marketRatesCurrencyRange')],
              ['goldSpotApiUrl', tm('marketRatesGoldApiUrl')],
            ] as const).map(([key, label]) => (
              <label key={key} className="block space-y-1">
                <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                <input
                  type="text"
                  value={config[key]}
                  onChange={(e) => setConfig((c) => ({ ...c, [key]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </label>
            ))}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-[11px] font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <Settings2 className="w-3.5 h-3.5" />
                {tm('marketRatesGoldCells')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(DEFAULT_MARKET_RATES_CONFIG.goldCells) as Array<keyof typeof config.goldCells>).map((cellKey) => (
                  <label key={cellKey} className="block space-y-0.5">
                    <span className="text-[10px] text-gray-500">{cellKey}</span>
                    <input
                      type="text"
                      value={config.goldCells[cellKey]}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          goldCells: { ...c.goldCells, [cellKey]: e.target.value },
                        }))
                      }
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                    />
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveConfig}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-800 text-white hover:bg-gray-900"
            >
              {tm('marketRatesSaveConfig')}
            </button>
          </div>
        )}
      </PercentBodyModalScrollBody>

      <div className="shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2 justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-100">
          {tm('close')}
        </button>
        {tab === 'fx' && (
          <button
            type="button"
            onClick={() => void handleApplyToDb()}
            disabled={saving || editableFx.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--asin-accent,#1FA8A0)] text-white hover:bg-[#178f88] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {tm('marketRatesApplyToDb')}
          </button>
        )}
      </div>
    </PercentBodyModal>
  );
}

/** Mavi üst çubuk — kur/altın butonu */
export function MarketRatesToolbarButton({ compact = false }: { compact?: boolean }) {
  const { tm } = useLanguage();
  const [open, setOpen] = useState(false);
  const usdHint = useMemo(() => {
    const snap = loadMarketRatesSnapshot();
    const usd = snap?.currencies.find((c) => c.code === 'USD');
    if (!usd) return null;
    return `${usd.sell.toLocaleString('tr-TR')} (1$)`;
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={tm('marketRatesTitle')}
        aria-label={tm('marketRatesTitle')}
        className={
          compact
            ? 'flex shrink-0 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white h-8 w-8 sm:h-9 sm:w-9 active:scale-95 touch-manipulation'
            : 'flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white min-h-[44px] active:scale-95 transition-colors'
        }
      >
        <Coins className={compact ? 'w-4 h-4' : 'w-4 h-4 sm:w-[18px] sm:h-[18px]'} strokeWidth={2} />
        {!compact && usdHint && (
          <span className="hidden lg:inline text-[10px] font-mono tabular-nums opacity-90">{usdHint}</span>
        )}
      </button>
      {open && <MarketRatesToolbarModal open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
