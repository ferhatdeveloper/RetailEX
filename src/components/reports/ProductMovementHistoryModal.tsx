/**
 * Kar-zarar / brüt kâr satırından açılan ürün hareket geçmişi modalı.
 * Kaynak: stockMovementAPI.getProductMovements (fiş + fatura satırları).
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Package } from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import { stockMovementAPI } from '../../services/stockMovementAPI';
import { formatNumber } from '../../utils/formatNumber';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getAppDefaultCurrency } from '../../services/postgres';
import { toast } from 'sonner';
import { displayItemCode } from '../../utils/lastPurchaseCostSql';
import { ReportColumnTable } from './shared/ReportDataGrid';

export type ProductMovementTarget = {
  productId?: string;
  productCode: string;
  productName: string;
  startDate?: string;
  endDate?: string;
};

type MovementRow = {
  id: string;
  date: string;
  documentNo: string;
  typeLabel: string;
  typeTone: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** Brüt kâr — birim maliyet + fiyat varsa dolu; aksi halde null (—). */
  grossProfit: number | null;
  partner: string;
};

function toDayMs(iso: string): number {
  const raw = String(iso || '').trim();
  if (!raw) return NaN;
  // Timestamptz / Date: yerel takvim günü (UTC slice, UTC+3'te bir gün kaydırır).
  if (raw.length > 10 && (/[T\s]/.test(raw) || raw.includes('+'))) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  const s = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return NaN;
  }
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toDisplayDate(iso: string): string {
  const raw = String(iso || '').trim();
  if (!raw) return '—';
  if (raw.length > 10 && (/[T\s]/.test(raw) || raw.includes('+'))) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  const s = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : raw.slice(0, 16);
}

function resolveUnitPrice(m: any, qty: number): number {
  const direct =
    Number(m.unit_price ?? m.unitPrice ?? 0) ||
    Number(m.cost_price ?? 0) ||
    0;
  if (direct) return direct;
  const total = Number(m.total_amount ?? m.total ?? m.net_amount ?? 0) || 0;
  if (total && Math.abs(qty) > 0.0000001) return total / Math.abs(qty);
  return 0;
}

function resolveAmount(m: any, qty: number, unitPrice: number): number {
  const total = Number(m.total_amount ?? m.total ?? m.net_amount ?? 0) || 0;
  if (total) return total;
  return qty * unitPrice;
}

/** API gross_profit veya (birim fiyat − maliyet) × |miktar|; yoksa / sıfırsa null (—). */
function resolveGrossProfit(m: any, qty: number): number | null {
  const stored = Number(m.gross_profit);
  if (Number.isFinite(stored) && Math.abs(stored) > 0.0000001) return stored;

  const fiche = String(m.fiche_type || '').toLowerCase();
  const tr = Number(m.trcode ?? m.movement?.trcode ?? 0);
  const mt = String(m.movement?.movement_type || m.movement_type || '');
  // Alış / alış iadesi: brüt kâr yok
  if (fiche === 'purchase_invoice' || (fiche === 'return_invoice' && (tr === 2 || tr === 6))) return null;
  if (m.source_type === 'slip' && mt !== 'out') return null;

  const unitPrice = Number(m.unit_price ?? m.unitPrice ?? 0) || 0;
  const unitCost = Number(m.unit_cost ?? m.cost_price ?? m.unitCost ?? m.costPrice ?? 0) || 0;
  if (!unitPrice || !unitCost || !qty) return null;
  const line = (unitPrice - unitCost) * Math.abs(qty);
  if (fiche === 'return_invoice' && tr === 3) {
    const v = -Math.abs(line);
    return Math.abs(v) > 0.0000001 ? v : null;
  }
  if (mt === 'out' || fiche === 'sales_invoice' || tr === 7 || tr === 8 || !fiche) {
    return Math.abs(line) > 0.0000001 ? line : null;
  }
  return null;
}

