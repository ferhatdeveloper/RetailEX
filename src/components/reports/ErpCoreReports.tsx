/**
 * ERP çekirdek raporları — cari yaşlandırma, cari özet, kasa/banka, alış özeti, vade/tahsilat.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { formatNumber } from '../../utils/formatNumber';
import { getReportingCurrency } from '../../utils/currency';
import { toSqlDateInputString, localTodayDateKey } from '../../utils/localCalendarDate';
import {
  erpReportsAPI,
  type AgingBucket,
  type CariAgingRow,
  type CariBalanceRow,
  type CashBankMovementRow,
  type CollectionDueRow,
  type PurchaseSummaryRow,
  type SupplierPurchaseReturnRow,
  type SalesReturnRow,
  type ProductGrossProfitRow,
  type CariExtractRow,
  type CriticalStockRow,
  type WarehouseStockRow,
} from '../../services/api/erpReports';
import {
  buildReportDateRangeChange,
  defaultReportDateRange,
  type ReportDatePreset,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';
import {
  ProductMovementHistoryModal,
  type ProductMovementTarget,
} from './ProductMovementHistoryModal';

type CardFilter = 'all' | 'customer' | 'supplier';

function defaultRange(): { start: string; end: string } {
  const end = localTodayDateKey();
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start, end };
}

function exportCsv(fileName: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportShell({
  title,
  subtitle,
  loading,
  onRefresh,
  onExport,
  filters,
  children,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
  onExport?: () => void;
  filters?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-4 ${panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className={`text-sm ${muted}`}>{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filters}
            <button
              type="button"
              onClick={onRefresh}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
                darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {tm('refresh') || 'Yenile'}
            </button>
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Download className="h-3.5 w-3.5" />
                Excel / CSV
              </button>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function bucketLabel(tm: (k: string) => string, b: AgingBucket): string {
  switch (b) {
    case 'current':
      return tm('erpAgingBucketCurrent');
    case 'd1_30':
      return tm('erpAgingBucket130');
    case 'd31_60':
      return tm('erpAgingBucket3160');
    case 'd61_90':
      return tm('erpAgingBucket6190');
    default:
      return tm('erpAgingBucket90Plus');
  }
}

export function CariAgingReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();
  const [cardType, setCardType] = useState<CardFilter>('all');
  const [rows, setRows] = useState<CariAgingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getCariAging({ cardType }));
    } catch (err: any) {
      console.error('[CariAgingReport]', err);
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cardType]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const summary = useMemo(() => {
    const buckets: Record<AgingBucket, number> = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 0,
    };
    for (const r of rows) buckets[r.bucket] += r.amount;
    return buckets;
  }, [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';

  return (
    <ReportShell
      title={tm('borcAlacakYaslandirma')}
      subtitle={tm('erpAgingSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'cari_yaslandirma',
          ['Tip', 'Kod', 'Unvan', 'Fiş', 'Fatura', 'Vade', 'Tutar', 'Gecikme', 'Kova'],
          rows.map((r) => [
            r.cardType,
            r.accountCode,
            r.accountName,
            r.ficheNo,
            r.invoiceDate,
            r.dueDate,
            String(r.amount),
            String(r.daysOverdue),
            r.bucket,
          ]),
        )
      }
      filters={
        <select
          value={cardType}
          onChange={(e) => setCardType(e.target.value as CardFilter)}
          className={`rounded-lg border px-2 py-2 text-sm ${darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
        >
          <option value="all">{tm('erpCardAll')}</option>
          <option value="customer">{tm('erpCardCustomers')}</option>
          <option value="supplier">{tm('erpCardSuppliers')}</option>
        </select>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.keys(summary) as AgingBucket[]).map((k) => (
          <div key={k} className={`rounded-lg border p-3 ${tableCls}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-60">{bucketLabel(tm, k)}</p>
            <p className="mt-1 text-lg font-bold">
              {formatNumber(summary[k], 2, false)} {currency}
            </p>
          </div>
        ))}
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColAccount')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColFiche')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColInvoiceDate')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColDueDate')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColAmount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColDaysOverdue')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColBucket')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows')}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.ficheNo}-${i}`} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.accountName}</div>
                  <div className="text-xs opacity-60">
                    {r.accountCode} · {r.cardType === 'customer' ? tm('erpCardCustomers') : tm('erpCardSuppliers')}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.ficheNo}</td>
                <td className="px-3 py-2">{r.invoiceDate}</td>
                <td className="px-3 py-2">{r.dueDate}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(r.amount, 2, false)} {currency}
                </td>
                <td className="px-3 py-2 text-right">{r.daysOverdue}</td>
                <td className="px-3 py-2">{bucketLabel(tm, r.bucket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function CariBalanceSummaryReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();
  const [cardType, setCardType] = useState<CardFilter>('all');
  const [rows, setRows] = useState<CariBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getCariBalances({ cardType, onlyNonZero: true }));
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cardType]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const totals = useMemo(() => {
    let recv = 0;
    let pay = 0;
    for (const r of rows) {
      if (r.cardType === 'customer') recv += r.balance;
      else pay += r.balance;
    }
    return { recv, pay, net: recv - pay };
  }, [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';

  return (
    <ReportShell
      title={tm('cariHesapOzeti')}
      subtitle={tm('erpCariBalanceSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'cari_bakiye_ozeti',
          ['Tip', 'Kod', 'Unvan', 'Bakiye', 'Kredi Limiti', 'Vade'],
          rows.map((r) => [
            r.cardType,
            r.accountCode,
            r.accountName,
            String(r.balance),
            String(r.creditLimit),
            r.paymentTerms,
          ]),
        )
      }
      filters={
        <select
          value={cardType}
          onChange={(e) => setCardType(e.target.value as CardFilter)}
          className={`rounded-lg border px-2 py-2 text-sm ${darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
        >
          <option value="all">{tm('erpCardAll')}</option>
          <option value="customer">{tm('erpCardCustomers')}</option>
          <option value="supplier">{tm('erpCardSuppliers')}</option>
        </select>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpReceivables')}</p>
          <p className="text-xl font-bold text-blue-500">
            {formatNumber(totals.recv, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpPayables')}</p>
          <p className="text-xl font-bold text-orange-500">
            {formatNumber(totals.pay, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpNetBalance')}</p>
          <p className="text-xl font-bold">
            {formatNumber(totals.net, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[700px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColAccount')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColType')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColBalance')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColCreditLimit')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColTerms')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.accountId} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.accountName}</div>
                  <div className="font-mono text-xs opacity-60">{r.accountCode}</div>
                </td>
                <td className="px-3 py-2">
                  {r.cardType === 'customer' ? tm('erpCardCustomers') : tm('erpCardSuppliers')}
                </td>
                <td className={`px-3 py-2 text-right font-semibold ${r.balance < 0 ? 'text-red-500' : ''}`}>
                  {formatNumber(r.balance, 2, false)} {currency}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.creditLimit, 2, false)}</td>
                <td className="px-3 py-2">{r.paymentTerms || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function CashBankMovementReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm, selectedDonem } = useFirmaDonem();
  const currency = getReportingCurrency();
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [source, setSource] = useState<'all' | 'cash' | 'bank'>('all');
  const [rows, setRows] = useState<CashBankMovementRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setStartDate(toSqlDateInputString(selectedDonem.beg_date) || initial.start);
      setEndDate(toSqlDateInputString(selectedDonem.end_date) || initial.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await erpReportsAPI.getCashBankMovements({
          startDate,
          endDate,
          source,
        }),
      );
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, source]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (r.netAmount >= 0) inflow += r.netAmount;
      else outflow += Math.abs(r.netAmount);
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';

  return (
    <ReportShell
      title={tm('nakitAkisRaporu')}
      subtitle={tm('erpCashBankSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'kasa_banka_hareket',
          ['Kaynak', 'Kasa/Banka', 'Fiş', 'Tarih', 'Tip', 'Açıklama', 'Cari', 'Net'],
          rows.map((r) => [
            r.source,
            r.registerName,
            r.ficheNo,
            r.date,
            r.transactionType,
            r.definition,
            r.accountName,
            String(r.netAmount),
          ]),
        )
      }
      filters={
        <>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as 'all' | 'cash' | 'bank')}
            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
          >
            <option value="all">{tm('erpSourceAll')}</option>
            <option value="cash">{tm('erpSourceCash')}</option>
            <option value="bank">{tm('erpSourceBank')}</option>
          </select>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpInflow')}</p>
          <p className="text-xl font-bold text-emerald-500">
            {formatNumber(totals.inflow, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpOutflow')}</p>
          <p className="text-xl font-bold text-red-500">
            {formatNumber(totals.outflow, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpNetMovement')}</p>
          <p className="text-xl font-bold">
            {formatNumber(totals.net, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[960px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColDate')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColSource')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColRegister')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColFiche')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColTxnType')}</th>
              <th className="px-3 py-2 text-left">{tm('reportsCashColDesc')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.source === 'cash' ? tm('erpSourceCash') : tm('erpSourceBank')}</td>
                <td className="px-3 py-2">{r.registerName || '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ficheNo}</td>
                <td className="px-3 py-2 text-xs">{r.transactionType}</td>
                <td className="px-3 py-2">
                  <div>{r.definition || '—'}</div>
                  {r.accountName ? <div className="text-xs opacity-60">{r.accountName}</div> : null}
                </td>
                <td className={`px-3 py-2 text-right font-semibold ${r.netAmount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {formatNumber(r.netAmount, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function PurchaseSummaryReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm, selectedDonem } = useFirmaDonem();
  const currency = getReportingCurrency();
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [groupBy, setGroupBy] = useState<'day' | 'month' | 'supplier'>('day');
  const [rows, setRows] = useState<PurchaseSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setStartDate(toSqlDateInputString(selectedDonem.beg_date) || initial.start);
      setEndDate(toSqlDateInputString(selectedDonem.end_date) || initial.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getPurchaseSummary({ startDate, endDate, groupBy }));
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, groupBy]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const totals = useMemo(
    () => ({
      count: rows.reduce((s, r) => s + r.invoiceCount, 0),
      net: rows.reduce((s, r) => s + r.netAmount, 0),
    }),
    [rows],
  );

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';

  return (
    <ReportShell
      title={tm('erpPurchaseSummaryTitle')}
      subtitle={tm('erpPurchaseSummarySubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'alis_ozeti',
          ['Dönem', 'Tedarikçi', 'Fatura Adedi', 'Alış', 'İade', 'Net'],
          rows.map((r) => [
            r.periodLabel,
            r.supplierName,
            String(r.invoiceCount),
            String(r.totalAmount),
            String(r.returnAmount),
            String(r.netAmount),
          ]),
        )
      }
      filters={
        <>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'day' | 'month' | 'supplier')}
            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
          >
            <option value="day">{tm('erpGroupByDay')}</option>
            <option value="month">{tm('erpGroupByMonth')}</option>
            <option value="supplier">{tm('erpGroupBySupplier')}</option>
          </select>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpInvoiceCount')}</p>
          <p className="text-xl font-bold">{totals.count}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpNetPurchase')}</p>
          <p className="text-xl font-bold">
            {formatNumber(totals.net, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColPeriod')}</th>
              {groupBy === 'supplier' && <th className="px-3 py-2 text-left">{tm('erpColSupplier')}</th>}
              <th className="px-3 py-2 text-right">{tm('erpInvoiceCount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpPurchaseAmount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpReturnAmount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpNetPurchase')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={groupBy === 'supplier' ? 6 : 5} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.periodKey} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2 font-medium">{r.periodLabel}</td>
                {groupBy === 'supplier' && <td className="px-3 py-2">{r.supplierName}</td>}
                <td className="px-3 py-2 text-right">{r.invoiceCount}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.totalAmount, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.returnAmount, 2, false)}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(r.netAmount, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function SupplierPurchaseReturnsReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();
  const [dateRange, setDateRange] = useState<ReportDateRangeValue>(() => defaultReportDateRange('month'));
  const [rows, setRows] = useState<SupplierPurchaseReturnRow[]>([]);
  const [loading, setLoading] = useState(false);

  const applyPreset = (preset: ReportDatePreset) => {
    setDateRange(buildReportDateRangeChange(preset, 0, dateRange.from, dateRange.to));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await erpReportsAPI.getSupplierPurchaseReturns({
          startDate: dateRange.from,
          endDate: dateRange.to,
        }),
      );
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const totals = useMemo(
    () => ({
      purchaseCount: rows.reduce((s, r) => s + r.purchaseCount, 0),
      returnCount: rows.reduce((s, r) => s + r.returnCount, 0),
      purchase: rows.reduce((s, r) => s + r.purchaseAmount, 0),
      returns: rows.reduce((s, r) => s + r.returnAmount, 0),
      net: rows.reduce((s, r) => s + r.netAmount, 0),
    }),
    [rows],
  );

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600 text-gray-100' : 'bg-white border-gray-300';
  const presetBtn = (active: boolean) =>
    [
      'rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
      active
        ? 'border-blue-600 bg-blue-600 text-white'
        : darkMode
          ? 'border-gray-600 bg-gray-900 text-gray-200 hover:bg-gray-700'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    ].join(' ');

  return (
    <ReportShell
      title={tm('erpSupplierPurchaseReturnsTitle')}
      subtitle={tm('erpSupplierPurchaseReturnsSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'tedarikci_alis_iadeleri',
          ['Kod', 'Tedarikçi', 'Alış Adedi', 'Alış', 'İade Adedi', 'İade', 'Net'],
          rows.map((r) => [
            r.supplierCode,
            r.supplierName,
            String(r.purchaseCount),
            String(r.purchaseAmount),
            String(r.returnCount),
            String(r.returnAmount),
            String(r.netAmount),
          ]),
        )
      }
      filters={
        <>
          <button type="button" className={presetBtn(dateRange.preset === 'today')} onClick={() => applyPreset('today')}>
            {tm('bCallBoardToday')}
          </button>
          <button type="button" className={presetBtn(dateRange.preset === 'week')} onClick={() => applyPreset('week')}>
            {tm('bCallBoardWeek')}
          </button>
          <button type="button" className={presetBtn(dateRange.preset === 'month')} onClick={() => applyPreset('month')}>
            {tm('bCallBoardMonth')}
          </button>
          <button
            type="button"
            className={presetBtn(dateRange.preset === 'custom')}
            onClick={() => applyPreset('custom')}
            title={tm('bCallBoardDateRange')}
          >
            {tm('bCallBoardDateRange')}
          </button>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) =>
              setDateRange(buildReportDateRangeChange('custom', 0, e.target.value, dateRange.to))
            }
            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
          />
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) =>
              setDateRange(buildReportDateRangeChange('custom', 0, dateRange.from, e.target.value))
            }
            className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
          />
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpPurchaseAmount')}</p>
          <p className="text-xl font-bold">
            {formatNumber(totals.purchase, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpReturnAmount')}</p>
          <p className="text-xl font-bold text-red-500">
            {formatNumber(totals.returns, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpNetPurchase')}</p>
          <p className="text-xl font-bold text-emerald-600">
            {formatNumber(totals.net, 2, false)} {currency}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpInvoiceCount')}</p>
          <p className="text-xl font-bold">
            {totals.purchaseCount} / {totals.returnCount}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[860px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColSupplierCode')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColSupplier')}</th>
              <th className="px-3 py-2 text-right">{tm('erpPurchaseCount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpPurchaseAmount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpReturnCount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpReturnAmount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpNetPurchase')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.supplierId || `${r.supplierCode}-${r.supplierName}`}
                className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}
              >
                <td className="px-3 py-2 font-mono text-xs">{r.supplierCode || '—'}</td>
                <td className="px-3 py-2 font-medium">{r.supplierName}</td>
                <td className="px-3 py-2 text-right">{r.purchaseCount}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.purchaseAmount, 2, false)}</td>
                <td className="px-3 py-2 text-right">{r.returnCount}</td>
                <td className="px-3 py-2 text-right text-red-500">{formatNumber(r.returnAmount, 2, false)}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(r.netAmount, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className={darkMode ? 'border-t-2 border-gray-600 bg-gray-900/40' : 'border-t-2 border-gray-200 bg-gray-50'}>
              <tr>
                <td className="px-3 py-2 font-bold" colSpan={2}>
                  {tm('reportsTotalsRow')}
                </td>
                <td className="px-3 py-2 text-right font-bold">{totals.purchaseCount}</td>
                <td className="px-3 py-2 text-right font-bold">{formatNumber(totals.purchase, 2, false)}</td>
                <td className="px-3 py-2 text-right font-bold">{totals.returnCount}</td>
                <td className="px-3 py-2 text-right font-bold text-red-500">
                  {formatNumber(totals.returns, 2, false)}
                </td>
                <td className="px-3 py-2 text-right font-bold">
                  {formatNumber(totals.net, 2, false)} {currency}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ReportShell>
  );
}

export function CollectionDueReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();
  const [horizon, setHorizon] = useState(30);
  const [rows, setRows] = useState<CollectionDueRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getCollectionDue({ horizonDays: horizon }));
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [horizon]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const counts = useMemo(() => {
    return {
      overdue: rows.filter((r) => r.status === 'overdue').length,
      dueSoon: rows.filter((r) => r.status === 'due_soon').length,
      upcoming: rows.filter((r) => r.status === 'upcoming').length,
      amount: rows.reduce((s, r) => s + r.amount, 0),
    };
  }, [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';

  const statusLabel = (s: CollectionDueRow['status']) => {
    if (s === 'overdue') return tm('erpStatusOverdue');
    if (s === 'due_soon') return tm('erpStatusDueSoon');
    return tm('erpStatusUpcoming');
  };

  return (
    <ReportShell
      title={tm('erpCollectionDueTitle')}
      subtitle={tm('erpCollectionDueSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'vade_tahsilat',
          ['Kod', 'Cari', 'Fiş', 'Fatura', 'Vade', 'Tutar', 'Gün', 'Durum'],
          rows.map((r) => [
            r.accountCode,
            r.accountName,
            r.ficheNo,
            r.invoiceDate,
            r.dueDate,
            String(r.amount),
            String(r.daysUntilDue),
            r.status,
          ]),
        )
      }
      filters={
        <select
          value={horizon}
          onChange={(e) => setHorizon(Number(e.target.value))}
          className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}
        >
          <option value={7}>{tm('erpHorizon7')}</option>
          <option value={30}>{tm('erpHorizon30')}</option>
          <option value={60}>{tm('erpHorizon60')}</option>
          <option value={90}>{tm('erpHorizon90')}</option>
        </select>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpStatusOverdue')}</p>
          <p className="text-xl font-bold text-red-500">{counts.overdue}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpStatusDueSoon')}</p>
          <p className="text-xl font-bold text-amber-500">{counts.dueSoon}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpStatusUpcoming')}</p>
          <p className="text-xl font-bold text-blue-500">{counts.upcoming}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpColAmount')}</p>
          <p className="text-xl font-bold">
            {formatNumber(counts.amount, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[880px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColAccount')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColFiche')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColInvoiceDate')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColDueDate')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColAmount')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColDaysToDue')}</th>
              <th className="px-3 py-2 text-left">{tm('status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center opacity-60">
                  {tm('erpNoRows')}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.ficheNo}-${i}`} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.accountName}</div>
                  <div className="font-mono text-xs opacity-60">{r.accountCode}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.ficheNo}</td>
                <td className="px-3 py-2">{r.invoiceDate}</td>
                <td className="px-3 py-2">{r.dueDate}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(r.amount, 2, false)} {currency}
                </td>
                <td className="px-3 py-2 text-right">{r.daysUntilDue}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      r.status === 'overdue'
                        ? 'bg-red-100 text-red-700'
                        : r.status === 'due_soon'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function SalesReturnsReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm, selectedDonem } = useFirmaDonem();
  const currency = getReportingCurrency();
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [rows, setRows] = useState<SalesReturnRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setStartDate(toSqlDateInputString(selectedDonem.beg_date) || initial.start);
      setEndDate(toSqlDateInputString(selectedDonem.end_date) || initial.end);
    }
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getSalesReturns({ startDate, endDate }));
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.netAmount, 0), [rows]);
  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';

  return (
    <ReportShell
      title={tm('erpSalesReturnsTitle')}
      subtitle={tm('erpSalesReturnsSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'satis_iadeleri',
          ['Fiş', 'Tarih', 'Cari', 'Ödeme', 'Tutar', 'Kasiyer', 'Not'],
          rows.map((r) => [r.ficheNo, r.date, r.accountName, r.paymentMethod, String(r.netAmount), r.cashier, r.notes]),
        )
      }
      filters={
        <>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
        </>
      }
    >
      <div className={`rounded-lg border p-3 ${tableCls}`}>
        <p className="text-xs opacity-60">{tm('erpReturnAmount')}</p>
        <p className="text-xl font-bold text-red-500">
          {formatNumber(total, 2, false)} {currency} · {rows.length} {tm('erpInvoiceCount')}
        </p>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[800px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColFiche')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColDate')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColAccount')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColTxnType')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center opacity-60">{tm('erpNoRows')}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id || r.ficheNo} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2 font-mono text-xs">{r.ficheNo}</td>
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.accountName || '—'}</td>
                <td className="px-3 py-2">{r.paymentMethod || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold text-red-500">
                  {formatNumber(r.netAmount, 2, false)} {currency}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function ProductGrossProfitReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm, selectedDonem } = useFirmaDonem();
  const currency = getReportingCurrency();
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [rows, setRows] = useState<ProductGrossProfitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [movementTarget, setMovementTarget] = useState<ProductMovementTarget | null>(null);

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setStartDate(toSqlDateInputString(selectedDonem.beg_date) || initial.start);
      setEndDate(toSqlDateInputString(selectedDonem.end_date) || initial.end);
    }
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getProductGrossProfit({ startDate, endDate }));
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        revenue: a.revenue + r.revenue,
        cost: a.cost + r.cost,
        profit: a.profit + r.grossProfit,
      }),
      { revenue: 0, cost: 0, profit: 0 },
    );
  }, [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';

  return (
    <ReportShell
      title={tm('erpProductProfitTitle')}
      subtitle={tm('erpProductProfitSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'urun_brut_kar',
          ['Kod', 'Ürün', 'Miktar', 'Ciro', 'Maliyet', 'Brüt Kâr', 'Marj %'],
          rows.map((r) => [
            r.productCode,
            r.productName,
            String(r.quantity),
            String(r.revenue),
            String(r.cost),
            String(r.grossProfit),
            String(r.marginPct.toFixed(1)),
          ]),
        )
      }
      filters={
        <>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpColRevenue')}</p>
          <p className="text-xl font-bold">{formatNumber(totals.revenue, 2, false)} {currency}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpColCost')}</p>
          <p className="text-xl font-bold">{formatNumber(totals.cost, 2, false)} {currency}</p>
        </div>
        <div className={`rounded-lg border p-3 ${tableCls}`}>
          <p className="text-xs opacity-60">{tm('erpColGrossProfit')}</p>
          <p className={`text-xl font-bold ${totals.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {formatNumber(totals.profit, 2, false)} {currency}
          </p>
        </div>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColProduct')}</th>
              <th className="px-3 py-2 text-right">{tm('reportsCashColQty')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColRevenue')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColCost')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColGrossProfit')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColMargin')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center opacity-60">{tm('erpNoRows')}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={`${r.productCode}-${r.productId}`}
                className={`${darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'} cursor-pointer ${
                  darkMode ? 'hover:bg-gray-700/60' : 'hover:bg-emerald-50/80'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!r.productCode && !r.productId) {
                    toast.error(tm('reportsPlMovLoadError') || 'Ürün kimliği bulunamadı');
                    return;
                  }
                  setMovementTarget({
                    productId: r.productId || undefined,
                    productCode: r.productCode,
                    productName: r.productName,
                    startDate,
                    endDate,
                  });
                }}
                title={tm('reportsPlMovClickHint')}
              >
                <td className="px-3 py-2">
                  <div className="font-medium">{r.productName}</div>
                  <div className="font-mono text-xs opacity-60">{r.productCode}</div>
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.quantity, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.revenue, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.cost, 2, false)}</td>
                <td className={`px-3 py-2 text-right font-semibold ${r.grossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {formatNumber(r.grossProfit, 2, false)}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(r.marginPct, 1, false)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {movementTarget ? (
        <ProductMovementHistoryModal
          key={`${movementTarget.productId || ''}|${movementTarget.productCode}`}
          target={movementTarget}
          onClose={() => setMovementTarget(null)}
        />
      ) : null}
    </ReportShell>
  );
}

export function CariExtractReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm, selectedDonem } = useFirmaDonem();
  const currency = getReportingCurrency();
  const initial = defaultRange();
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [cardType, setCardType] = useState<'customer' | 'supplier'>('customer');
  const [accounts, setAccounts] = useState<CariBalanceRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [rows, setRows] = useState<CariExtractRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedDonem?.beg_date && selectedDonem?.end_date) {
      setStartDate(toSqlDateInputString(selectedDonem.beg_date) || initial.start);
      setEndDate(toSqlDateInputString(selectedDonem.end_date) || initial.end);
    }
  }, [selectedDonem?.beg_date, selectedDonem?.end_date]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await erpReportsAPI.getCariBalances({ cardType, onlyNonZero: false });
        setAccounts(list.slice(0, 500));
        setAccountId((prev) => (list.some((a) => a.accountId === prev) ? prev : list[0]?.accountId || ''));
      } catch {
        setAccounts([]);
        setAccountId('');
      }
    })();
  }, [cardType, selectedFirm?.firm_nr]);

  const load = useCallback(async () => {
    if (!accountId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getCariExtract({ accountId, cardType, startDate, endDate }));
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, cardType, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';
  const inputCls = darkMode ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300';
  const closing = rows.length ? rows[rows.length - 1].balance : 0;

  return (
    <ReportShell
      title={tm('erpCariExtractTitle')}
      subtitle={tm('erpCariExtractSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'cari_ekstre',
          ['Tarih', 'Fiş', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'],
          rows.map((r) => [r.date, r.ficheNo, r.definition, String(r.debit), String(r.credit), String(r.balance)]),
        )
      }
      filters={
        <>
          <select value={cardType} onChange={(e) => setCardType(e.target.value as 'customer' | 'supplier')} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`}>
            <option value="customer">{tm('erpCardCustomers')}</option>
            <option value="supplier">{tm('erpCardSuppliers')}</option>
          </select>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`max-w-[220px] rounded-lg border px-2 py-2 text-sm ${inputCls}`}>
            {accounts.length === 0 && <option value="">{tm('erpNoRows')}</option>}
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.accountCode} — {a.accountName}
              </option>
            ))}
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`rounded-lg border px-2 py-2 text-sm ${inputCls}`} />
        </>
      }
    >
      <div className={`rounded-lg border p-3 ${tableCls}`}>
        <p className="text-xs opacity-60">{tm('erpColBalance')}</p>
        <p className="text-xl font-bold">{formatNumber(closing, 2, false)} {currency}</p>
      </div>
      <div className={`overflow-auto rounded-lg border max-h-[520px] ${tableCls}`}>
        <table className="w-full min-w-[880px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColDate')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColFiche')}</th>
              <th className="px-3 py-2 text-left">{tm('reportsCashColDesc')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColDebit')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColCredit')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColBalance')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center opacity-60">{tm('erpNoRows')}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">{r.date}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.ficheNo}</td>
                <td className="px-3 py-2">{r.definition || '—'}</td>
                <td className="px-3 py-2 text-right">{r.debit ? formatNumber(r.debit, 2, false) : '—'}</td>
                <td className="px-3 py-2 text-right">{r.credit ? formatNumber(r.credit, 2, false) : '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.balance, 2, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function CriticalStockReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();
  const [rows, setRows] = useState<CriticalStockRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getCriticalStock());
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';

  return (
    <ReportShell
      title={tm('erpCriticalStockTitle')}
      subtitle={tm('erpCriticalStockSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'kritik_stok',
          ['Kod', 'Ürün', 'Depo', 'Stok', 'Min', 'Kritik', 'Değer', 'Durum'],
          rows.map((r) => [
            r.productCode,
            r.productName,
            r.warehouseCode,
            String(r.stock),
            String(r.minStock),
            String(r.criticalStock),
            String(r.stockValue),
            r.status,
          ]),
        )
      }
    >
      <div className={`overflow-auto rounded-lg border max-h-[560px] ${tableCls}`}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColProduct')}</th>
              <th className="px-3 py-2 text-left">{tm('erpColWarehouse')}</th>
              <th className="px-3 py-2 text-right">{tm('reportsColStock')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColMinStock')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColCriticalLevel')}</th>
              <th className="px-3 py-2 text-right">{tm('reportsColStockValue')}</th>
              <th className="px-3 py-2 text-left">{tm('status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center opacity-60">{tm('erpNoRows')}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.productId} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.productName}</div>
                  <div className="font-mono text-xs opacity-60">{r.productCode}</div>
                </td>
                <td className="px-3 py-2">{r.warehouseCode}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatNumber(r.stock, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.minStock, 2, false)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.criticalStock, 2, false)}</td>
                <td className="px-3 py-2 text-right">
                  {formatNumber(r.stockValue, 2, false)} {currency}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      r.status === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {r.status === 'critical' ? tm('erpStatusCritical') : tm('erpStatusBelowMin')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}

export function WarehouseStockReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getReportingCurrency();
  const [rows, setRows] = useState<WarehouseStockRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await erpReportsAPI.getWarehouseStock());
    } catch (err: any) {
      toast.error(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50 text-gray-600';

  return (
    <ReportShell
      title={tm('erpWarehouseStockTitle')}
      subtitle={tm('erpWarehouseStockSubtitle')}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          'depo_stok',
          ['Depo', 'SKU', 'Miktar', 'Değer', 'Kritik'],
          rows.map((r) => [
            r.warehouseCode,
            String(r.skuCount),
            String(r.totalQty),
            String(r.totalValue),
            String(r.criticalCount),
          ]),
        )
      }
    >
      <div className={`overflow-auto rounded-lg border max-h-[560px] ${tableCls}`}>
        <table className="w-full min-w-[700px] text-sm">
          <thead className={`sticky top-0 ${thCls}`}>
            <tr>
              <th className="px-3 py-2 text-left">{tm('erpColWarehouse')}</th>
              <th className="px-3 py-2 text-right">{tm('erpColSkuCount')}</th>
              <th className="px-3 py-2 text-right">{tm('reportsCashColQty')}</th>
              <th className="px-3 py-2 text-right">{tm('reportsColStockValue')}</th>
              <th className="px-3 py-2 text-right">{tm('erpCriticalStockTitle')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center opacity-60">{tm('erpNoRows')}</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.warehouseCode} className={darkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'}>
                <td className="px-3 py-2 font-medium">{r.warehouseCode}</td>
                <td className="px-3 py-2 text-right">{r.skuCount}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.totalQty, 2, false)}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatNumber(r.totalValue, 2, false)} {currency}
                </td>
                <td className="px-3 py-2 text-right text-red-500">{r.criticalCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
