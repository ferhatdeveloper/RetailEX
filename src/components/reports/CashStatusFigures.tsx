/**
 * Kasa Durumu kartları ve ödeme dağılımı.
 * Üst sıra: açılış, günlük nakit, alınan avans, kapanış.
 * Günlük Kart kutusu gizlidir; kart tahsilatı bu yüzden nakde yazılmaz.
 * Rezervasyon avansı ve gider, üst kutularla aynı kart biçimindedir.
 * İkisi bilgi ve düşüm kartıdır; nakde ve kapanışa ikinci kez girmez.
 * Nakit ve açık cari liste satırı olarak kalır.
 * Kasa ızgarası en altta kalır. Genel toplam çubuğu ve alt açıklama yoktur.
 */
import type { ReactNode } from 'react';
import { Banknote, HandCoins, Receipt } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import {
  cashStatusDistributionListRows,
  type CashRegisterDistributionLine,
  type CashRegisterDrawerLine,
  type CashStatusPaymentLine,
} from '../../utils/cashStatusTotals';
import { ReportColumnTable } from './shared/ReportDataGrid';

/** Ödeme dağılımında liste yerine üst kutu biçiminde duran satırlar. */
const CASH_STATUS_SPOTLIGHT_CODES = new Set(['REZERVASYON_AVANS', 'GIDER']);

export interface CashStatusFigureLabels {
  opening: string;
  openingHint?: string;
  todayCash: string;
  todayCashHint: string;
  reservation: string;
  reservationHint: string;
  todayCard: string;
  closing: string;
  closingHint: string;
  distribution: string;
  grandTotal: string;
  grandHint: string;
  expenseHint: string;
  infoBadge: string;
  registersTitle: string;
  registerName: string;
  registerAmount: string;
  registersTotal: string;
  registersEmpty: string;
  registerListHint: string;
}

