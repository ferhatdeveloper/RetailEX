/**
 * Kasa Durumu özeti: tam üç kutu ve altta tam genişlik kasalar tablosu.
 * Toplam giren mavi, toplam çıkan kırmızı, bakiye yeşildir.
 * Açılış, günlük nakit, kapanış, avans, gider kartı, ödeme dağılımı
 * ve kart türleri bu özette yoktur. Yarım sayfa şerit yoktur.
 */
import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import {
  type CashRegisterDistributionLine,
  type CashRegisterDrawerLine,
} from '../../utils/cashStatusTotals';
import { ReportColumnTable } from './shared/ReportDataGrid';

function CashKpiCard({
  testId,
  borderClass,
  amountClass,
  icon,
  title,
  amount,
  hint,
  hintClass = 'text-slate-500',
}: {
  testId: string;
  borderClass: string;
  amountClass: string;
  icon: ReactNode;
  title: string;
  amount: string;
  hint?: string;
  hintClass?: string;
}) {
  return (
    <div data-testid={testId} className={`bg-white rounded-lg border-2 ${borderClass} p-4 h-full`}>
      <div className="flex items-center justify-between gap-3 h-full">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">{title}</p>
          <p className={`text-2xl mt-1 font-bold tabular-nums ${amountClass}`}>{amount}</p>
          {hint ? <p className={`text-xs mt-1 leading-snug ${hintClass}`}>{hint}</p> : null}
        </div>
        {icon}
      </div>
    </div>
  );
}

export interface CashStatusFigureLabels {
  totalIn: string;
  totalInHint?: string;
  totalOut: string;
  totalOutHint?: string;
  balance: string;
  balanceHint?: string;
  registersTitle: string;
  registerName: string;
  registerAmount: string;
  registersTotal: string;
  registersEmpty: string;
}

export function CashStatusFigures({
  totalIn,
  totalOut,
  balance,
  currency,
  registerLines,
  labels,
  onRegisterRowClick,
}: {
  /** Seçili aralıkta kasaya giren. */
  totalIn: number;
  /** Seçili aralıkta kasadan çıkan. */
  totalOut: number;
  /** Aralık bugünde bitiyorsa güncel kasa; geçmişte aralık sonu bakiyesi. */
  balance: number;
  currency: string;
  /** Kasalar tablosu. Tutar, seçili aralığın son günündeki bakiyedir. */
  registerLines?: CashRegisterDistributionLine[];
  labels: CashStatusFigureLabels;
  onRegisterRowClick?: (id: string) => void;
}) {
  const money = (amount: number) => `${formatNumber(amount, 2, false)} ${currency}`;

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="cash-status-kpi-row">
        <CashKpiCard
          testId="cash-status-card-in"
          borderClass="border-blue-200"
          amountClass="text-blue-600"
          icon={<ArrowDownLeft className="w-12 h-12 text-blue-600 opacity-20 shrink-0" />}
          title={labels.totalIn}
          amount={money(totalIn)}
          hint={labels.totalInHint}
          hintClass="text-blue-700"
        />
        <CashKpiCard
          testId="cash-status-card-out"
          borderClass="border-rose-200"
          amountClass="text-rose-600"
          icon={<ArrowUpRight className="w-12 h-12 text-rose-600 opacity-20 shrink-0" />}
          title={labels.totalOut}
          amount={money(totalOut)}
          hint={labels.totalOutHint}
          hintClass="text-rose-700"
        />
        <CashKpiCard
          testId="cash-status-card-balance"
          borderClass="border-green-200"
          amountClass="text-green-600"
          icon={<Wallet className="w-12 h-12 text-green-600 opacity-20 shrink-0" />}
          title={labels.balance}
          amount={money(balance)}
          hint={labels.balanceHint}
          hintClass="text-green-700"
        />
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
