/**
 * Müşteri / Tedarikçi bazlı tarih aralığı satış raporu.
 *
 * İş kuralı:
 * - `cardType = 'customer'` → müşteri satışları (`sales_invoice`, `service`, `hizmet`, `return_invoice`)
 * - `cardType = 'supplier'` → tedarikçi alışları (`purchase_invoice`, `return_invoice`)
 *
 * Kolonlar:
 *   Brüt satış adedi | Brüt tutar | İade adedi | İade tutarı | Net tutar |
 *   Toplam miktar (kg/adet) | Ödenen | Kalan borç | Son satış tarihi
 *
 * Altta 4 KPI strip:
 *   Brüt satış adedi | Brüt tutar | Net tutar | Kalan borç
 *
 * Borç yönü (muhasebe denetimi):
 *   - Müşteri: credit_amount − paid_amount (kalan borç)
 *   - Tedarikçi: aynı formül; cari kart.balance ile çapraz referans
 *
 * "ABS + her zaman +1" kısayolu YASAK; işaret korunur.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Download, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useRegisterDatagridRefresh } from '../../hooks/useRegisterDatagridRefresh';
import {
  getGlobalCurrency,
  getFirmLedgerCurrency,
  formatLedgerAmount,
  getCurrencyDecimalPlaces,
} from '../../utils/currency';
import { getAppDefaultCurrency } from '../../services/postgres';
import { formatMoneyAmount } from '../../utils/formatMoney';
import { localCalendarDateKey, localTodayDateKey } from '../../utils/localCalendarDate';
import { formatReportDateCell } from '../../utils/dateLocale';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { erpReportsAPI, type PartySalesByPeriodRow } from '../../services/api/erpReports';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import {
  buildReportGridColumns,
  REPORT_GRID_DEFAULTS,
} from './shared/ReportDataGrid';
import { ReportKpiStrip } from './shared/ReportKpiStrip';

export type PartySalesPeriodMode = 'customer' | 'supplier';

type GridRow = PartySalesByPeriodRow & {
  initial: string;
  absRemaining: number;
};

function trNorm(value: string | undefined | null): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function exportCsv(
  fileName: string,
  headers: string[],
  rows: string[][],
): void {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(';'),
    ...rows.map((r) => r.map(esc).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PartySalesPeriodReport({ mode }: { mode: PartySalesPeriodMode }) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getFirmLedgerCurrency(
    selectedFirm,
    getAppDefaultCurrency() || getGlobalCurrency(),
  );
  const moneyDec = getCurrencyDecimalPlaces(currency);
  const fmtAmt = (n: number) => formatMoneyAmount(n, { minFrac: moneyDec, maxFrac: moneyDec });

  const isCustomer = mode === 'customer';

  // i18n anahtarları
  const title = isCustomer
    ? tm('partyPeriodSalesCustomerTitle')
    : tm('partyPeriodSalesSupplierTitle');
  const subtitle = isCustomer
    ? tm('partyPeriodSalesCustomerSubtitle')
    : tm('partyPeriodSalesSupplierSubtitle');
  const searchPlaceholder = tm('partyPeriodSalesFilterPlaceholder');
  const dateFromLabel = tm('partyPeriodSalesFrom') || 'Başlangıç';
  const dateToLabel = tm('partyPeriodSalesTo') || 'Bitiş';

  const [rows, setRows] = useState<PartySalesByPeriodRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [dateRange, setDateRange] = useState(() => {
    const end = localTodayDateKey();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return { start: localCalendarDateKey(startDate), end };
  });

  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await erpReportsAPI.getPartySalesByPeriod({
        cardType: mode,
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      setRows(list);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : String(err);
      toast.error(msg || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mode, dateRange.start, dateRange.end]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  useRegisterDatagridRefresh(() => void load(), rootRef);

  const filterTerm = trNorm(filter);

  const gridRows: GridRow[] = useMemo(() => {
    const filtered = filterTerm
      ? rows.filter((r) =>
          [
            r.partyName,
            r.partyCode,
            r.partyId,
            r.phone,
          ]
            .map((x) => String(x ?? '').toLocaleLowerCase('tr-TR'))
            .join(' ')
            .includes(filterTerm),
        )
      : rows;
    return filtered.map((r) => ({
      ...r,
      initial: (r.partyName || '?').trim().charAt(0).toUpperCase(),
      absRemaining: Math.abs(r.remainingDebt),
    }));
  }, [rows, filterTerm]);

  const totals = useMemo(() => {
    let grossCount = 0;
    let returnCount = 0;
    let grossAmount = 0;
    let returnAmount = 0;
    let netAmount = 0;
    let totalQuantity = 0;
    let paidAmount = 0;
    let remainingDebt = 0;
    for (const r of gridRows) {
      grossCount += r.grossCount;
      returnCount += r.returnCount;
      grossAmount += r.grossAmount;
      returnAmount += r.returnAmount;
      netAmount += r.netAmount;
      totalQuantity += r.totalQuantity;
      paidAmount += r.paidAmount;
      remainingDebt += r.remainingDebt;
    }
    return {
      grossCount,
      returnCount,
      grossAmount,
      returnAmount,
      netAmount,
      totalQuantity,
      paidAmount,
      remainingDebt,
      rowCount: gridRows.length,
    };
  }, [gridRows]);

  const panel = darkMode
    ? 'bg-gray-800 border-gray-700 text-gray-100'
    : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  const gridColumns = useMemo(
    () =>
      buildReportGridColumns<GridRow>([
        {
          id: 'partyCode',
          header: tm('erpColCode') || tm('code') || 'Kod',
          size: 110,
        },
        {
          id: 'partyName',
          header: isCustomer ? tm('customer') : tm('supplier'),
          size: 240,
          cell: (r) => (
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded flex items-center justify-center text-white text-sm ${
                  isCustomer ? 'bg-blue-600' : 'bg-orange-600'
                }`}
              >
                {r.initial}
              </div>
              <span className="font-medium">{r.partyName || '—'}</span>
            </div>
          ),
        },
        {
          id: 'phone',
          header: tm('erpColPhone') || 'Telefon',
          size: 130,
          cell: (r) => r.phone || '—',
        },
        {
          id: 'grossCount',
          header: tm('partyPeriodSalesGrossCount') || 'Satış Adedi',
          type: 'number',
          align: 'right',
          size: 120,
          cell: (r) => (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
              {fmtAmt(r.grossCount)}
            </span>
          ),
        },
        {
          id: 'totalQuantity',
          header: tm('partyPeriodSalesTotalQty') || 'Miktar (kg/adet)',
          type: 'number',
          align: 'right',
          size: 140,
          cell: (r) => fmtAmt(r.totalQuantity),
        },
        {
          id: 'grossAmount',
          header: tm('partyPeriodSalesGrossAmount') || 'Brüt Tutar',
          type: 'currency',
          align: 'right',
          size: 150,
          cell: (r) => (
            <span className="font-semibold text-blue-600">
              {formatLedgerAmount(r.grossAmount, currency)}
            </span>
          ),
        },
        {
          id: 'returnAmount',
          header: tm('partyPeriodSalesReturnAmount') || 'İade',
          type: 'currency',
          align: 'right',
          size: 150,
          cell: (r) => (
            <span
              className={`font-semibold ${
                Math.abs(r.returnAmount) > 0.009 ? 'text-red-600' : 'text-gray-400'
              }`}
            >
              {formatLedgerAmount(r.returnAmount, currency)}
            </span>
          ),
        },
        {
          id: 'netAmount',
          header: tm('partyPeriodSalesNetAmount') || 'Net Tutar',
          type: 'currency',
          align: 'right',
          size: 150,
          cell: (r) => (
            <span className="font-semibold text-emerald-600">
              {formatLedgerAmount(r.netAmount, currency)}
            </span>
          ),
        },
        {
          id: 'paidAmount',
          header: tm('partyPeriodSalesPaidAmount') || 'Ödenen',
          type: 'currency',
          align: 'right',
          size: 140,
          cell: (r) => formatLedgerAmount(r.paidAmount, currency),
        },
        {
          id: 'remainingDebt',
          header: tm('partyPeriodSalesRemainingDebt') || 'Kalan Borç',
          type: 'currency',
          align: 'right',
          size: 150,
          cell: (r) => {
            const debt = r.remainingDebt;
            const isCustomerDebt = isCustomer ? debt > 0 : debt < 0;
            return (
              <span
                className={`font-semibold ${
                  Math.abs(debt) > 0.009
                    ? isCustomerDebt
                      ? 'text-rose-600'
                      : 'text-emerald-600'
                    : 'text-gray-400'
                }`}
              >
                {formatLedgerAmount(debt, currency)}
              </span>
            );
          },
        },
        {
          id: 'lastSaleDate',
          header: tm('rptCustLastSale') || 'Son Satış',
          type: 'date',
          size: 130,
          cell: (r) => formatReportDateCell(r.lastSaleDate),
        },
      ]),
    [tm, currency, fmtAmt, isCustomer],
  );

  return (
    <div ref={rootRef} className="space-y-4">
      <div className={`rounded-lg border p-4 ${panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <ShoppingCart
                className={`w-5 h-5 ${isCustomer ? 'text-blue-600' : 'text-orange-600'}`}
              />
              {title}
            </h3>
            <p className={`text-sm ${muted}`}>{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              allowClear
              size="middle"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={searchPlaceholder}
              prefix={<SearchOutlined className="text-slate-400" />}
              style={{ width: 240 }}
            />
            <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              {dateFromLabel}
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start: e.target.value })
                }
                className={`rounded border px-2 py-1 text-sm ${
                  darkMode
                    ? 'border-gray-600 bg-gray-700 text-gray-100'
                    : 'border-gray-300 bg-white text-gray-900'
                }`}
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              {dateToLabel}
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange({ ...dateRange, end: e.target.value })
                }
                className={`rounded border px-2 py-1 text-sm ${
                  darkMode
                    ? 'border-gray-600 bg-gray-700 text-gray-100'
                    : 'border-gray-300 bg-white text-gray-900'
                }`}
              />
            </label>
            <button
              type="button"
              onClick={() => void load()}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${
                darkMode
                  ? 'border-gray-600 hover:bg-gray-700'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {tm('refresh') || 'Yenile'}
            </button>
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  isCustomer
                    ? 'musteri_satis_raporu'
                    : 'tedarikci_satis_raporu',
                  [
                    tm('erpColCode') || 'Kod',
                    isCustomer ? tm('customer') : tm('supplier'),
                    tm('erpColPhone') || 'Telefon',
                    tm('partyPeriodSalesGrossCount') || 'Satış Adedi',
                    tm('partyPeriodSalesTotalQty') || 'Miktar',
                    tm('partyPeriodSalesGrossAmount') || 'Brüt',
                    tm('partyPeriodSalesReturnAmount') || 'İade',
                    tm('partyPeriodSalesNetAmount') || 'Net',
                    tm('partyPeriodSalesPaidAmount') || 'Ödenen',
                    tm('partyPeriodSalesRemainingDebt') || 'Kalan Borç',
                    tm('rptCustLastSale') || 'Son Satış',
                  ],
                  gridRows.map((r) => [
                    r.partyCode,
                    r.partyName,
                    r.phone,
                    String(r.grossCount),
                    String(r.totalQuantity),
                    String(r.grossAmount),
                    String(r.returnAmount),
                    String(r.netAmount),
                    String(r.paidAmount),
                    String(r.remainingDebt),
                    r.lastSaleDate,
                  ]),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <Download className="h-3.5 w-3.5" />
              Excel / CSV
            </button>
          </div>
        </div>
      </div>

      <ReportKpiStrip
        columns={4}
        itemClassName={panel}
        items={[
          {
            key: 'grossCount',
            label: tm('partyPeriodSalesGrossCount') || 'Brüt Satış Adedi',
            value: fmtAmt(totals.grossCount),
            valueClassName: 'text-blue-600',
          },
          {
            key: 'gross',
            label: tm('partyPeriodSalesGrossAmount') || 'Brüt Tutar',
            value: formatLedgerAmount(totals.grossAmount, currency),
            valueClassName: 'text-blue-600',
          },
          {
            key: 'net',
            label: tm('partyPeriodSalesNetAmount') || 'Net Tutar',
            value: formatLedgerAmount(totals.netAmount, currency),
            valueClassName: 'text-emerald-600',
            hint:
              totals.returnAmount < 0
                ? `${tm('partyPeriodSalesReturnAmount') || 'İade'}: ${formatLedgerAmount(totals.returnAmount, currency)}`
                : undefined,
          },
          {
            key: 'debt',
            label: tm('partyPeriodSalesRemainingDebt') || 'Kalan Borç',
            value: formatLedgerAmount(totals.remainingDebt, currency),
            valueClassName:
              Math.abs(totals.remainingDebt) > 0.009
                ? isCustomer
                  ? 'text-rose-600'
                  : 'text-emerald-600'
                : 'text-slate-500',
          },
        ]}
      />

      <div className="h-[520px]">
        <DevExDataGrid
          data={gridRows}
          columns={gridColumns}
          {...REPORT_GRID_DEFAULTS}
          footerLabel={tm('reportsTotalUpper') || tm('total') || 'Toplam'}
          footerSumColumns={[
            {
              columnId: 'grossCount',
              getValue: (r: GridRow) => Number(r.grossCount) || 0,
              format: (n: number) => fmtAmt(n),
            },
            {
              columnId: 'totalQuantity',
              getValue: (r: GridRow) => Number(r.totalQuantity) || 0,
              format: (n: number) => fmtAmt(n),
            },
            {
              columnId: 'grossAmount',
              getValue: (r: GridRow) => Number(r.grossAmount) || 0,
              format: (n: number) => formatLedgerAmount(n, currency),
            },
            {
              columnId: 'returnAmount',
              getValue: (r: GridRow) => Number(r.returnAmount) || 0,
              format: (n: number) => formatLedgerAmount(n, currency),
            },
            {
              columnId: 'netAmount',
              getValue: (r: GridRow) => Number(r.netAmount) || 0,
              format: (n: number) => formatLedgerAmount(n, currency),
            },
            {
              columnId: 'paidAmount',
              getValue: (r: GridRow) => Number(r.paidAmount) || 0,
              format: (n: number) => formatLedgerAmount(n, currency),
            },
            {
              columnId: 'remainingDebt',
              getValue: (r: GridRow) => Number(r.remainingDebt) || 0,
              format: (n: number) => formatLedgerAmount(n, currency),
            },
          ]}
          height="100%"
        />
      </div>
    </div>
  );
}

export function PartyPeriodSalesCustomerReport() {
  return <PartySalesPeriodReport mode="customer" />;
}

export function PartyPeriodSalesSupplierReport() {
  return <PartySalesPeriodReport mode="supplier" />;
}
