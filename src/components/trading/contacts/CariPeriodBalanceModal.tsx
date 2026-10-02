/**
 * Cari Period Balance Modal — sağ tıklamadan seçilen tarih aralığında bakiye özeti.
 *
 * - Başlangıç + bitiş tarihi seçici (default son 30 gün)
 * - Seçili aralıkta getAccountStatement çağırır, buildEkstreRows ile satırlara böler
 * - Başlangıç bakiyesi + dönem içi borç/alacak + tahsilat + bitiş bakiyesi gösterir
 * - Liste halinde dönem içi hareketler
 */
import { useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, X, Package } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { getAppDefaultCurrency } from '../../../services/postgres';
import {
  buildEkstreRows,
  preferIntegerAmountDisplay,
  resolveEkstreDescription,
  ficheTypeToInfo,
  type ExtCardType,
  type EkstreRow,
} from '../../../utils/cariAccountStatement';
import { supplierAPI } from '../../../services/api/suppliers';
import type { Supplier } from '../../../core/types';
import { formatNumber } from '../../../utils/formatNumber';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import type { ColumnDef } from '@tanstack/react-table';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { formatExtractDate } from '../../../utils/materialExtractPrint';

interface CariPeriodBalanceModalProps {
  account: Supplier | CustomerLike;
  cardType: 'customer' | 'supplier';
  onClose: () => void;
}

