/**
 * Kasa Durumu kartları ve ödeme dağılımı.
 * Özet sekmesi ve her kasa satırı aynı görünümü kullanır.
 */
import type { ReactNode } from 'react';
import { Banknote, CreditCard, HandCoins } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import type { CashStatusPaymentLine } from '../../utils/cashStatusTotals';

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
  infoBadge: string;
}

export function CashStatusFigures({
  openingCash,
  todayCash,
  reservationDeposit,
  todayCard,
  closingCash,
  currency,
  paymentRows,
  grandTotal,
  labels,
  onPaymentClick,
  aside,
}: {
  openingCash: number;
  todayCash: number;
  reservationDeposit: number;
  todayCard: number;
  closingCash: number;
  currency: string;
  paymentRows: CashStatusPaymentLine[];
  grandTotal: number;
  labels: CashStatusFigureLabels;
  onPaymentClick?: (code: string) => void;
  /** Özet ekranında dağılımın yanında duran ek panel (kart türleri). */
  aside?: ReactNode;
}) {
  const money = (amount: number) => `${formatNumber(amount, 2, false)} ${currency}`;

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
                  <span className="truncate">{pt.label || pt.code}</span>
                  {pt.informational ? (
                    <span className="text-[10px] uppercase tracking-wide text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5">
                      {labels.infoBadge}
                    </span>
                  ) : null}
                </span>
                <span className="font-semibold tabular-nums shrink-0" style={{ color: pt.color || '#334155' }}>
                  {money(pt.amount)}
                </span>
              </>
            );
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
