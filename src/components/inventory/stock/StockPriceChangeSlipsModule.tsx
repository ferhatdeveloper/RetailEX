/**
 * Stok fiyat değişim fişleri — alış/satış denetim kaydı (`stock_movements.price_change`).
 * Miktar 0; stok değişmez. Excel toplu fiyat, Yeni fiş veya sapma taraması ile oluşur.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Percent, ScanSearch, FilePlus2, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  stockMovementAPI,
  type PriceChangeSlipSummary,
  type PriceDriftCandidate,
  type StockMovement,
  type StockMovementItem,
} from '../../../services/stockMovementAPI';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { displayItemCode } from '../../../utils/lastPurchaseCostSql';
import { formatNumber } from '../../../utils/formatNumber';
import { ReportColumnTable } from '../../reports/shared/ReportDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';

type DraftLine = {
  product_id: string;
  product_code: string;
  product_name: string;
  unit: string;
  old_cost: number;
  old_price: number;
  new_cost: string;
  new_price: string;
};

function formatDt(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

function numOr(raw: string, fallback: number): number {
  const x = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(x) ? x : fallback;
}

function productCodeOf(p: Pick<Product, 'code' | 'barcode' | 'id'>): string {
  const shown = displayItemCode(p.code, p.barcode);
  return shown === '—' ? '' : shown;
}

export function StockPriceChangeSlipsModule() {
  const { tm, language } = useLanguage();
  const locale =
    language === 'en' ? 'en-US' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'tr-TR';

  const [rows, setRows] = useState<PriceChangeSlipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<StockMovement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [drift, setDrift] = useState<PriceDriftCandidate[]>([]);
  const [driftLoading, setDriftLoading] = useState(false);
  const [selectedDrift, setSelectedDrift] = useState<Set<string>>(() => new Set());
  const [creatingSlip, setCreatingSlip] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<DraftLine[]>([]);
  const [writeCard, setWriteCard] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);

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

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail({ id } as StockMovement);
    try {
      const m = await stockMovementAPI.getById(id);
      setDetail(m);
      if (!m) {
        toast.error(tm('stockPriceSlipsNoLines') || 'Kalem bulunamadı.');
      }
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const scanDrift = async () => {
    setDriftLoading(true);
    setSelectedDrift(new Set());
    try {
      const data = await stockMovementAPI.findPriceDriftVsLastSlip();
      setDrift(data);
      if (data.length === 0) {
        toast.message(tm('stockPriceSlipsDriftNone') || 'Sapma yok', {
          description:
            tm('stockPriceSlipsDriftNoneHint') ||
            'En az bir fiyat değişim fişi geçmişi olan ve kart fiyatı son fişten farklı ürün aranır.',
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(tm('stockPriceSlipsDriftErr') || 'Tarama başarısız', { description: msg });
    } finally {
      setDriftLoading(false);
    }
  };

  const createSlipFromSelection = async () => {
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
    if (lines.length === 0) {
      toast.warning(tm('stockPriceSlipsDriftPickOne') || 'Listeden ürün seçin.');
      return;
    }
    setCreatingSlip(true);
    try {
      await stockMovementAPI.createPriceChangeSlip(lines, { sourceNote: 'Son fiş / kart sapması' });
      toast.success(tm('stockPriceSlipsDriftCreated') || 'Fiş oluşturuldu', {
        description: `${lines.length} ${tm('stockPriceSlipsLineCount') || 'kalem'}`,
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

  const snapshotFromCards = async () => {
    if (!window.confirm(tm('stockPriceSlipsSnapshotConfirm') || 'Kart fiyatlarından fiş oluşturulsun mu?')) return;
    setSnapshotBusy(true);
    try {
      const products = await productAPI.getAll();
      const lines = (products || [])
        .filter((p) => p && !p.isService && (p.is_active !== false && p.isActive !== false))
        .filter((p) => (Number(p.cost) || 0) !== 0 || (Number(p.price) || 0) !== 0)
        .slice(0, 2000)
        .map((p) => {
          const cost = Number(p.cost) || 0;
          const price = Number(p.price) || 0;
          return {
            product_id: p.id,
            product_name: p.name,
            product_code: productCodeOf(p),
            old_cost: cost,
            old_price: price,
            new_cost: cost,
            new_price: price,
            unit_name: p.unit || 'Adet',
          };
        });
      if (lines.length === 0) {
        toast.warning(tm('stockPriceSlipsSnapshotEmpty') || 'Kartında fiyat olan ürün yok.');
        return;
      }
      await stockMovementAPI.createPriceChangeSlip(lines, { sourceNote: 'Kart fiyatları — başlangıç' });
      toast.success(tm('stockPriceSlipsDriftCreated') || 'Fiş oluşturuldu', {
        description: `${lines.length} ${tm('stockPriceSlipsLineCount') || 'kalem'}`,
      });
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(tm('stockPriceSlipsDriftCreateErr') || 'Fiş oluşturulamadı', { description: msg });
    } finally {
      setSnapshotBusy(false);
    }
  };

  const runSearch = async (q: string) => {
    setSearchQ(q);
    if (q.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    try {
      const hits = await productAPI.search(q.trim());
      setSearchHits((hits || []).filter((p) => !p.isService).slice(0, 20));
    } catch {
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  };

  const addDraft = (p: Product) => {
    if (drafts.some((d) => d.product_id === p.id)) return;
    const cost = Number(p.cost) || 0;
    const price = Number(p.price) || 0;
    setDrafts((prev) => [
      ...prev,
      {
        product_id: p.id,
        product_code: productCodeOf(p),
        product_name: p.name,
        unit: p.unit || 'Adet',
        old_cost: cost,
        old_price: price,
        new_cost: String(cost),
        new_price: String(price),
      },
    ]);
    setSearchQ('');
    setSearchHits([]);
  };

  const saveCreate = async () => {
    if (drafts.length === 0) {
      toast.warning(tm('stockPriceSlipsNeedLine') || 'En az bir kalem ekleyin.');
      return;
    }
    const lines = drafts.map((d) => ({
      product_id: d.product_id,
      product_name: d.product_name,
      product_code: d.product_code,
      old_cost: d.old_cost,
      old_price: d.old_price,
      new_cost: numOr(d.new_cost, d.old_cost),
      new_price: numOr(d.new_price, d.old_price),
      unit_name: d.unit,
    }));
    setSavingCreate(true);
    try {
      await stockMovementAPI.createPriceChangeSlip(lines, {
        sourceNote: writeCard ? 'Manuel fiş — kart güncellendi' : 'Manuel fiş — yalnızca denetim',
      });
      if (writeCard) {
        for (const line of lines) {
          await productAPI.update(line.product_id, { cost: line.new_cost, price: line.new_price });
        }
      }
      toast.success(
        writeCard
          ? tm('stockPriceSlipsCardUpdated') || 'Kart güncellendi ve fiş kaydedildi.'
          : tm('stockPriceSlipsDriftCreated') || 'Fiş oluşturuldu',
        { description: `${lines.length} ${tm('stockPriceSlipsLineCount') || 'kalem'}` },
      );
      setShowCreate(false);
      setDrafts([]);
      setWriteCard(true);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(tm('stockPriceSlipsDriftCreateErr') || 'Fiş oluşturulamadı', { description: msg });
    } finally {
      setSavingCreate(false);
    }
  };

  const title = tm('stockPriceSlipsTitle') || 'Fiyat değişim fişleri';
  const allDriftSelected = drift.length > 0 && drift.every((d) => selectedDrift.has(d.product_id));

  const slipCols = useMemo(
    () => [
      {
        key: 'movement_date',
        header: tm('stockPriceSlipsFicheDate') || 'Fiş tarihi',
        type: 'date' as const,
        size: 150,
        cell: (r: PriceChangeSlipSummary) => formatDt(r.movement_date, locale),
      },
      {
        key: 'created_at',
        header: tm('stockPriceSlipsRecordDate') || 'Kayıt tarihi',
        type: 'date' as const,
        size: 150,
        cell: (r: PriceChangeSlipSummary) => formatDt(r.created_at, locale),
      },
      {
        key: 'document_no',
        header: tm('stockPriceSlipsDocNo') || 'Belge no',
        size: 160,
        cell: (r: PriceChangeSlipSummary) => r.document_no || '—',
      },
      {
        key: 'line_count',
        header: tm('stockPriceSlipsLineCount') || 'Kalem',
        type: 'number' as const,
        align: 'right' as const,
        size: 90,
      },
      {
        key: 'status',
        header: tm('stockPriceSlipsStatus') || 'Durum',
        size: 110,
        cell: (r: PriceChangeSlipSummary) => r.status || '—',
      },
      {
        key: 'description',
        header: tm('stockPriceSlipsDescription') || 'Açıklama',
        cell: (r: PriceChangeSlipSummary) => r.description || '—',
      },
    ],
    [tm, locale],
  );

  const driftCols = useMemo(
    () => [
      {
        key: 'sel',
        header: '',
        size: 44,
        cell: (d: PriceDriftCandidate) => (
          <input
            type="checkbox"
            checked={selectedDrift.has(d.product_id)}
            onChange={(e) => {
              setSelectedDrift((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(d.product_id);
                else next.delete(d.product_id);
                return next;
              });
            }}
            aria-label={d.product_name}
          />
        ),
      },
      {
        key: 'product_code',
        header: tm('stockPriceSlipsProduct') || 'Ürün',
        cell: (d: PriceDriftCandidate) => (
          <div>
            <div className="font-medium">{d.product_name}</div>
            <div className="text-[10px] opacity-70 font-mono">{displayItemCode(d.product_code)}</div>
          </div>
        ),
      },
      {
        key: 'last_slip_cost',
        header: tm('stockPriceSlipsLastSlipCost') || 'Son fiş alış',
        type: 'number' as const,
        align: 'right' as const,
        size: 120,
        cell: (d: PriceDriftCandidate) => formatNumber(d.last_slip_cost),
      },
      {
        key: 'last_slip_price',
        header: tm('stockPriceSlipsLastSlipSale') || 'Son fiş satış',
        type: 'number' as const,
        align: 'right' as const,
        size: 120,
        cell: (d: PriceDriftCandidate) => formatNumber(d.last_slip_price),
      },
      {
        key: 'current_cost',
        header: tm('stockPriceSlipsCardCost') || 'Kart alış',
        type: 'number' as const,
        align: 'right' as const,
        size: 110,
        cell: (d: PriceDriftCandidate) => formatNumber(d.current_cost),
      },
      {
        key: 'current_price',
        header: tm('stockPriceSlipsCardSale') || 'Kart satış',
        type: 'number' as const,
        align: 'right' as const,
        size: 110,
        cell: (d: PriceDriftCandidate) => formatNumber(d.current_price),
      },
    ],
    [tm, selectedDrift],
  );

  const detailLines = (detail?.stock_movement_items || []) as StockMovementItem[];
  const detailCols = useMemo(
    () => [
      {
        key: 'product_code',
        header: tm('stockPriceSlipsProduct') || 'Ürün',
        cell: (it: StockMovementItem) => (
          <div>
            <div className="font-medium">{it.product_name || '—'}</div>
            <div className="text-[10px] opacity-70 font-mono">
              {displayItemCode(it.product_code) === '—' ? '' : displayItemCode(it.product_code)}
            </div>
          </div>
        ),
      },
      {
        key: 'cost_price',
        header: tm('stockPriceSlipsNewCost') || 'Yeni alış',
        type: 'number' as const,
        align: 'right' as const,
        size: 120,
        cell: (it: StockMovementItem) => formatNumber(Number(it.cost_price) || 0),
      },
      {
        key: 'unit_price',
        header: tm('stockPriceSlipsNewSale') || 'Yeni satış',
        type: 'number' as const,
        align: 'right' as const,
        size: 120,
        cell: (it: StockMovementItem) => formatNumber(Number(it.unit_price) || 0),
      },
      {
        key: 'notes',
        header: tm('stockPriceSlipsNotes') || 'Not',
        cell: (it: StockMovementItem) => it.notes || '—',
      },
    ],
    [tm],
  );

  const headerBtn =
    'flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px] disabled:opacity-50';
  const headerBtnPrimary =
    'flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px] font-semibold disabled:opacity-50';

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      <div className="relative z-20 shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Percent className="w-4 h-4 shrink-0" />
            <h2 className="text-sm truncate">{title}</h2>
            <span className="text-blue-100 text-[10px] ml-2 hidden sm:inline">
              • {rows.length} {tm('stockPriceSlipsCount') || 'fiş'}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            <button type="button" onClick={() => void load()} disabled={loading} className={headerBtn}>
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>{tm('stockPriceSlipsRefresh') || 'Yenile'}</span>
            </button>
            <button type="button" onClick={() => void scanDrift()} disabled={driftLoading} className={headerBtn}>
              <ScanSearch className={`w-3 h-3 ${driftLoading ? 'animate-pulse' : ''}`} />
              <span>{tm('stockPriceSlipsDriftScan') || 'Ürünleri tara'}</span>
            </button>
            <button
              type="button"
              onClick={() => void snapshotFromCards()}
              disabled={snapshotBusy}
              className={headerBtn}
              title={tm('stockPriceSlipsSnapshotHint')}
            >
              <FilePlus2 className="w-3 h-3" />
              <span className="hidden sm:inline">{tm('stockPriceSlipsSnapshot') || 'Karttan başlangıç fişi'}</span>
            </button>
            <button type="button" onClick={() => setShowCreate(true)} className={headerBtnPrimary}>
              <FilePlus2 className="w-3 h-3" />
              <span>{tm('stockPriceSlipsNew') || 'Yeni fiş'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3 gap-3">
        {drift.length > 0 ? (
          <div className="shrink-0 rounded border border-blue-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-blue-100">
              <div>
                <div className="text-xs font-semibold text-gray-800">
                  {tm('stockPriceSlipsDriftTitle') || 'Son fiş fiyatı ile kartı karşılaştır'}
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {tm('stockPriceSlipsDriftDesc') ||
                    'Fiş yalnızca denetim izidir; kart fiyatını tekrar yazmaz.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={allDriftSelected}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedDrift(new Set(drift.map((d) => d.product_id)));
                      else setSelectedDrift(new Set());
                    }}
                  />
                  {tm('catalogSelectAll') || 'Tümü'}
                </label>
                <button
                  type="button"
                  className="px-2 py-1 text-[10px] bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => void createSlipFromSelection()}
                  disabled={creatingSlip || selectedDrift.size === 0}
                >
                  {tm('stockPriceSlipsDriftCreate') || 'Seçilenler için fiş oluştur'}
                </button>
              </div>
            </div>
            <ReportColumnTable data={drift} columns={driftCols} height={240} />
          </div>
        ) : null}

        <div className="flex-1 min-h-0 rounded border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-gray-500">{tm('stockPriceSlipsLoading') || 'Yükleniyor…'}</div>
          ) : rows.length === 0 ? (
            <div className="p-10 max-w-xl mx-auto text-center space-y-3">
              <Percent className="w-8 h-8 mx-auto text-blue-600" />
              <div className="text-sm font-semibold text-gray-800">
                {tm('stockPriceSlipsEmpty') || 'Kayıtlı fiyat değişim fişi yok.'}
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {tm('stockPriceSlipsEmptyHint')}
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700"
                >
                  {tm('stockPriceSlipsNew') || 'Yeni fiş'}
                </button>
                <button
                  type="button"
                  onClick={() => void snapshotFromCards()}
                  disabled={snapshotBusy}
                  className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {tm('stockPriceSlipsSnapshot') || 'Karttan başlangıç fişi'}
                </button>
              </div>
            </div>
          ) : (
            <ReportColumnTable
              data={rows}
              columns={slipCols}
              height="100%"
              onRowClick={(r) => void openDetail(r.id)}
            />
          )}
        </div>
      </div>

      {detail ? (
        <PercentBodyModal size="wide" onClose={() => setDetail(null)} ariaLabel={tm('stockPriceSlipsDetailTitle')}>
          <div className="flex items-center justify-between px-4 py-2 border-b bg-blue-600 text-white shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">
                {detail.document_no || tm('stockPriceSlipsDetailTitle') || 'Fiş kalemleri'}
              </h3>
              <p className="text-[10px] text-blue-100 truncate">{detail.description || ''}</p>
            </div>
            <button type="button" onClick={() => setDetail(null)} className="p-1 hover:bg-white/10" aria-label={tm('stockPriceSlipsClose')}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <PercentBodyModalScrollBody className="p-3">
            {detailLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">
                {tm('stockPriceSlipsDetailLoading') || 'Kalemler yükleniyor…'}
              </div>
            ) : detailLines.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                {tm('stockPriceSlipsNoLines') || 'Kalem bulunamadı.'}
              </div>
            ) : (
              <ReportColumnTable data={detailLines} columns={detailCols} height={420} />
            )}
          </PercentBodyModalScrollBody>
        </PercentBodyModal>
      ) : null}

      {showCreate ? (
        <PercentBodyModal
          size="wide"
          onClose={() => {
            if (!savingCreate) setShowCreate(false);
          }}
          ariaLabel={tm('stockPriceSlipsNew')}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b bg-blue-600 text-white shrink-0">
            <h3 className="text-sm font-semibold">{tm('stockPriceSlipsNew') || 'Yeni fiş'}</h3>
            <button
              type="button"
              onClick={() => !savingCreate && setShowCreate(false)}
              className="p-1 hover:bg-white/10"
              aria-label={tm('stockPriceSlipsClose')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <PercentBodyModalScrollBody className="p-4 space-y-3">
            <p className="text-xs text-gray-600">{tm('stockPriceSlipsPurpose')}</p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-gray-400" />
              <input
                value={searchQ}
                onChange={(e) => void runSearch(e.target.value)}
                placeholder={tm('stockPriceSlipsSearchProduct') || 'Ürün kodu, barkod veya ad'}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded"
              />
              {searchHits.length > 0 ? (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 shadow-lg rounded">
                  {searchHits.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addDraft(p)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex justify-between gap-2"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono text-[10px] text-gray-500 shrink-0">{productCodeOf(p)}</span>
                    </button>
                  ))}
                </div>
              ) : searchQ.trim().length >= 2 && !searching ? (
                <p className="text-[10px] text-gray-500 mt-1">{tm('stockPriceSlipsNoProduct')}</p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={writeCard} onChange={(e) => setWriteCard(e.target.checked)} />
              {tm('stockPriceSlipsWriteCard')}
            </label>

            {drafts.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">{tm('stockPriceSlipsNeedLine')}</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{tm('stockPriceSlipsProduct')}</th>
                      <th className="px-2 py-1.5 text-right">{tm('stockPriceSlipsOldCost')}</th>
                      <th className="px-2 py-1.5 text-right">{tm('stockPriceSlipsOldSale')}</th>
                      <th className="px-2 py-1.5 text-right">{tm('stockPriceSlipsNewCost')}</th>
                      <th className="px-2 py-1.5 text-right">{tm('stockPriceSlipsNewSale')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d) => (
                      <tr key={d.product_id} className="border-t border-gray-100">
                        <td className="px-2 py-1">
                          <div className="font-medium">{d.product_name}</div>
                          <div className="font-mono text-[10px] text-gray-500">{d.product_code}</div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatNumber(d.old_cost)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatNumber(d.old_price)}</td>
                        <td className="px-2 py-1">
                          <input
                            className="w-24 ml-auto block text-right border border-gray-300 px-1 py-0.5"
                            value={d.new_cost}
                            onChange={(e) =>
                              setDrafts((prev) =>
                                prev.map((x) => (x.product_id === d.product_id ? { ...x, new_cost: e.target.value } : x)),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className="w-24 ml-auto block text-right border border-gray-300 px-1 py-0.5"
                            value={d.new_price}
                            onChange={(e) =>
                              setDrafts((prev) =>
                                prev.map((x) => (x.product_id === d.product_id ? { ...x, new_price: e.target.value } : x)),
                              )
                            }
                          />
                        </td>
                        <td className="px-1">
                          <button
                            type="button"
                            className="p-1 text-red-600 hover:bg-red-50"
                            aria-label={tm('stockPriceSlipsRemoveLine')}
                            onClick={() => setDrafts((prev) => prev.filter((x) => x.product_id !== d.product_id))}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PercentBodyModalScrollBody>
          <div className="shrink-0 px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
            <button
              type="button"
              disabled={savingCreate}
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 hover:bg-white"
            >
              {tm('stockPriceSlipsClose') || 'Kapat'}
            </button>
            <button
              type="button"
              disabled={savingCreate || drafts.length === 0}
              onClick={() => void saveCreate()}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {savingCreate ? tm('saving') || 'Kaydediliyor…' : tm('stockPriceSlipsSaveSlip') || 'Fişi kaydet'}
            </button>
          </div>
        </PercentBodyModal>
      ) : null}
    </div>
  );
}
