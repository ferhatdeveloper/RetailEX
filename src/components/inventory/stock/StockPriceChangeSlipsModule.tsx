/**
 * Stok fiyat değişim fişleri — Excel toplu fiyat vb. ile oluşturulan `stock_movements` (price_change) listesi.
 * Son fiş fiyatı ile kart fiyatı sapması: doğrudan PG bağlantısında tarama + fiş oluşturma.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Percent, ChevronDown, ChevronRight, ScanSearch, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { shouldUseTenantPostgrestApi } from '../../../config/postgrest.config';
import {
  stockMovementAPI,
  type PriceChangeSlipSummary,
  type PriceDriftCandidate,
  type StockMovement,
  type StockMovementItem,
} from '../../../services/stockMovementAPI';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';

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

  const [drift, setDrift] = useState<PriceDriftCandidate[]>([]);
  const [driftLoading, setDriftLoading] = useState(false);
  const [driftError, setDriftError] = useState<string | null>(null);
  const [selectedDrift, setSelectedDrift] = useState<Set<string>>(() => new Set());
  const [creatingSlip, setCreatingSlip] = useState(false);

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

  const scanDrift = async () => {
    setDriftError(null);
    setDriftLoading(true);
    setSelectedDrift(new Set());
    try {
      if (shouldUseTenantPostgrestApi()) {
        setDrift([]);
        setDriftError(
          tm('stockPriceSlipsDriftPgOnly') ||
            'Sapma taraması şu an yalnızca masaüstü (Tauri) veya doğrudan PostgreSQL köprüsü ile çalışır; tarayıcıda yalnızca PostgREST varsa kullanılamaz.'
        );
        return;
      }
      const data = await stockMovementAPI.findPriceDriftVsLastSlip();
      setDrift(data);
      if (data.length === 0) {
        toast.message(tm('stockPriceSlipsDriftNone') || 'Sapma bulunamadı', {
          description:
            tm('stockPriceSlipsDriftNoneHint') ||
            'En az bir fiyat değişim fişi geçmişi olan ve kart fiyatı son fişten farklı ürün aranır.',
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDriftError(msg);
      toast.error(tm('stockPriceSlipsDriftErr') || 'Tarama başarısız', { description: msg });
    } finally {
      setDriftLoading(false);
    }
  };

  const toggleSelectDrift = (productId: string, checked: boolean) => {
    setSelectedDrift((prev) => {
      const next = new Set(prev);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const selectAllDrift = (checked: boolean) => {
    if (!checked) {
      setSelectedDrift(new Set());
      return;
    }
    setSelectedDrift(new Set(drift.map((d) => d.product_id)));
  };

  const createSlipFromSelection = async () => {
    const ids = [...selectedDrift];
    if (ids.length === 0) {
      toast.warning(tm('stockPriceSlipsDriftPickOne') || 'En az bir ürün seçin.');
      return;
    }
    const lines = drift
      .filter((d) => selectedDrift.has(d.product_id))
      .map((d) => ({
        product_id: d.product_id,
        product_name: d.product_name,
        product_code: d.product_code,
        old_cost: d.last_slip_cost,
        old_price: d.last_slip_price,
        new_cost: d.current_cost,
        new_price: d.current_price,
        unit_name: d.unit,
      }));
    setCreatingSlip(true);
    try {
      await stockMovementAPI.createPriceChangeSlip(lines, { sourceNote: 'Son fiş / kart sapması' });
      toast.success(tm('stockPriceSlipsDriftCreated') || 'Fiyat değişim fişi oluşturuldu', {
        description: `${lines.length} kalem`,
      });
      setSelectedDrift(new Set());
      setDrift([]);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(tm('stockPriceSlipsDriftCreateErr') || 'Fiş oluşturulamadı', { description: msg });
    } finally {
      setCreatingSlip(false);
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

  const allDriftSelected = drift.length > 0 && drift.every((d) => selectedDrift.has(d.product_id));

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

        {/* Son fiş vs kart — sapma tarama */}
        <div className={`rounded-xl border p-4 space-y-3 ${cardClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {tm('stockPriceSlipsDriftTitle') || 'Son fiş fiyatı ile kartı karşılaştır'}
              </h2>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {tm('stockPriceSlipsDriftDesc') ||
                  'Her ürün için en son fiyat değişim fişindeki alış/satış ile ürün kartındaki güncel fiyatı karşılaştırır; farklı olanları listeler. Seçtikleriniz için yeni bir fiyat değişim fişi oluşturur (kart zaten güncel fiyatı taşır; fiş denetim kaydıdır).'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" className="gap-2" onClick={() => void scanDrift()} disabled={driftLoading}>
                <ScanSearch className={`w-4 h-4 ${driftLoading ? 'animate-pulse' : ''}`} />
                {tm('stockPriceSlipsDriftScan') || 'Ürünleri tara'}
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => void createSlipFromSelection()}
                disabled={creatingSlip || selectedDrift.size === 0}
              >
                <FilePlus2 className="w-4 h-4" />
                {tm('stockPriceSlipsDriftCreate') || 'Seçilenler için fiş oluştur'}
              </Button>
            </div>
          </div>
          {driftError ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">{driftError}</p>
          ) : null}
          {drift.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
              <table className="w-full text-left text-xs">
                <thead className={darkMode ? 'bg-gray-900/80' : 'bg-gray-100'}>
                  <tr>
                    <th className="px-2 py-2 w-10">
                      <Checkbox
                        checked={allDriftSelected}
                        onCheckedChange={(v: boolean | 'indeterminate') => selectAllDrift(v === true)}
                        aria-label="Tümünü seç"
                      />
                    </th>
                    <th className="px-2 py-2 font-semibold">{tm('stockPriceSlipsProduct') || 'Ürün'}</th>
                    <th className="px-2 py-2 font-semibold text-right">{tm('stockPriceSlipsLastSlipCost') || 'Son fiş alış'}</th>
                    <th className="px-2 py-2 font-semibold text-right">{tm('stockPriceSlipsLastSlipSale') || 'Son fiş satış'}</th>
                    <th className="px-2 py-2 font-semibold text-right">{tm('stockPriceSlipsCardCost') || 'Kart alış'}</th>
                    <th className="px-2 py-2 font-semibold text-right">{tm('stockPriceSlipsCardSale') || 'Kart satış'}</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
                  {drift.map((d) => (
                    <tr key={d.product_id}>
                      <td className="px-2 py-1.5">
                        <Checkbox
                          checked={selectedDrift.has(d.product_id)}
                          onCheckedChange={(v: boolean | 'indeterminate') => toggleSelectDrift(d.product_id, v === true)}
                          aria-label={d.product_name}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{d.product_name}</div>
                        <div className="text-[10px] opacity-70 font-mono">{d.product_code}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(d.last_slip_cost, locale)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatNum(d.last_slip_price, locale)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-violet-700 dark:text-violet-300">
                        {formatNum(d.current_cost, locale)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-violet-700 dark:text-violet-300">
                        {formatNum(d.current_price, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : driftLoading ? (
            <p className="text-xs opacity-70">{tm('stockPriceSlipsDriftLoading') || 'Taranıyor…'}</p>
          ) : null}
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
