/**
 * Stok fiyat değişim fişleri — Excel toplu fiyat vb. ile oluşturulan `stock_movements` (price_change) listesi.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Percent, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  stockMovementAPI,
  type PriceChangeSlipSummary,
  type StockMovement,
  type StockMovementItem,
} from '../../../services/stockMovementAPI';
import { Button } from '../../ui/button';

function formatDt(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatNum(n: unknown, locale: string): string {
  const x = typeof n === 'number' ? n : parseFloat(String(n));
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString(locale, { maximumFractionDigits: 4 });
}

export function StockPriceChangeSlipsModule() {
  const { tm, language } = useLanguage();
  const { darkMode } = useTheme();
  const locale =
    language === 'en' ? 'en-US' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'tr-TR';

  const [rows, setRows] = useState<PriceChangeSlipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockMovement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await stockMovementAPI.listPriceChangeSlipSummaries();
      setRows(data);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const m = await stockMovementAPI.getById(id);
      setDetail(m);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const title = tm('stockPriceSlipsTitle') || 'Fiyat değişim fişleri';
  const subtitle =
    tm('stockPriceSlipsSubtitle') ||
    'Excel ile toplu fiyat güncellemesinden oluşan fişler. Fiş tarihi ve sisteme kayıt zamanı ayrı gösterilir.';

  const cardClass = useMemo(
    () =>
      darkMode
        ? 'bg-gray-800 border-gray-700 text-gray-100'
        : 'bg-white border-gray-200 text-gray-900',
    [darkMode]
  );

  return (
    <div className={`min-h-full p-4 md:p-6 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Percent className="w-5 h-5 text-violet-500" />
              {title}
            </h1>
            <p className={`text-sm mt-1 max-w-2xl ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{subtitle}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {tm('stockPriceSlipsRefresh') || 'Yenile'}
          </Button>
        </div>

        <div className={`rounded-xl border overflow-hidden ${cardClass}`}>
          {loading ? (
            <div className="p-12 text-center text-sm opacity-70">{tm('stockPriceSlipsLoading') || 'Yükleniyor…'}</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm opacity-70">{tm('stockPriceSlipsEmpty') || 'Kayıtlı fiyat değişim fişi yok.'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className={`${darkMode ? 'bg-gray-900/80' : 'bg-gray-100'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">
                      {tm('stockPriceSlipsFicheDate') || 'Fiş tarihi'}
                    </th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">
                      {tm('stockPriceSlipsRecordDate') || 'Kayıt tarihi'}
                    </th>
                    <th className="px-3 py-2 font-semibold">{tm('stockPriceSlipsDocNo') || 'Belge no'}</th>
                    <th className="px-3 py-2 font-semibold">{tm('stockPriceSlipsLineCount') || 'Kalem'}</th>
                    <th className="px-3 py-2 font-semibold min-w-[200px]">
                      {tm('stockPriceSlipsDescription') || 'Açıklama'}
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                  {rows.map((r) => {
                    const open = expandedId === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr className={open ? (darkMode ? 'bg-violet-950/30' : 'bg-violet-50') : undefined}>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void toggleExpand(r.id)}
                              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                              aria-expanded={open}
                            >
                              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-medium">{formatDt(r.movement_date, locale)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs opacity-90">{formatDt(r.created_at, locale)}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.document_no || '—'}</td>
                          <td className="px-3 py-2">{r.line_count}</td>
                          <td className="px-3 py-2 text-xs line-clamp-2">{r.description || '—'}</td>
                        </tr>
                        {open && (
                          <tr className={darkMode ? 'bg-gray-900/50' : 'bg-gray-50'}>
                            <td colSpan={6} className="px-4 py-3">
                              {detailLoading ? (
                                <div className="text-xs opacity-70">{tm('stockPriceSlipsDetailLoading') || 'Kalemler yükleniyor…'}</div>
                              ) : !detail?.stock_movement_items?.length ? (
                                <div className="text-xs opacity-70">{tm('stockPriceSlipsNoLines') || 'Kalem bulunamadı.'}</div>
                              ) : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
                                  <table className="w-full text-xs">
                                    <thead className="bg-gray-100 dark:bg-gray-800">
                                      <tr>
                                        <th className="px-2 py-1.5 text-left">{tm('stockPriceSlipsProduct') || 'Ürün'}</th>
                                        <th className="px-2 py-1.5 text-right">{tm('stockPriceSlipsNewCost') || 'Yeni alış'}</th>
                                        <th className="px-2 py-1.5 text-right">{tm('stockPriceSlipsNewSale') || 'Yeni satış'}</th>
                                        <th className="px-2 py-1.5 text-left">{tm('stockPriceSlipsNotes') || 'Not'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                      {(detail.stock_movement_items as StockMovementItem[]).map((it) => (
                                        <tr key={it.id}>
                                          <td className="px-2 py-1.5">
                                            <div className="font-medium">{it.product_name || '—'}</div>
                                            <div className="text-[10px] opacity-70 font-mono">{it.product_code || it.product_id}</div>
                                          </td>
                                          <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(it.cost_price, locale)}</td>
                                          <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(it.unit_price, locale)}</td>
                                          <td className="px-2 py-1.5 max-w-md truncate" title={it.notes || ''}>
                                            {it.notes || '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