function resolveTypeLabel(
  m: any,
  tm: (k: string) => string
): { label: string; tone: string } {
  const fiche = String(m.fiche_type || '').toLowerCase();
  const tr = Number(m.movement?.trcode ?? m.trcode ?? 0);
  const mt = String(m.movement?.movement_type || m.movement_type || '');
  const src = String(m.source_type || '');

  if (fiche === 'purchase_invoice' || (src === 'invoice' && tr === 1)) {
    return { label: tm('purchaseInvoice'), tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' };
  }
  if (fiche === 'sales_invoice' || (src === 'invoice' && (tr === 7 || tr === 8))) {
    return { label: tm('salesInvoice'), tone: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
  }
  if (fiche === 'return_invoice' && (tr === 3 || mt === 'in')) {
    return { label: tm('salesReturn'), tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' };
  }
  if (fiche === 'return_invoice' || (src === 'invoice' && (tr === 2 || tr === 6) && mt === 'out')) {
    return { label: tm('purchaseReturn'), tone: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200' };
  }
  if (tr === 78 || mt === 'price_change') {
    return { label: tm('reportsPlMovPriceChange'), tone: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' };
  }
  if (mt === 'in') {
    return { label: tm('reportsPlMovStockIn'), tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' };
  }
  if (mt === 'out') {
    return { label: tm('reportsPlMovStockOut'), tone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' };
  }
  if (mt === 'transfer') {
    return { label: tm('reportsPlMovTransfer'), tone: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' };
  }
  return { label: tm('reportsPlMovOther'), tone: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' };
}

export function ProductMovementHistoryModal({
  target,
  onClose,
}: {
  target: ProductMovementTarget;
  onClose: () => void;
}) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const currency = getAppDefaultCurrency();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MovementRow[]>([]);

  const lookupId = String(target.productId || target.productCode || '').trim();
  const rawCode = String(target.productCode || '').trim();
  const lookupCode = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCode)
    ? ''
    : rawCode;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lookupId && !lookupCode) {
        setRows([]);
        setLoading(false);
        toast.error(tm('reportsPlMovLoadError') || 'Ürün kimliği bulunamadı');
        return;
      }
      setLoading(true);
      try {
        const raw = await stockMovementAPI.getProductMovements(lookupId || lookupCode, {
          code: lookupCode || undefined,
        });
        const startMs = target.startDate ? toDayMs(target.startDate) : NaN;
        const endMs = target.endDate ? toDayMs(target.endDate) : NaN;

        type Staged = MovementRow & { dayMs: number };
        const staged: Staged[] = (Array.isArray(raw) ? raw : []).map((m: any, idx: number) => {
          const dateRaw = m.movement?.movement_date || m.movement_date || m.created_at || '';
          const qty = Number(m.quantity) || 0;
          const unitPrice = resolveUnitPrice(m, qty);
          const kind = resolveTypeLabel(m, tm);
          return {
            id: String(m.id || `${idx}`),
            date: toDisplayDate(String(dateRaw)),
            documentNo: String(m.movement?.document_no || m.document_no || '—'),
            typeLabel: kind.label,
            typeTone: kind.tone,
            quantity: qty,
            unitPrice,
            amount: resolveAmount(m, qty, unitPrice),
            grossProfit: resolveGrossProfit(m, qty),
            partner: String(m.notes || '').trim(),
            dayMs: toDayMs(String(dateRaw)),
          };
        });

        let filtered = staged.filter((r) => {
          if (Number.isFinite(startMs) && Number.isFinite(r.dayMs) && r.dayMs < startMs) return false;
          if (Number.isFinite(endMs) && Number.isFinite(r.dayMs) && r.dayMs > endMs) return false;
          return true;
        });
        // Tarih filtresi her şeyi sildi ama ham veri varsa: filtreyi gevşet (TZ kaybı).
        if (filtered.length === 0 && staged.length > 0) {
          filtered = staged;
        }

        const cleaned: MovementRow[] = filtered.map(({ dayMs: _d, ...rest }) => rest);
        cleaned.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        if (!cancelled) setRows(cleaned);
      } catch (err: any) {
        console.error('[ProductMovementHistoryModal]', err);
        if (!cancelled) {
          toast.error(err?.message || tm('reportsPlMovLoadError'));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lookupId, lookupCode, target.startDate, target.endDate, tm]);

  const rangeNote = useMemo(() => {
    const a = target.startDate?.slice(0, 10);
    const b = target.endDate?.slice(0, 10);
    if (a && b) return `${a} — ${b}`;
    return tm('reportsPlMovAllPeriod');
  }, [target.startDate, target.endDate, tm]);

  const shell = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  return (
    <PercentBodyModal
      onClose={onClose}
      size="wide"
      ariaLabel={tm('reportsPlMovTitle')}
      shellClassName={darkMode ? '!bg-gray-900 !text-gray-100' : ''}
    >
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold opacity-90">
            <Package className="w-4 h-4 shrink-0" />
            {tm('reportsPlMovTitle')}
          </div>
          <h2 className="mt-1 text-lg font-bold truncate">{target.productName || '—'}</h2>
          <p className="text-xs text-blue-100 font-mono mt-0.5">
            {displayItemCode(target.productCode) !== '—' ? (
              <>
                {displayItemCode(target.productCode)}
                <span className="mx-2 opacity-50">·</span>
              </>
            ) : null}
            {rangeNote}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 hover:bg-white/15 shrink-0"
          aria-label={tm('close') || 'Kapat'}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <PercentBodyModalScrollBody className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm opacity-70">
            <Loader2 className="w-5 h-5 animate-spin" />
            {tm('reportsPlMovLoading')}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm opacity-60">{tm('reportsPlMovEmpty')}</div>
        ) : (
          <div className="p-2">
            <ReportColumnTable
              data={rows}
              height={480}
              storageNamespace="product-movement-history"
              columns={[
                { key: 'date', header: tm('reportsPlMovColDate'), type: 'date', size: 110 },
                {
                  key: 'documentNo',
                  header: tm('reportsPlMovColDoc'),
                  size: 120,
                  cell: (r) => <span className="font-mono text-xs">{r.documentNo}</span>,
                },
                {
                  key: 'typeLabel',
                  header: tm('reportsPlMovColType'),
                  size: 120,
                  cell: (r) => (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.typeTone}`}>
                      {r.typeLabel}
                    </span>
                  ),
                },
                {
                  key: 'quantity',
                  header: tm('reportsPlMovColQty'),
                  type: 'number',
                  align: 'right',
                  cell: (r) => formatNumber(r.quantity, 3, false),
                },
                {
                  key: 'unitPrice',
                  header: tm('reportsPlMovColUnit'),
                  type: 'number',
                  align: 'right',
                  cell: (r) => `${formatNumber(r.unitPrice, 2, false)} ${currency}`,
                },
                {
                  key: 'amount',
                  header: tm('reportsPlMovColAmount'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: (n) => `${formatNumber(n, 2, false)} ${currency}`,
                  cell: (r) => (
                    <span className="font-medium">{formatNumber(r.amount, 2, false)} {currency}</span>
                  ),
                },
                {
                  key: 'grossProfit',
                  header: tm('reportsPlMovColProfit'),
                  type: 'number',
                  align: 'right',
                  footerSum: true,
                  footerFormat: (n) => `${formatNumber(n, 2, false)} ${currency}`,
                  cell: (r) => (
                    <span
                      className={
                        r.grossProfit == null
                          ? 'opacity-40'
                          : r.grossProfit >= 0
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-rose-700 dark:text-rose-400 font-medium'
                      }
                    >
                      {r.grossProfit == null ? '—' : `${formatNumber(r.grossProfit, 2, false)} ${currency}`}
                    </span>
                  ),
                },
                {
                  key: 'partner',
                  header: tm('reportsPlMovColPartner'),
                  size: 140,
                  cell: (r) => <span className="text-xs opacity-70 truncate max-w-[12rem]">{r.partner || '—'}</span>,
                },
              ]}
            />
          </div>
        )}
      </PercentBodyModalScrollBody>

      <div
        className={`shrink-0 border-t px-6 py-3 flex justify-end ${
          darkMode ? 'border-gray-700 bg-gray-800/50' : 'border-slate-100 bg-slate-50/50'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`rounded-2xl border-2 px-5 py-2 text-sm font-bold uppercase tracking-wider active:scale-[0.98] ${
            darkMode
              ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          {tm('close') || 'Kapat'}
        </button>
      </div>
    </PercentBodyModal>
  );
}
