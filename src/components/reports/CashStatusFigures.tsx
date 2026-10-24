/**
 * Kasa Durumu kartları ve ödeme dağılımı.
 * Ödeme tipi satırları bu blokta kalır. Hemen altında kasa kartları
 * (kod — ad, içindeki bakiye) ızgarada listelenir.
 */
import type { ReactNode } from 'react';
import { Banknote, CreditCard, HandCoins } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import type {
  CashRegisterDistributionLine,
  CashRegisterDrawerLine,
  CashStatusPaymentLine,
} from '../../utils/cashStatusTotals';
import { ReportColumnTable } from './shared/ReportDataGrid';

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
  todayCard,
  closingCash,
  currency,
  paymentRows,
  registerLines,
  grandTotal,
  labels,
  onPaymentClick,
  onRegisterRowClick,
  aside,
}: {
  openingCash: number;
  todayCash: number;
  reservationDeposit: number;
  todayCard: number;
  closingCash: number;
  currency: string;
  paymentRows: CashStatusPaymentLine[];
  /** Ödeme tipi satırlarının hemen altındaki kasa listesi. Boş dizi boş durumdur. */
  registerLines?: CashRegisterDistributionLine[];
  grandTotal: number;
  labels: CashStatusFigureLabels;
  onPaymentClick?: (code: string) => void;
  onRegisterRowClick?: (id: string) => void;
  /** Özet ekranında dağılımın yanında duran ek panel (kart türleri). */
  aside?: ReactNode;
}) {
  const money = (amount: number, deduction?: boolean) =>
    `${deduction && amount > 0.004 ? '− ' : ''}${formatNumber(amount, 2, false)} ${currency}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
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
        <div className="bg-white rounded-lg border-2 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.todayCash}</p>
              <p className="text-2xl text-green-600 mt-1 font-bold">{money(todayCash)}</p>
              <p className="text-xs text-slate-500 mt-1">{labels.todayCashHint}</p>
            </div>
            <Banknote className="w-12 h-12 text-green-600 opacity-20" />
          </div>
        </div>
        <div className="bg-white rounded-lg border-2 border-cyan-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.reservation}</p>
              <p className="text-2xl text-cyan-600 mt-1 font-bold">{money(reservationDeposit)}</p>
              <p className="text-xs text-slate-500 mt-1">{labels.reservationHint}</p>
            </div>
            <HandCoins className="w-12 h-12 text-cyan-600 opacity-20" />
          </div>
        </div>
        <div className="bg-white rounded-lg border-2 border-purple-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">{labels.todayCard}</p>
              <p className="text-2xl text-purple-600 mt-1 font-bold">{money(todayCard)}</p>
            </div>
            <CreditCard className="w-12 h-12 text-purple-600 opacity-20" />
          </div>
        </div>
        <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
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

      <div className={aside ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-lg mb-4">{labels.distribution}</h3>
        <div className="space-y-3">
          {paymentRows.map((pt) => {
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
              <div className="space-y-2">
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
                <p className="text-xs text-slate-500 px-1">{labels.registerListHint}</p>
              </div>
            )
          ) : null}
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-2 border-green-200">
            <span className="font-semibold">{labels.grandTotal}</span>
            <span className="font-bold text-green-700 text-lg tabular-nums">{money(grandTotal)}</span>
          </div>
          <p className="text-xs text-slate-500 px-1">{labels.grandHint}</p>
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
