/**
 * Cari Period Balance Modal — sağ tıklamadan seçilen tarih aralığında bakiye özeti.
 *
 * - Başlangıç + bitiş tarihi seçici (default son 30 gün)
 * - Seçili aralıkta getAccountStatement çağırır, buildEkstreRows ile satırlara böler
 * - Başlangıç bakiyesi + dönem içi borç/alacak + tahsilat + bitiş bakiyesi gösterir
 * - Liste halinde dönem içi hareketler
 */
import { useEffect, useMemo, useState } from 'react';
import { Calendar, Loader2, X } from 'lucide-react';
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

  const ct: 'customer' | 'supplier' = (cardType ?? account?.cardType ?? 'customer') as 'customer' | 'supplier';
  const isSupplierAccount = ct === 'supplier';

  const loadStatement = async () => {
    if (!startDate || !endDate) {
      setError(tr('cariPeriodBalanceDateRequired') || 'Başlangıç ve bitiş tarihi gerekli');
      return;
    }
    if (startDate > endDate) {
      setError(tr('cariPeriodBalanceDateOrder') || 'Başlangıç tarihi bitişten büyük olamaz');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await supplierAPI.getAccountStatement(
        account.id,
        startDate,
        endDate,
        account.name,
        ct,
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[CariPeriodBalance] load failed:', e);
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
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

  return (
    <PercentBodyModal
      onClose={onClose}
      size="wide"
      ariaLabel={tr('cariPeriodBalanceTitle') || 'Tarih Aralığı Bakiyesi'}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-violet-600" />
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {tr('cariPeriodBalanceTitle') || 'Tarih Aralığı Bakiyesi'}
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
            {tr('cariPeriodBalanceStart') || 'Başlangıç'}
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
            {tr('cariPeriodBalanceEnd') || 'Bitiş'}
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
          {tr('cariPeriodBalanceApply') || 'Uygula'}
        </button>

        {/* Hızlı seçim butonları */}
        <div className="ml-auto flex items-center gap-1">
          {[
            { label: '7g', days: 7 },
            { label: '30g', days: 30 },
            { label: '90g', days: 90 },
            { label: '1yıl', days: 365 },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => {
                setStartDate(daysAgoIso(q.days));
                setEndDate(todayIso());
              }}
              className="px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-200 rounded"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-3 border-b border-gray-200 shrink-0 bg-white">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
            {tr('cariPeriodBalanceOpening') || 'Açılış Bakiyesi'}
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
            {ekstreRows.filter(r => r.borcAmount > 0).length} {tr('cariPeriodBalanceTxns') || 'işlem'}
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
            {ekstreRows.filter(r => r.alacakAmount > 0).length} {tr('cariPeriodBalanceTxns') || 'işlem'}
          </div>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-violet-700 font-bold">
            {tr('cariPeriodBalanceClosing') || 'Kapanış Bakiyesi'}
          </div>
          <div className={`text-lg font-black ${closingBalance > 0 ? 'text-red-700' : closingBalance < 0 ? 'text-green-700' : 'text-gray-500'}`}>
            {fmt(Math.abs(closingBalance))} {mainCurrency}
          </div>
          <div className="text-[10px] text-violet-600">
            {tr('cariPeriodBalanceCardBalance') || 'Kart balance'} ({new Date().toLocaleDateString(dateLocale)})
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
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            {tr('loading') || 'Yükleniyor...'}
          </div>
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