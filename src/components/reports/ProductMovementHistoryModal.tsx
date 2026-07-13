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
  partner: string;
};

function toDayMs(iso: string): number {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!lookupId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const raw = await stockMovementAPI.getProductMovements(lookupId, {
          code: target.productCode,
        });
        const startMs = target.startDate ? toDayMs(target.startDate) : NaN;
        const endMs = target.endDate ? toDayMs(target.endDate) : NaN;
        const mapped: MovementRow[] = (Array.isArray(raw) ? raw : [])
          .map((m: any, idx: number) => {
            const dateRaw = m.movement?.movement_date || m.movement_date || m.created_at || '';
            const day = toDayMs(String(dateRaw));
            if (Number.isFinite(startMs) && Number.isFinite(day) && day < startMs) return null;
            if (Number.isFinite(endMs) && Number.isFinite(day) && day > endMs) return null;
            const qty = Number(m.quantity) || 0;
            const unitPrice = Number(m.unit_price) || 0;
            const kind = resolveTypeLabel(m, tm);
            return {
              id: String(m.id || `${idx}`),
              date: String(dateRaw).slice(0, 10),
              documentNo: String(m.movement?.document_no || m.document_no || '—'),
              typeLabel: kind.label,
              typeTone: kind.tone,
              quantity: qty,
              unitPrice,
              amount: qty * unitPrice,
              partner: String(m.notes || '').trim(),
            };
          })
          .filter((r): r is MovementRow => r != null);
        mapped.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        if (!cancelled) setRows(mapped);
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
  }, [lookupId, target.productCode, target.startDate, target.endDate, tm]);

  const rangeNote = useMemo(() => {
    const a = target.startDate?.slice(0, 10);
    const b = target.endDate?.slice(0, 10);
    if (a && b) return `${a} — ${b}`;
    return tm('reportsPlMovAllPeriod');
  }, [target.startDate, target.endDate, tm]);

  const shell = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const th = darkMode ? 'bg-gray-800/80 text-gray-300 border-gray-700' : 'bg-slate-50 text-slate-500 border-slate-100';
  const tdBorder = darkMode ? 'border-gray-800' : 'border-slate-100';

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
            {target.productCode || lookupId}
            <span className="mx-2 opacity-50">·</span>
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
          <table className="w-full min-w-[720px] text-sm">
            <thead className={`sticky top-0 z-[1] border-b ${th}`}>
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">{tm('reportsPlMovColDate')}</th>
                <th className="px-4 py-2.5 text-left font-semibold">{tm('reportsPlMovColDoc')}</th>
                <th className="px-4 py-2.5 text-left font-semibold">{tm('reportsPlMovColType')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{tm('reportsPlMovColQty')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{tm('reportsPlMovColUnit')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{tm('reportsPlMovColAmount')}</th>
                <th className="px-4 py-2.5 text-left font-semibold">{tm('reportsPlMovColPartner')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-t ${tdBorder} hover:bg-black/[0.03] dark:hover:bg-white/[0.04]`}>
                  <td className="px-4 py-2 whitespace-nowrap tabular-nums">{r.date || '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.documentNo}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.typeTone}`}>
                      {r.typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNumber(r.quantity, 3, false)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatNumber(r.unitPrice, 2, false)} {currency}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatNumber(r.amount, 2, false)} {currency}
                  </td>
                  <td className="px-4 py-2 text-xs opacity-70 max-w-[12rem] truncate">{r.partner || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