export function CashStatusFigures({
  openingCash,
  todayCash,
  reservationDeposit,
  closingCash,
  currency,
  paymentRows,
  registerLines,
  labels,
  onPaymentClick,
  onRegisterRowClick,
  aside,
}: {
  openingCash: number;
  todayCash: number;
  reservationDeposit: number;
  /**
   * Günlük kart tahsilatı. Kutu gizlidir.
   * Gizlemek kart tutarını nakde eklemez; hesap aynı kalır.
   */
  todayCard?: number;
  closingCash: number;
  currency: string;
  paymentRows: CashStatusPaymentLine[];
  /** Ödeme dağılımının altındaki kasa ızgarası. Boş dizi boş durumdur. */
  registerLines?: CashRegisterDistributionLine[];
  /**
   * Eski yeşil genel toplam. Çubuk gösterilmez.
   * Kapanış bu tutardan okunmaz; açılış + günlük nakit − gider aynı kalır.
   */
  grandTotal?: number;
  labels: CashStatusFigureLabels;
  onPaymentClick?: (code: string) => void;
  onRegisterRowClick?: (id: string) => void;
  /** Özet ekranında dağılımın yanında duran ek panel (kart türleri). */
  aside?: ReactNode;
}) {
  const money = (amount: number, deduction?: boolean) =>
    `${deduction && amount > 0.004 ? '− ' : ''}${formatNumber(amount, 2, false)} ${currency}`;

  const distributionRows = cashStatusDistributionListRows(paymentRows);
  const spotlightRows = distributionRows.filter((row) => CASH_STATUS_SPOTLIGHT_CODES.has(row.code));
  const listRows = distributionRows.filter((row) => !CASH_STATUS_SPOTLIGHT_CODES.has(row.code));

  const spotlightCard = (pt: CashStatusPaymentLine) => {
    const title = pt.label || pt.code;
    if (pt.code === 'GIDER' || pt.deduction) {
      return (
        <div
          key={pt.code}
          data-testid="cash-status-card-expense"
          className="bg-white rounded-lg border-2 border-rose-200 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-600">{title}</p>
              <p className="text-2xl text-rose-600 mt-1 font-bold">{money(pt.amount, true)}</p>
              <p className="text-xs text-rose-700 mt-1">{labels.expenseHint}</p>
            </div>
            <Receipt className="w-12 h-12 text-rose-600 opacity-20 shrink-0" />
          </div>
        </div>
      );
    }
    return (
      <div
        key={pt.code}
        data-testid="cash-status-card-reservation-info"
        className="bg-white rounded-lg border-2 border-sky-200 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
              <span>{title}</span>
              <span className="text-[10px] uppercase tracking-wide text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5">
                {labels.infoBadge}
              </span>
            </p>
            <p className="text-2xl text-sky-600 mt-1 font-bold">{money(pt.amount)}</p>
            <p className="text-xs text-slate-500 mt-1">{labels.reservationHint}</p>
          </div>
          <HandCoins className="w-12 h-12 text-sky-600 opacity-20 shrink-0" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="cash-status-kpi-row">
        <div className="bg-white rounded-lg border-2 border-blue-200 p-4" data-testid="cash-status-card-opening">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.opening}</p>
              <p className="text-2xl text-blue-600 mt-1 font-bold">{money(openingCash)}</p>
              {labels.openingHint ? (
                <p className="text-xs text-amber-700 mt-1 max-w-[14rem] leading-snug">{labels.openingHint}</p>
              ) : null}
            </div>
            <Banknote className="w-12 h-12 text-blue-600 opacity-20" />
          </div>
        </div>
        <div className="bg-white rounded-lg border-2 border-green-200 p-4" data-testid="cash-status-card-today-cash">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.todayCash}</p>
              <p className="text-2xl text-green-600 mt-1 font-bold">{money(todayCash)}</p>
              <p className="text-xs text-slate-500 mt-1">{labels.todayCashHint}</p>
            </div>
            <Banknote className="w-12 h-12 text-green-600 opacity-20" />
          </div>
        </div>
        <div className="bg-white rounded-lg border-2 border-cyan-200 p-4" data-testid="cash-status-card-reservation">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.reservation}</p>
              <p className="text-2xl text-cyan-600 mt-1 font-bold">{money(reservationDeposit)}</p>
              <p className="text-xs text-slate-500 mt-1">{labels.reservationHint}</p>
            </div>
            <HandCoins className="w-12 h-12 text-cyan-600 opacity-20" />
          </div>
        </div>
        <div className="bg-white rounded-lg border-2 border-orange-200 p-4" data-testid="cash-status-card-closing">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.closing}</p>
              <p className="text-2xl text-orange-600 mt-1 font-bold">{money(closingCash)}</p>
              <p className="text-xs text-slate-500 mt-1">{labels.closingHint}</p>
            </div>
            <Banknote className="w-12 h-12 text-orange-600 opacity-20" />
          </div>
        </div>
      </div>

      {spotlightRows.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="cash-status-spotlight-row">
          {spotlightRows.map(spotlightCard)}
        </div>
      ) : null}

      <div className={aside ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
      <div className="bg-white rounded-lg border p-4" data-testid="cash-status-distribution">
        <h3 className="text-lg mb-4">{labels.distribution}</h3>
        <div className="space-y-3">
          {listRows.map((pt) => {
            const body = (
              <>
                <span className="flex items-center gap-2 min-w-0">
                  <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: pt.color || '#94a3b8' }} />
                  <span className="min-w-0">
                    <span className="truncate block">{pt.label || pt.code}</span>
                    {pt.deduction ? (
                      <span className="block text-[11px] text-rose-700">{labels.expenseHint}</span>
                    ) : null}
                  </span>
                  {pt.informational ? (
                    <span className="text-[10px] uppercase tracking-wide text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5">
                      {labels.infoBadge}
                    </span>
                  ) : null}
                </span>
                <span className="font-semibold tabular-nums shrink-0" style={{ color: pt.color || '#334155' }}>
                  {money(pt.amount, pt.deduction)}
                </span>
              </>
            );
            if (pt.deduction) {
              return (
                <div
                  key={pt.code}
                  className="w-full flex items-center justify-between p-3 bg-rose-50 rounded-lg border border-dashed border-rose-200 text-left"
                >
                  {body}
                </div>
              );
            }
            if (pt.informational || !onPaymentClick) {
              return (
                <div
                  key={pt.code}
                  className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-left"
                >
                  {body}
                </div>
              );
            }
            return (
              <button
                key={pt.code}
                type="button"
                onClick={() => onPaymentClick(pt.code)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-slate-100 hover:border-slate-200 border border-transparent transition-colors text-left cursor-pointer"
              >
                {body}
              </button>
            );
          })}
          {registerLines ? (
            registerLines.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                {labels.registersEmpty}
              </div>
            ) : (
              <div className="space-y-2" data-testid="cash-status-registers">
                <h4 className="text-sm font-semibold text-slate-700">{labels.registersTitle}</h4>
                <ReportColumnTable
                  data={registerLines}
                  height={Math.min(420, 260 + registerLines.length * 36)}
                  storageNamespace="cash-status-register-distribution"
                  footerLabel={labels.registersTotal}
                  onRowClick={onRegisterRowClick ? (row) => onRegisterRowClick(row.id) : undefined}
                  columns={[
                    {
                      key: 'label',
                      header: labels.registerName,
                      size: 280,
                      cell: (row) => <span className="font-medium text-slate-800">{row.label}</span>,
                    },
                    {
                      key: 'amount',
                      header: labels.registerAmount,
                      type: 'number',
                      align: 'right',
                      size: 160,
                      footerSum: true,
                      footerFormat: (n) => `${formatNumber(n, 2, false)} ${currency}`,
                      cell: (row) => (
                        <span className="font-semibold tabular-nums">{money(row.amount)}</span>
                      ),
                    },
                  ]}
                />
              </div>
            )
          ) : null}
        </div>
      </div>
      {aside}
      </div>
    </div>
  );
}

