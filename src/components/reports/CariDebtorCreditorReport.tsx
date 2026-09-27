/**
 * Borçlu müşteriler / Alacaklı tedarikçiler raporları.
 *
 * İş kuralı:
 * - Borçlu → yalnızca müşteri (buyer) + borçlu bakiye (bizim alacağımız)
 * - Alacaklı → yalnızca tedarikçi (seller) + alacaklı bakiye (bizim borcumuz)
 * Partner / personel ve ters yön bakiyeleri bu raporlara girmez.
 *
 * Bakiye kaynağı: `erpReportsAPI.getCariBalances` → Cari Hesaplar ledger (`accountBalance`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Download } from 'lucide-react';
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
import {
  getCariBalanceDirection,
  isCariCreditorsReportRow,
  isCariDebtorsReportRow,
} from '../../utils/cariAccountStatement';
import { erpReportsAPI, type CariBalanceRow } from '../../services/api/erpReports';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import {
  buildReportGridColumns,
  REPORT_GRID_DEFAULTS,
} from './shared/ReportDataGrid';
import { ReportKpiStrip } from './shared/ReportKpiStrip';

export type CariBalanceSideMode = 'debtor' | 'creditor';

type GridRow = CariBalanceRow & {
  typeLabel: string;
  sideLabel: string;
  currencyCode: string;
  phoneDisplay: string;
  absBalance: number;
};

function cariTypeLabel(tm: (k: string) => string, cardType: string): string {
  if (cardType === 'supplier') return tm('erpCardSuppliers');
  if (cardType === 'employee') return tm('erpCardEmployees');
  if (cardType === 'partner') return tm('erpCardPartners');
  return tm('erpCardCustomers');
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
  children,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  onRefresh: () => void;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  const { darkMode } = useTheme();
  const { tm } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  useRegisterDatagridRefresh(onRefresh, rootRef);
  const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-200 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div ref={rootRef} className="space-y-4">
      <div className={`rounded-lg border p-4 ${panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className={`text-sm ${muted}`}>{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

export function CariDebtorCreditorReport({ mode }: { mode: CariBalanceSideMode }) {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const { selectedFirm } = useFirmaDonem();
  const currency = getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency());
  const moneyDec = getCurrencyDecimalPlaces(currency);
  const fmtAmt = (n: number) => formatMoneyAmount(n, { minFrac: moneyDec, maxFrac: moneyDec });

  const [rows, setRows] = useState<CariBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await erpReportsAPI.getCariBalances({
        // getCariBalances balanceSide ile kart türünü kilitler (müşteri / tedarikçi)
        onlyNonZero: true,
        balanceSide: mode,
      });
      // Savunmacı ikinci filtre — API ile aynı iş kuralı
      setRows(
        list.filter((r) =>
          mode === 'debtor'
            ? isCariDebtorsReportRow(r.cardType, r.balance)
            : isCariCreditorsReportRow(r.cardType, r.balance),
        ),
      );
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
      toast.error(msg || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load, selectedFirm?.firm_nr]);

  const gridRows: GridRow[] = useMemo(
    () =>
      rows.map((r) => {
        const dir = getCariBalanceDirection(r.cardType, r.balance, tm);
        return {
          ...r,
          typeLabel: cariTypeLabel(tm, r.cardType),
          sideLabel: dir.sideLabel || (mode === 'debtor' ? tm('balanceSideDebtor') : tm('balanceSideCreditor')),
          currencyCode: currency,
          phoneDisplay: r.phone || '—',
          absBalance: Math.abs(r.balance),
        };
      }),
    [rows, tm, currency, mode],
  );

  const totals = useMemo(() => {
    let sumSigned = 0;
    let sumAbs = 0;
    for (const r of rows) {
      sumSigned += r.balance;
      sumAbs += Math.abs(r.balance);
    }
    return { count: rows.length, sumSigned, sumAbs };
  }, [rows]);

  const tableCls = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const isDebtor = mode === 'debtor';
  const title = isDebtor ? tm('cariDebtorsReportTitle') : tm('cariCreditorsReportTitle');
  const subtitle = isDebtor ? tm('cariDebtorsReportSubtitle') : tm('cariCreditorsReportSubtitle');

  const gridColumns = useMemo(
    () =>
      buildReportGridColumns<GridRow>([
        { id: 'accountCode', header: tm('erpColCode') || tm('code') || 'Kod', size: 110 },
        { id: 'accountName', header: tm('erpColAccount') || tm('title') || 'Unvan', size: 220 },
        { id: 'typeLabel', header: tm('erpColType'), size: 120 },
        {
          id: 'sideLabel',
          header: tm('erpColBalanceSide') || (isDebtor ? tm('balanceSideDebtor') : tm('balanceSideCreditor')),
          size: 130,
        },
        {
          id: 'balance',
          header: tm('erpColBalance'),
          align: 'right',
          size: 140,
          type: 'currency',
          cell: (r) => (
            <span className={`font-semibold ${isDebtor ? 'text-blue-600' : 'text-orange-600'}`}>
              {formatLedgerAmount(r.balance, currency)}
            </span>
          ),
        },
        { id: 'currencyCode', header: tm('currency') || 'PB', size: 80 },
        { id: 'phoneDisplay', header: tm('erpColPhone'), size: 130 },
        {
          id: 'creditLimit',
          header: tm('erpColCreditLimit'),
          align: 'right',
          size: 120,
          cell: (r) => (r.creditLimit ? fmtAmt(r.creditLimit) : '—'),
        },
        { id: 'paymentTerms', header: tm('erpColTerms'), size: 120 },
      ]),
    [tm, currency, fmtAmt, isDebtor],
  );

  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      loading={loading}
      onRefresh={() => void load()}
      onExport={() =>
        exportCsv(
          isDebtor ? 'borclu_musteriler' : 'alacakli_tedarikciler',
          [
            tm('erpColCode') || 'Kod',
            tm('erpColAccount') || 'Unvan',
            tm('erpColType'),
            tm('erpColBalance'),
            tm('currency') || 'PB',
            tm('erpColPhone'),
          ],
          gridRows.map((r) => [
            r.accountCode,
            r.accountName,
            r.typeLabel,
            String(r.balance),
            r.currencyCode,
            r.phone || '',
          ]),
        )
      }
    >
      <ReportKpiStrip
        columns={3}
        itemClassName={tableCls}
        items={[
          {
            key: 'count',
            label: tm('erpColCount') || tm('count') || 'Adet',
            value: String(totals.count),
          },
          {
            key: 'abs',
            label: isDebtor ? tm('cariDebtorsTotalAbs') : tm('cariCreditorsTotalAbs'),
            value: formatLedgerAmount(totals.sumAbs, currency),
            valueClassName: isDebtor ? 'text-blue-500' : 'text-orange-500',
          },
          {
            key: 'signed',
            label: tm('erpColBalance'),
            value: formatLedgerAmount(totals.sumSigned, currency),
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
              columnId: 'balance',
              getValue: (r: GridRow) => Number(r.balance) || 0,
              format: (n: number) => formatLedgerAmount(n, currency),
            },
          ]}
          height="100%"
        />
      </div>
    </ReportShell>
  );
}

export function CariDebtorsReport() {
  return <CariDebtorCreditorReport mode="debtor" />;
}

export function CariCreditorsReport() {
  return <CariDebtorCreditorReport mode="creditor" />;
}