/** Minimum Supplier'dan beklediğimiz alanlar */
interface CustomerLike {
  id: string;
  code?: string;
  name: string;
  balance?: number;
  cardType?: ExtCardType;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CariPeriodBalanceModal({
  account,
  cardType,
  onClose,
}: CariPeriodBalanceModalProps) {
  const { tm: tr, language } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const mainCurrency = useMemo(
    () => String(selectedFirm?.ana_para_birimi || getAppDefaultCurrency()).trim().toUpperCase().slice(0, 10) || 'IQD',
    [selectedFirm?.ana_para_birimi],
  );
  const mainDec = preferIntegerAmountDisplay(mainCurrency) ? 0 : 2;
  const mainShowDec = !preferIntegerAmountDisplay(mainCurrency);

  const [startDate, setStartDate] = useState(daysAgoIso(30));
  const [endDate, setEndDate] = useState(todayIso());
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ürün satırı görünümü (drill-down)
  const [viewMode, setViewMode] = useState<'fiche' | 'line'>('line');
  const [lineMode, setLineMode] = useState<'detailed' | 'consolidated'>('consolidated');
  const [lineRows, setLineRows] = useState<Array<Record<string, unknown>>>([]);
  const [lineLoading, setLineLoading] = useState(false);
  const [lineError, setLineError] = useState<string | null>(null);

  const ct: 'customer' | 'supplier' = (cardType ?? account?.cardType ?? 'customer') as 'customer' | 'supplier';
  const isSupplierAccount = ct === 'supplier';

  const loadStatement = async () => {
    if (!startDate || !endDate) {
      setError(tr('cariPeriodBalanceDateRequired'));
      return;
    }
    if (startDate > endDate) {
      setError(tr('cariPeriodBalanceDateOrder'));
      return;
    }
    setLoading(true);
    setError(null);
    setLineLoading(true);
    setLineError(null);
    try {
      // İki sorguyu paralel yap: fatura özeti + ürün satırları
      const [ficheData, lineData] = await Promise.all([
        supplierAPI.getAccountStatement(
          account.id,
          startDate,
          endDate,
          account.name,
          ct,
        ),
        supplierAPI.getAccountStatementLineItems(
          account.id,
          startDate,
          endDate,
          account.name,
          ct,
        ).catch((e) => {
          console.warn('[CariPeriodBalance] line items failed:', e);
          setLineError(e instanceof Error ? e.message : String(e));
          return [];
        }),
      ]);
      setRows(Array.isArray(ficheData) ? ficheData : []);
      setLineRows(Array.isArray(lineData) ? lineData : []);
    } catch (e) {
      console.error('[CariPeriodBalance] load failed:', e);
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
      setLineLoading(false);
    }
  };

  // İlk açılışta otomatik yükle (default son 30 gün)
  useEffect(() => {
    void loadStatement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ekstreRows = useMemo<EkstreRow[]>(
    () => buildEkstreRows(rows, ct),
    [rows, ct],
  );

  // Borç / Alacak / Bakiye toplamları
  const totalBorc = useMemo(
    () => ekstreRows.reduce((s, r) => s + r.borcAmount, 0),
    [ekstreRows],
  );
  const totalAlacak = useMemo(
    () => ekstreRows.reduce((s, r) => s + r.alacakAmount, 0),
    [ekstreRows],
  );
  const periodNet = isSupplierAccount ? totalAlacak - totalBorc : totalBorc - totalAlacak;

  // Fatura başlığı vs ürün satırı toplamı mutabakatı
  const reconcile = useMemo(() => {
    if (!lineRows.length || !ekstreRows.length) return null;
    // Fatura başlığı toplamları (borç)
    const ficheMap = new Map<string, { ficheNo: string; ficheTotal: number; linesTotal: number; lineCount: number }>();
    for (const e of ekstreRows) {
      const fno = String(e.fiche_no || '').trim();
      if (!fno) continue;
      const amt = e.borcAmount > 0 ? e.borcAmount : e.alacakAmount;
      if (!(amt > 0)) continue;
      const cur = ficheMap.get(fno) || { ficheNo: fno, ficheTotal: 0, linesTotal: 0, lineCount: 0 };
      cur.ficheTotal += amt;
      ficheMap.set(fno, cur);
    }
    // Ürün satırı toplamları
    for (const l of lineRows) {
      const fno = String(l.fiche_no || '').trim();
      if (!fno) continue;
      const cur = ficheMap.get(fno) || { ficheNo: fno, ficheTotal: 0, linesTotal: 0, lineCount: 0 };
      cur.linesTotal += Number(l.total_amount || 0);
      cur.lineCount += 1;
      ficheMap.set(fno, cur);
    }
    // Mutabakat: diff > 0.5% olan faturalar
    const mismatches: Array<{ ficheNo: string; ficheTotal: number; linesTotal: number; lineCount: number; diffPct: number }> = [];
    for (const v of ficheMap.values()) {
      if (v.lineCount === 0) continue;
      if (Math.abs(v.ficheTotal - v.linesTotal) / Math.max(v.ficheTotal, 1) > 0.005) {
        mismatches.push({
          ...v,
          diffPct: ((v.ficheTotal - v.linesTotal) / Math.max(v.ficheTotal, 1)) * 100,
        });
      }
    }
    return mismatches;
  }, [lineRows, ekstreRows]);

  // Ürün + birim bazında konsolide edilmiş satırlar.
  // Aynı (fiche_no + item_code + unit) tek satıra toplanır; farklı birimler
  // ayrı satır olarak kalır.
  const lineRowsConsolidated = useMemo(() => {
    if (!lineRows.length) return [] as Array<Record<string, unknown> & { _rowCount: number; _rowIds: string[] }>;
    const map = new Map<string, Record<string, unknown> & { _rowCount: number; _rowIds: string[] }>();
    for (const r of lineRows) {
      const fno = String(r.fiche_no || '').trim();
      const code = String(r.item_code || '').trim();
      const unit = String(r.unit || '').trim() || '—';
      const key = `${fno}|${code}|${unit}`;
      const q = Number(r.quantity || 0);
      const up = Number(r.unit_price || 0);
      const disc = Number(r.discount_amount || 0);
      const tot = Number(r.total_amount || 0);
      const cur = map.get(key);
      if (cur) {
        cur.quantity = Number(cur.quantity || 0) + q;
        cur.discount_amount = Number(cur.discount_amount || 0) + disc;
        cur.total_amount = Number(cur.total_amount || 0) + tot;
        // Ağırlıklı ortalama birim fiyat (tutar / miktar)
        if (Number(cur.quantity || 0) > 0) {
          cur.unit_price = Number(cur.total_amount || 0) / Number(cur.quantity || 0);
        }
        cur._rowCount = (cur._rowCount || 0) + 1;
        const idVal = r.id ?? `${fno}-${code}-${cur._rowIds.length}`;
        cur._rowIds.push(String(idVal));
      } else {
        map.set(key, {
          ...r,
          unit,
          unit_price: up,
          quantity: q,
          discount_amount: disc,
          total_amount: tot,
          _rowCount: 1,
          _rowIds: [String(r.id ?? `${fno}-${code}-0`)],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const da = new Date(String(a.sale_date || '')).getTime();
      const db = new Date(String(b.sale_date || '')).getTime();
      if (da !== db) return da - db;
      return String(a.fiche_no || '').localeCompare(String(b.fiche_no || ''));
    });
  }, [lineRows]);

  // Ürün adı + birim bazında toplamlar (ürün seviyesi özet).
  // Çıktı: { "DOMATES|Kg": { itemName, unit, totalQty, totalAmount, ficheCount } }
  const productSummary = useMemo(() => {
    if (!lineRows.length) return [] as Array<{
      key: string;
      itemCode: string;
      itemName: string;
      unit: string;
      totalQty: number;
      totalAmount: number;
      ficheCount: number;
    }>;
    const map = new Map<string, {
      key: string;
      itemCode: string;
      itemName: string;
      unit: string;
      totalQty: number;
      totalAmount: number;
      ficheCount: Set<string>;
    }>();
    for (const r of lineRows) {
      const code = String(r.item_code || '').trim() || '?';
      const name = String(r.item_name || '').trim() || code;
      const unit = String(r.unit || '').trim() || '—';
      const key = `${code}|${unit}`;
      const cur = map.get(key) || {
        key,
        itemCode: code,
        itemName: name,
        unit,
        totalQty: 0,
        totalAmount: 0,
        ficheCount: new Set<string>(),
      };
      cur.totalQty += Number(r.quantity || 0);
      cur.totalAmount += Number(r.total_amount || 0);
      const fno = String(r.fiche_no || '').trim();
      if (fno) cur.ficheCount.add(fno);
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map((v) => ({
        key: v.key,
        itemCode: v.itemCode,
        itemName: v.itemName,
        unit: v.unit,
        totalQty: v.totalQty,
        totalAmount: v.totalAmount,
        ficheCount: v.ficheCount.size,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [lineRows]);
  // Başlangıç bakiyesi = kart balance - periodNet
  const cardBalance = Number(account.balance ?? 0) || 0;
  const openingBalance = cardBalance - periodNet;
  const closingBalance = cardBalance;

  const dateLocale =
    language === 'tr' ? 'tr-TR' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'en-US';

  const fmt = (n: number) => formatNumber(n, mainDec, mainShowDec);

  const columns = useMemo<ColumnDef<EkstreRow, any>[]>(
    () => [
      {
        id: 'date',
        accessorKey: 'date',
        header: tr('dateLabel'),
        size: 110,
        cell: ({ row }) => (
          <span className="font-mono text-gray-600">
            {row.original.date ? formatExtractDate(String(row.original.date)) : '-'}
          </span>
        ),
      },
      {
        id: 'fiche_no',
        accessorKey: 'fiche_no',
        header: tr('ficheNo'),
        size: 130,
        cell: ({ row }) => (
          <span className="font-mono font-bold text-blue-600">
            {row.original.fiche_no || '-'}
          </span>
        ),
      },
      {
        id: 'fiche_type',
        accessorKey: 'fiche_type',
        header: tr('type'),
        size: 140,
        cell: ({ row }) => {
          const { label, color } = ficheTypeToInfo(
            String(row.original.fiche_type ?? ''),
            Number(row.original.trcode),
            row.original.is_cancelled === true,
            tr,
          );
          return (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${color}`}>
              {label}
            </span>
          );
        },
      },
      {
        id: 'description',
        accessorKey: 'notes',
        header: tr('description'),
        size: 240,
        cell: ({ row }) => (
          <span className="break-words text-gray-700">
            {resolveEkstreDescription(
              row.original.notes,
              row.original.fiche_type,
              Number(row.original.trcode) || 0,
              row.original.is_cancelled === true,
              tr,
            )}
          </span>
        ),
      },
      {
        id: 'borc',
        accessorKey: 'borcAmount',
        header: tr('debtor'),
        size: 120,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const amt = row.original.borcAmount;
          if (!(amt > 0)) return null;
          return <span className="font-bold text-red-600">{fmt(amt)}</span>;
        },
      },
      {
        id: 'alacak',
        accessorKey: 'alacakAmount',
        header: tr('creditor'),
        size: 120,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const amt = row.original.alacakAmount;
          if (!(amt > 0)) return null;
          return <span className="font-bold text-green-600">{fmt(amt)}</span>;
        },
      },
      {
        id: 'balance',
        accessorKey: 'balance',
        header: tr('balance'),
        size: 130,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const bal = row.original.balance;
          const color = bal > 0 ? 'text-red-600' : bal < 0 ? 'text-green-600' : 'text-gray-400';
          return (
            <span className={`font-black ${color}`}>
              {fmt(Math.abs(bal))}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tr, mainDec, mainShowDec],
  );

  // Ürün satırı kolonları (fatura içi kalemler)
  const lineColumns = useMemo<ColumnDef<Record<string, any>, any>[]>(
    () => [
      {
        id: 'sale_date',
        accessorKey: 'sale_date',
        header: tr('dateLabel'),
        size: 110,
        cell: ({ row }) => (
          <span className="font-mono text-gray-600">
            {row.original.sale_date ? formatExtractDate(String(row.original.sale_date)) : '-'}
          </span>
        ),
      },
      {
        id: 'fiche_no',
        accessorKey: 'fiche_no',
        header: tr('ficheNo'),
        size: 130,
        cell: ({ row }) => (
          <span className="font-mono font-bold text-blue-600">
            {row.original.fiche_no || '-'}
          </span>
        ),
      },
      {
        id: 'item_code',
        accessorKey: 'item_code',
        header: tr('productCode'),
        size: 110,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-violet-700">
            {row.original.item_code || '-'}
          </span>
        ),
      },
      {
        id: 'item_name',
        accessorKey: 'item_name',
        header: tr('productName'),
        size: 240,
        cell: ({ row }) => {
          const isConsolidated = Number(row.original._rowCount || 0) > 1;
          return (
            <div className="flex flex-col">
              <span className="text-gray-800 break-words">
                {row.original.item_name || '-'}
              </span>
              {isConsolidated && (
                <span className="text-[10px] text-violet-600 font-mono mt-0.5">
                  ({row.original._rowCount} {tr('cariPeriodBalanceLineCount')})
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'unit',
        accessorKey: 'unit',
        header: tr('cariPeriodBalanceUnit') || 'Birim',
        size: 80,
        cell: ({ row }) => {
          const u = String(row.original.unit || '').trim() || '—';
          const palette: Record<string, string> = {
            'Kg': 'bg-orange-100 text-orange-800 border-orange-300',
            'KG': 'bg-orange-100 text-orange-800 border-orange-300',
            'kg': 'bg-orange-100 text-orange-800 border-orange-300',
            'Adet': 'bg-blue-100 text-blue-800 border-blue-300',
            'ADET': 'bg-blue-100 text-blue-800 border-blue-300',
            'adet': 'bg-blue-100 text-blue-800 border-blue-300',
            'Litre': 'bg-cyan-100 text-cyan-800 border-cyan-300',
            'LT': 'bg-cyan-100 text-cyan-800 border-cyan-300',
            'Mt': 'bg-green-100 text-green-800 border-green-300',
            'M': 'bg-green-100 text-green-800 border-green-300',
            'Paket': 'bg-purple-100 text-purple-800 border-purple-300',
          };
          const color = palette[u] || 'bg-gray-100 text-gray-700 border-gray-300';
          return (
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${color}`}>
              {u}
            </span>
          );
        },
      },
      {
        id: 'quantity',
        accessorKey: 'quantity',
        header: tr('quantity'),
        size: 100,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const q = Number(row.original.quantity || 0);
          // Birim bazlı ondalık hassasiyet
          const u = String(row.original.unit || '').trim().toLowerCase();
          const isWeight = ['kg', 'lt', 'litre', 'mt', 'm'].includes(u);
          const decimals = isWeight ? 3 : 0;
          return (
            <span className="font-mono text-gray-700 font-bold">
              {q.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
            </span>
          );
        },
      },
      {
        id: 'unit_price',
        accessorKey: 'unit_price',
        header: tr('unitPrice'),
        size: 120,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono text-gray-700">
            {fmt(Number(row.original.unit_price || 0))}
          </span>
        ),
      },
      {
        id: 'discount_amount',
        accessorKey: 'discount_amount',
        header: tr('discount'),
        size: 90,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const v = Number(row.original.discount_amount || 0);
          if (!(v > 0)) return null;
          return <span className="font-mono text-orange-600">-{fmt(v)}</span>;
        },
      },
      {
        id: 'total_amount',
        accessorKey: 'total_amount',
        header: tr('amount'),
        size: 130,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-bold text-red-600">
            {fmt(Number(row.original.total_amount || 0))}
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tr, mainDec, mainShowDec],
  );

  return (
    <PercentBodyModal
      onClose={onClose}
      size="wide"
      ariaLabel={tr('cariPeriodBalanceTitle')}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-violet-600" />
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {tr('cariPeriodBalanceTitle')}
            </h2>
            <p className="text-xs text-gray-500">
              <span className="font-mono text-blue-600 font-bold">
                {account.code || account.id.slice(0, 8)}
              </span>{' '}
              · {account.name}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Kapat"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tarih seçici */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 font-medium">
            {tr('cariPeriodBalanceStart')}
          </span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded font-mono text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 font-medium">
            {tr('cariPeriodBalanceEnd')}
          </span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={todayIso()}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded font-mono text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadStatement()}
          disabled={loading}
          className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {tr('cariPeriodBalanceApply')}
        </button>

        {/* Hızlı seçim butonları */}
        <div className="ml-auto flex items-center gap-1">
          {/* View mode toggle (Ürün Satırı / Fatura) */}
          <div className="flex items-center bg-white border border-gray-300 rounded mr-2 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('line')}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${viewMode === 'line' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              title={tr('cariPeriodBalanceLineView')}
            >
              {tr('cariPeriodBalanceLineView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('fiche')}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${viewMode === 'fiche' ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              title={tr('cariPeriodBalanceFicheView')}
            >
              {tr('cariPeriodBalanceFicheView')}
            </button>
          </div>
          {/* Detaylı / Birleşik toggle (sadece ürün satırı modunda) */}
          {viewMode === 'line' && (
            <div className="flex items-center bg-white border border-gray-300 rounded mr-2 overflow-hidden">
              <button
                type="button"
                onClick={() => setLineMode('detailed')}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${lineMode === 'detailed' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                title={tr('cariPeriodBalanceDetailedView')}
              >
                {tr('cariPeriodBalanceDetailedView')}
              </button>
              <button
                type="button"
                onClick={() => setLineMode('consolidated')}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${lineMode === 'consolidated' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                title={tr('cariPeriodBalanceConsolidatedView')}
              >
                {tr('cariPeriodBalanceConsolidatedView')}
              </button>
            </div>
          )}
          {[
            { key: 'cariPeriodBalanceQuick7', days: 7 },
            { key: 'cariPeriodBalanceQuick30', days: 30 },
            { key: 'cariPeriodBalanceQuick90', days: 90 },
            { key: 'cariPeriodBalanceQuick365', days: 365 },
          ].map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => {
                setStartDate(daysAgoIso(q.days));
                setEndDate(todayIso());
              }}
              className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded"
            >
              {tr(q.key)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3 border-b border-gray-200 shrink-0 bg-white">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
            {tr('cariPeriodBalanceOpening')}
          </div>
          <div className={`text-lg font-black ${openingBalance > 0 ? 'text-red-600' : openingBalance < 0 ? 'text-green-600' : 'text-gray-500'}`}>
            {fmt(Math.abs(openingBalance))} {mainCurrency}
          </div>
          <div className="text-[10px] text-gray-400">
            {startDate}
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-red-700 font-bold">
            {tr('debtor')}
          </div>
          <div className="text-lg font-black text-red-700">
            {fmt(totalBorc)} {mainCurrency}
          </div>
          <div className="text-[10px] text-red-600">
            {ekstreRows.filter(r => r.borcAmount > 0).length} {tr('cariPeriodBalanceTxns')}
          </div>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-green-700 font-bold">
            {tr('creditor')}
          </div>
          <div className="text-lg font-black text-green-700">
            {fmt(totalAlacak)} {mainCurrency}
          </div>
          <div className="text-[10px] text-green-600">
            {ekstreRows.filter(r => r.alacakAmount > 0).length} {tr('cariPeriodBalanceTxns')}
          </div>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-violet-700 font-bold">
            {tr('cariPeriodBalanceClosing')}
          </div>
          <div className={`text-lg font-black ${closingBalance > 0 ? 'text-red-700' : closingBalance < 0 ? 'text-green-700' : 'text-gray-500'}`}>
            {fmt(Math.abs(closingBalance))} {mainCurrency}
          </div>
          <div className="text-[10px] text-violet-600">
            {tr('cariPeriodBalanceCardBalance')} ({new Date().toLocaleDateString(dateLocale)})
          </div>
        </div>
      </div>

      {/* Hata varsa */}
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700 shrink-0">
          {error}
        </div>
      )}

      <PercentBodyModalScrollBody className="p-0">
        {loading || lineLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {tr('loading')}
          </div>
        ) : viewMode === 'line' ? (
          <>
            {lineError && (
              <div className="px-5 py-2 bg-orange-50 border-b border-orange-200 text-sm text-orange-700">
                {tr('cariPeriodBalanceLineLoadError')}: {lineError}
              </div>
            )}
            {reconcile && reconcile.length > 0 && (
              <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
                <div className="font-bold mb-1">
                  {tr('cariPeriodBalanceReconcileWarning')}: {reconcile.length} {tr('cariPeriodBalanceReconcileCount')}
                </div>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {reconcile.slice(0, 8).map((m) => (
                    <div key={m.ficheNo} className="font-mono flex items-center gap-3">
                      <span className="font-bold">{m.ficheNo}</span>
                      <span>{tr('cariPeriodBalanceFicheHeaderTotal')}: {fmt(m.ficheTotal)}</span>
                      <span>· {tr('cariPeriodBalanceLineTotalAmount')}: {fmt(m.linesTotal)} ({m.lineCount})</span>
                      <span className={m.diffPct > 0 ? 'text-red-600' : 'text-green-600'}>
                        {m.diffPct > 0 ? '+' : ''}{m.diffPct.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                  {reconcile.length > 8 && (
                    <div className="text-amber-700 italic">
                      ... +{reconcile.length - 8} {tr('cariPeriodBalanceMore')}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="px-5 py-2 bg-violet-50 border-b border-violet-200 text-xs text-violet-700 flex items-center gap-2 flex-wrap">
              <Package className="w-4 h-4" />
              {tr('cariPeriodBalanceLineCount')}:{' '}
              <span className="font-bold">
                {lineMode === 'consolidated' ? lineRowsConsolidated.length : lineRows.length}
                {lineMode === 'consolidated' && lineRows.length !== lineRowsConsolidated.length && (
                  <span className="text-violet-500 ml-1">
                    / {lineRows.length}
                  </span>
                )}
              </span>
              {lineRows.length > 0 && (
                <span className="ml-3 text-violet-600">
                  · {tr('cariPeriodBalanceLineTotal')}:{' '}
                  <span className="font-bold">
                    {fmt(lineRows.reduce((s, r: any) => s + Number(r.total_amount || 0), 0))} {mainCurrency}
                  </span>
                </span>
              )}
            </div>

            {/* Ürün Bazında Özet — birim bazında toplamlar */}
            {lineMode === 'consolidated' && productSummary.length > 0 && (
              <div className="px-5 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-200">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-black uppercase tracking-wide text-indigo-800">
                    {tr('cariPeriodBalanceProductSummary')}
                  </h3>
                  <span className="text-[10px] text-indigo-500 font-mono">
                    ({productSummary.length} {tr('cariPeriodBalanceUnit').toLowerCase()})
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {productSummary.map((p) => {
                    const u = String(p.unit || '').trim().toLowerCase();
                    const isWeight = ['kg', 'lt', 'litre', 'mt', 'm'].includes(u);
                    const decimals = isWeight ? 3 : 0;
                    const palette: Record<string, string> = {
                      'kg': 'bg-orange-50 border-orange-300 text-orange-900',
                      'adet': 'bg-blue-50 border-blue-300 text-blue-900',
                      'litre': 'bg-cyan-50 border-cyan-300 text-cyan-900',
                      'lt': 'bg-cyan-50 border-cyan-300 text-cyan-900',
                      'mt': 'bg-green-50 border-green-300 text-green-900',
                      'm': 'bg-green-50 border-green-300 text-green-900',
                      'paket': 'bg-purple-50 border-purple-300 text-purple-900',
                    };
                    const color = palette[u] || 'bg-gray-50 border-gray-300 text-gray-900';
                    return (
                      <div key={p.key} className={`rounded-md border ${color} px-2.5 py-1.5 text-xs`}>
                        <div className="font-bold truncate" title={p.itemName}>
                          {p.itemName}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-mono text-[11px] opacity-80">
                            {p.itemCode}
                          </span>
                          <span className={`text-[10px] font-black uppercase rounded px-1.5 py-0 ${color}`}>
                            {p.unit}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1 font-mono">
                          <span className="font-black">
                            {p.totalQty.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} {p.unit}
                          </span>
                          <span className="font-bold text-red-600">
                            {fmt(p.totalAmount)} {mainCurrency}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-70 mt-0.5">
                          {p.ficheCount} {tr('cariPeriodBalanceProductFiches')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DevExDataGrid
              data={lineMode === 'consolidated' ? lineRowsConsolidated : lineRows}
              columns={lineColumns}
              pageSize={100}
              enableFiltering
              enablePagination
            />
          </>
        ) : (
          <DevExDataGrid
            data={ekstreRows}
            columns={columns}
            pageSize={50}
            enableFiltering
            enablePagination
          />
        )}
      </PercentBodyModalScrollBody>
    </PercentBodyModal>
  );
}