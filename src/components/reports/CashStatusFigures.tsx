/**
 * Kasa Durumu kartları ve ödeme dağılımı.
 * Üst ızgara dört sütundur ve ikinci satıra kırılır: açılış, günlük nakit,
 * alınan avans, kapanış, rezervasyon avansı, gider. Hepsi aynı karttır.
 * Günlük Kart kutusu gizlidir; kart tahsilatı bu yüzden nakde yazılmaz.
 * Rezervasyon avansı ile gider yarım sayfa şerit değildir.
 * İkisi bilgi ve düşüm kartıdır; nakde ve kapanışa ikinci kez girmez.
 * Nakit ve açık cari liste satırı olarak kalır. Kart türleri paneli yanlarında durur.
 * Kasa ızgarası bu panellerin altında, tam genişliktedir.
 * Genel toplam çubuğu ve alt açıklama yoktur.
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

/** Ödeme dağılımı listesinden çıkıp üst kart ızgarasına giren satırlar. */
const CASH_STATUS_KPI_EXTRA_CODES = new Set(['REZERVASYON_AVANS', 'GIDER']);

function CashKpiCard({
  testId,
  borderClass,
  amountClass,
  icon,
  title,
  amount,
  hint,
  hintClass = 'text-slate-500',
  badge,
}: {
  testId: string;
  borderClass: string;
  amountClass: string;
  icon: ReactNode;
  title: string;
  amount: string;
  hint?: string;
  hintClass?: string;
  badge?: ReactNode;
}) {
  return (
    <div data-testid={testId} className={`bg-white rounded-lg border-2 ${borderClass} p-4 h-full`}>
      <div className="flex items-center justify-between gap-3 h-full">
        <div className="min-w-0">
          <p className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
            <span>{title}</span>
            {badge}
          </p>
          <p className={`text-2xl mt-1 font-bold ${amountClass}`}>{amount}</p>
          {hint ? <p className={`text-xs mt-1 leading-snug ${hintClass}`}>{hint}</p> : null}
        </div>
        {icon}
      </div>
    </div>
  );
}

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
  /** Ödeme dağılımı ve kart türlerinin altındaki tam genişlik kasa ızgarası. Boş dizi boş durumdur. */
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
  const kpiExtraRows = distributionRows.filter((row) => CASH_STATUS_KPI_EXTRA_CODES.has(row.code));
  const listRows = distributionRows.filter((row) => !CASH_STATUS_KPI_EXTRA_CODES.has(row.code));

  const kpiExtraCard = (pt: CashStatusPaymentLine) => {
    const title = pt.label || pt.code;
    if (pt.code === 'GIDER' || pt.deduction) {
      return (
        <CashKpiCard
          key={pt.code}
          testId="cash-status-card-expense"
          borderClass="border-rose-200"
          amountClass="text-rose-600"
          icon={<Receipt className="w-12 h-12 text-rose-600 opacity-20 shrink-0" />}
          title={title}
          amount={money(pt.amount, true)}
          hint={labels.expenseHint}
          hintClass="text-rose-700"
        />
      );
    }
    return (
      <CashKpiCard
        key={pt.code}
        testId="cash-status-card-reservation-info"
        borderClass="border-sky-200"
        amountClass="text-sky-600"
        icon={<HandCoins className="w-12 h-12 text-sky-600 opacity-20 shrink-0" />}
        title={title}
        amount={money(pt.amount)}
        hint={labels.reservationHint}
        badge={(
          <span className="text-[10px] uppercase tracking-wide text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5">
            {labels.infoBadge}
          </span>
        )}
      />
    );
  };

  const registerPanel = registerLines ? (
    <div className="bg-white rounded-lg border p-4 w-full" data-testid="cash-status-registers">
      <h3 className="text-lg mb-4">{labels.registersTitle}</h3>
      {registerLines.length === 0 ? (
        <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
          {labels.registersEmpty}
        </div>
      ) : (
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
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="cash-status-kpi-row">
        <CashKpiCard
          testId="cash-status-card-opening"
          borderClass="border-blue-200"
          amountClass="text-blue-600"
          icon={<Banknote className="w-12 h-12 text-blue-600 opacity-20 shrink-0" />}
          title={labels.opening}
          amount={money(openingCash)}
          hint={labels.openingHint}
          hintClass="text-amber-700 max-w-[14rem]"
        />
        <CashKpiCard
          testId="cash-status-card-today-cash"
          borderClass="border-green-200"
          amountClass="text-green-600"
          icon={<Banknote className="w-12 h-12 text-green-600 opacity-20 shrink-0" />}
          title={labels.todayCash}
          amount={money(todayCash)}
          hint={labels.todayCashHint}
        />
        <CashKpiCard
          testId="cash-status-card-reservation"
          borderClass="border-cyan-200"
          amountClass="text-cyan-600"
          icon={<HandCoins className="w-12 h-12 text-cyan-600 opacity-20 shrink-0" />}
          title={labels.reservation}
          amount={money(reservationDeposit)}
          hint={labels.reservationHint}
        />
        <CashKpiCard
          testId="cash-status-card-closing"
          borderClass="border-orange-200"
          amountClass="text-orange-600"
          icon={<Banknote className="w-12 h-12 text-orange-600 opacity-20 shrink-0" />}
          title={labels.closing}
          amount={money(closingCash)}
          hint={labels.closingHint}
        />
        {kpiExtraRows.map(kpiExtraCard)}
      </div>

      <div
        className={aside ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}
        data-testid="cash-status-panels"
      >
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
          </div>
        </div>
        {aside}
      </div>
      {registerPanel}
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