export interface CashRegisterDrawerLabels {
  registerName: string;
  cash: string;
  card: string;
  openAccount: string;
  transfer: string;
  expense: string;
  reservation: string;
  balance: string;
  footer: string;
  hint: string;
  empty: string;
}

/**
 * Kasalar sekmesi — her kasanın içindeki nakit, kart ve diğer kırılım.
 * Kasa durumu KPI kartlarının kopyası değildir.
 */
export function CashRegisterDrawerGrid({
  rows,
  currency,
  labels,
}: {
  rows: CashRegisterDrawerLine[];
  currency: string;
  labels: CashRegisterDrawerLabels;
}) {
  const money = (amount: number) => `${formatNumber(amount, 2, false)} ${currency}`;
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-12 text-center text-slate-500">
        {labels.empty}
      </div>
    );
  }
  const amountCol = (
    key: keyof CashRegisterDrawerLine & string,
    header: string,
    footer: boolean,
  ) => ({
    key,
    header,
    type: 'number' as const,
    align: 'right' as const,
    size: 140,
    footerSum: footer,
    footerFormat: (n: number) => money(n),
    cell: (row: CashRegisterDrawerLine) => (
      <span className="tabular-nums">{money(Number(row[key]) || 0)}</span>
    ),
  });
  return (
    <div className="bg-white rounded-lg border p-2 space-y-2">
      <ReportColumnTable
        data={rows}
        height={Math.min(560, 280 + rows.length * 40)}
        storageNamespace="cash-status-register-drawers"
        footerLabel={labels.footer}
        columns={[
          {
            key: 'label',
            header: labels.registerName,
            size: 240,
            cell: (row) => <span className="font-medium text-slate-800">{row.label}</span>,
          },
          amountCol('cash', labels.cash, true),
          amountCol('card', labels.card, true),
          amountCol('openAccount', labels.openAccount, true),
          amountCol('transfer', labels.transfer, true),
          amountCol('expense', labels.expense, true),
          amountCol('reservation', labels.reservation, false),
          amountCol('balance', labels.balance, true),
        ]}
      />
      <p className="text-xs text-slate-500 px-2 pb-2">{labels.hint}</p>
    </div>
  );
}
