/**
 * Ürün bazlı tarih aralığı satış raporu — "ürün ürün ne satılmış".
 *
 * Kolonlar (her ürün satırı):
 *   Ürün kodu / Ürün adı / Birim | Satış adedi (brüt) | İade adedi |
 *   Brüt miktar | İade miktarı | Net miktar | Brüt tutar | İade tutarı |
 *   Net tutar | Ağır. ort. birim fiyat | Benzersiz müşteri | İlk/son satış
 *
 * Altta 4 KPI strip:
 *   Toplam satış adedi | Toplam brüt tutar | Toplam net tutar | Benzersiz müşteri
 *
 * Brüt / İade / Net işaretli:
 *   gross = iade olmayan, return = negatif, net = gross + return
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Download, Package } from 'lucide-react';
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
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { erpReportsAPI, type ProductSalesByPeriodRow } from '../../services/api/erpReports';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import {
  buildReportGridColumns,
  REPORT_GRID_DEFAULTS,
} from './shared/ReportDataGrid';
import { ReportKpiStrip } from './shared/ReportKpiStrip';
import { localCalendarDateKey, localTodayDateKey } from '../../utils/localCalendarDate';
import { formatReportDateCell } from '../../utils/dateLocale';

type GridRow = ProductSalesByPeriodRow;

function trNorm(value: string | undefined | null): string {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function exportCsv(fileName: string, headers: string[], rows: string[][]): void {
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

export function ProductSalesByPeriodReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getFirmLedgerCurrency(
    selectedFirm,
    getAppDefaultCurrency() || getGlobalCurrency(),
  );
  const moneyDec = getCurrencyDecimalPlaces(currency);
  const fmtAmt = (n: number) => formatMoneyAmount(n, { minFrac: moneyDec, maxFrac: moneyDec });
  const fmtQty = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 3 });

  const title = tm('productPeriodSalesTitle');
  const subtitle = tm('productPeriodSalesSubtitle');
  const searchPlaceholder = tm('productPeriodSalesFilterPlaceholder');
  const dateFromLabel = tm('partyPeriodSalesFrom') || 'Başlangıç';
  const dateToLabel = tm('partyPeriodSalesTo') || 'Bitiş';

  const [rows, setRows] = useState<ProductSalesByPeriodRow[]>([]);
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
      const list = await erpReportsAPI.getProductSalesByPeriod({
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
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  useRegisterDatagridRefresh(() => void load(), rootRef);

  const filterTerm = trNorm(filter);

  const gridRows: GridRow[] = useMemo(() => {
    if (!filterTerm) return rows;
    return rows.filter((r) =>
      [r.productName, r.productCode, r.productId, r.unit]
        .map((x) => String(x ?? '').toLocaleLowerCase('tr-TR'))
        .join(' ')
        .includes(filterTerm),
    );
  }, [rows, filterTerm]);

  const totals = useMemo(() => {
    let grossCount = 0;
    let returnCount = 0;
    let grossQuantity = 0;
    let returnQuantity = 0;
    let grossAmount = 0;
    let returnAmount = 0;
    let netAmount = 0;
    let distinctCustomers = 0;
    for (const r of gridRows) {
      grossCount += r.grossCount;
      returnCount += r.returnCount;
      grossQuantity += r.grossQuantity;
      returnQuantity += r.returnQuantity;
      grossAmount += r.grossAmount;
      returnAmount += r.returnAmount;
      netAmount += r.netAmount;
      distinctCustomers += r.distinctCustomers;
    }
    return {
      grossCount,
      returnCount,
      grossQuantity,
      returnQuantity,
      grossAmount,
      returnAmount,
      netAmount,
      distinctCustomers,
      productCount: gridRows.length,
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
          id: 'productCode',
          header: tm('erpColCode') || tm('code') || 'Kod',
          size: 110,
          cell: (r) => <span className="font-mono text-xs">{r.productCode || '—'}</span>,
        },
        {
          id: 'productName',
          header: tm('product') || 'Ürün',
          size: 240,
          cell: (r) => (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded flex items-center justify-center text-white">
                <Package className="w-4 h-4" />
              </div>
              <span className="font-medium">{r.productName || '—'}</span>
              {r.unit ? (
                <span className="text-[10px] uppercase text-slate-500">({r.unit})</span>
              ) : null}
            </div>
          ),
        },
        {
          id: 'grossCount',
          header: tm('productPeriodSalesGrossCount') || 'Satış Adedi',
          type: 'number',
          align: 'right',
          size: 110,
          cell: (r) => (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
              {fmtAmt(r.grossCount)}
            </span>
          ),
        },
        {
          id: 'grossQuantity',
          header: tm('productPeriodSalesGrossQty') || 'Brüt Miktar',
          type: 'number',
          align: 'right',
          size: 120,
          cell: (r) => fmtQty(r.grossQuantity),
        },
        {
          id: 'returnQuantity',
          header: tm('productPeriodSalesReturnQty') || 'İade Miktar',
          type: 'number',
          align: 'right',
          size: 120,
          cell: (r) => (
            <span
              className={Math.abs(r.returnQuantity) > 0.001 ? 'text-red-600' : 'text-gray-400'}
            >
              {fmtQty(r.returnQuantity)}
            </span>
          ),
        },
        {
          id: 'grossAmount',
          header: tm('productPeriodSalesGrossAmount') || 'Brüt Tutar',
          type: 'currency',
          align: 'right',
          size: 140,
          cell: (r) => (
            <span className="font-semibold text-blue-600">
              {formatLedgerAmount(r.grossAmount, currency)}
            </span>
          ),
        },
        {
          id: 'returnAmount',
          header: tm('productPeriodSalesReturnAmount') || 'İade Tutarı',
          type: 'currency',
          align: 'right',
          size: 140,
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
          header: tm('productPeriodSalesNetAmount') || 'Net Tutar',
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
          id: 'avgUnitPrice',
          header: tm('productPeriodSalesAvgUnitPrice') || 'Ağır. Ort. Birim Fiyat',
          type: 'currency',
          align: 'right',
          size: 140,
          cell: (r) =>
            Math.abs(r.avgUnitPrice) > 0.009
              ? formatLedgerAmount(r.avgUnitPrice, currency)
              : '—',
        },
        {
          id: 'distinctCustomers',
          header: tm('productPeriodSalesDistinctCustomers') || 'Müşteri Sayısı',
          type: 'number',
          align: 'right',
          size: 110,
          cell: (r) => fmtAmt(r.distinctCustomers),
        },
        {
          id: 'firstSaleDate',
          header: tm('productPeriodSalesFirstSale') || 'İlk Satış',
          type: 'date',
          size: 120,
          cell: (r) => formatReportDateCell(r.firstSaleDate),
        },
        {
          id: 'lastSaleDate',
          header: tm('productPeriodSalesLastSale') || 'Son Satış',
          type: 'date',
          size: 120,
          cell: (r) => formatReportDateCell(r.lastSaleDate),
        },
      ]),
    [tm, currency, fmtAmt, fmtQty],
  );

  return (
    <div ref={rootRef} className="space-y-4">
      <div className={`rounded-lg border p-4 ${panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Package className="w-5 h-5 text-purple-600" />
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
                  'urun_satis_raporu',
                  [
                    tm('erpColCode') || 'Kod',
                    tm('product') || 'Ürün',
                    'Birim',
                    tm('productPeriodSalesGrossCount') || 'Satış Adedi',
                    tm('productPeriodSalesGrossQty') || 'Brüt Miktar',
                    tm('productPeriodSalesReturnQty') || 'İade Miktar',
                    tm('productPeriodSalesGrossAmount') || 'Brüt',
                    tm('productPeriodSalesReturnAmount') || 'İade',
                    tm('productPeriodSalesNetAmount') || 'Net',
                    tm('productPeriodSalesAvgUnitPrice') || 'Ağır. Ort. Fiyat',
                    tm('productPeriodSalesDistinctCustomers') || 'Müşteri',
                    tm('productPeriodSalesFirstSale') || 'İlk Satış',
                    tm('productPeriodSalesLastSale') || 'Son Satış',
                  ],
                  gridRows.map((r) => [
                    r.productCode,
                    r.productName,
                    r.unit,
                    String(r.grossCount),
                    String(r.grossQuantity),
                    String(r.returnQuantity),
                    String(r.grossAmount),
                    String(r.returnAmount),
                    String(r.netAmount),
                    String(r.avgUnitPrice),
                    String(r.distinctCustomers),
                    r.firstSaleDate,
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
            label: tm('productPeriodSalesGrossCount') || 'Satış Adedi',
            value: fmtAmt(totals.grossCount),
            valueClassName: 'text-blue-600',
          },
          {
            key: 'gross',
            label: tm('productPeriodSalesGrossAmount') || 'Brüt Tutar',
            value: formatLedgerAmount(totals.grossAmount, currency),
            valueClassName: 'text-blue-600',
          },
          {
            key: 'net',
            label: tm('productPeriodSalesNetAmount') || 'Net Tutar',
            value: formatLedgerAmount(totals.netAmount, currency),
            valueClassName: 'text-emerald-600',
            hint:
              totals.returnAmount < 0
                ? `${tm('productPeriodSalesReturnAmount') || 'İade'}: ${formatLedgerAmount(totals.returnAmount, currency)}`
                : undefined,
          },
          {
            key: 'customers',
            label: tm('productPeriodSalesDistinctCustomers') || 'Benzersiz Müşteri',
            value: fmtAmt(totals.distinctCustomers),
            valueClassName: 'text-purple-600',
            hint: `${totals.productCount} ${tm('product') || 'ürün'}`,
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
              columnId: 'grossQuantity',
              getValue: (r: GridRow) => Number(r.grossQuantity) || 0,
              format: (n: number) => fmtQty(n),
            },
            {
              columnId: 'returnQuantity',
              getValue: (r: GridRow) => Number(r.returnQuantity) || 0,
              format: (n: number) => fmtQty(n),
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
          ]}
          height="100%"
        />
      </div>
    </div>
  );
}
