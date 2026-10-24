/**
 * Kasa Durumu özeti: tam üç kutu, altta tam genişlik kasalar tablosu
 * ve aynı alanda kasa hareketleri tablosu.
 * Toplam giren Günlük Rapor Toplam Ciro dolu mavisi, toplam çıkan Toplam Gider
 * dolu kırmızısı, bakiye Net (Nakit) dolu yeşilidir. Yazı ve ikon beyazdır.
 * Renk `dailyReportCardTone` üzerinden gelir; yeni hex yoktur.
 * Açılış, günlük nakit, kapanış, avans, gider kartı, ödeme dağılımı
 * ve kart türleri bu özette yoktur. Pasta grafik ve yöntem özeti yoktur.
 * Yarım sayfa şerit yoktur.
 */
import { ArrowDownLeft, ArrowUpRight, Wallet, type LucideIcon } from 'lucide-react';
import { formatReportDateCell } from '../../utils/dateLocale';
import { formatNumber } from '../../utils/formatNumber';
import {
  type CashRegisterDistributionLine,
  type CashRegisterDrawerLine,
  type CashStatusMovementCategory,
  type CashStatusMovementRow,
} from '../../utils/cashStatusTotals';
import {
  dailyReportCardTone,
  type DailyReportScreenCardKey,
} from '../../utils/dailyReportScreenCards';
import { ReportColumnTable } from './shared/ReportDataGrid';

/**
 * Izgara yüksekliği satır sayısına göre sıkı hesaplanır.
 *
 * DevExDataGrid yüksekliği TÜM grid'e uygulanır (toolbar + kolon başlığı +
 * gövde + dip toplam + sayfalama). Satırdan az yükseklik verilirse tablo
 * kırpılır; fazla yükseklik verilirse altta boşluk kalır (eski
 * `260 + n*36` formülü 2 satırlık tabloda ~230px boşluk bırakıyordu).
 *
 * Ölçülen sabit bileşenler: araç çubuğu 39px, kolon başlığı 23px,
 * dip toplam satırı 29px, sayfalama 59px → 150px.
 * Satır yüksekliği compact modda 22px.
 */
export function gridHeightForRows(rowCount: number, maxHeight: number): number {
  const rows = Math.max(1, Math.floor(rowCount));
  const chrome = 150;
  const rowHeight = 22;
  return Math.min(maxHeight, Math.max(180, chrome + rows * rowHeight));
}

/** Üç kutu, Günlük Rapor dolu kart anahtarlarına bağlıdır. */
type CashStatusSolidToneKey = Extract<
  DailyReportScreenCardKey,
  'total-revenue' | 'total-expense' | 'net-cash'
>;

function CashKpiCard({
  testId,
  toneKey,
  icon: Icon,
  title,
  amount,
  hint,
}: {
  testId: string;
  toneKey: CashStatusSolidToneKey;
  icon: LucideIcon;
  title: string;
  amount: string;
  hint?: string;
}) {
  const tone = dailyReportCardTone(toneKey);
  return (
    <div
      data-testid={testId}
      data-cash-tone={toneKey}
      className="flex h-full min-h-[9rem] flex-col rounded-xl border px-4 py-3.5"
      style={{
        backgroundColor: tone.background,
        borderColor: tone.border,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-5" style={{ color: tone.label }}>
          {title}
        </p>
        <Icon className="h-5 w-5 shrink-0" style={{ color: tone.accent }} aria-hidden />
      </div>
      <p
        className="mt-3 text-2xl font-semibold tabular-nums leading-none tracking-tight"
        style={{ color: tone.value }}
      >
        {amount}
      </p>
      {hint ? (
        <p className="mt-auto min-h-[2.25rem] pt-2 text-xs leading-snug" style={{ color: tone.hint }}>
          {hint}
        </p>
      ) : null}
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

export interface CashStatusMovementLabels {
  title: string;
  empty: string;
  total: string;
  date: string;
  flow: string;
  party: string;
  description: string;
  method: string;
  /** Kasa adı kolonu başlığı. */
  register: string;
  amount: string;
  flowIn: string;
  flowOut: string;
  methodCash: string;
  methodCard: string;
  methodTransfer: string;
  categories: Record<CashStatusMovementCategory, string>;
}

export function CashStatusFigures({
  totalIn,
  totalOut,
  balance,
  currency,
  registerLines,
  labels,
  onRegisterRowClick,
  movementRows,
  movementLabels,
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
  /** Kasalar ile aynı alanda. Aralık, üç kutunun aralığıdır. */
  movementRows?: CashStatusMovementRow[];
  movementLabels?: CashStatusMovementLabels;
}) {
  const money = (amount: number) => `${formatNumber(amount, 2, false)} ${currency}`;
  const signedMoney = (amount: number) => {
    const body = `${formatNumber(amount, 2, false)} ${currency}`;
    return amount > 0.004 ? `+${body}` : body;
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
          height={gridHeightForRows(registerLines.length, 420)}
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
      {movementRows && movementLabels ? (
        <div className="mt-6" data-testid="cash-status-movements">
          <h3 className="text-lg mb-4">{movementLabels.title}</h3>
          {movementRows.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              {movementLabels.empty}
            </div>
          ) : (
            <ReportColumnTable
              data={movementRows.map((row) => ({
                ...row,
                flowLabel: row.flow === 'gelir' ? movementLabels.flowIn : movementLabels.flowOut,
                partyLabel: row.party || movementLabels.categories[row.categoryCode] || row.typeCode,
                descriptionLabel: row.description || movementLabels.categories[row.categoryCode] || '—',
                registerLabel: row.registerName || row.registerId || '—',
                methodLabel: row.method === 'kart'
                  ? movementLabels.methodCard
                  : row.method === 'havale'
                    ? movementLabels.methodTransfer
                    : movementLabels.methodCash,
              }))}
              height={gridHeightForRows(movementRows.length, 560)}
              storageNamespace="cash-status-movements"
              footerLabel={movementLabels.total}
              columns={[
                {
                  key: 'date',
                  header: movementLabels.date,
                  type: 'date',
                  size: 120,
                  cell: (row) => (
                    <span className="tabular-nums text-slate-700">{formatReportDateCell(row.date)}</span>
                  ),
                },
                {
                  key: 'flowLabel',
                  header: movementLabels.flow,
                  size: 110,
                  cell: (row) => (
                    <span className={row.flow === 'gelir' ? 'font-medium text-green-700' : 'font-medium text-red-600'}>
                      {row.flowLabel}
                    </span>
                  ),
                },
                {
                  key: 'partyLabel',
                  header: movementLabels.party,
                  size: 200,
                  cell: (row) => <span className="text-slate-800">{row.partyLabel}</span>,
                },
                {
                  key: 'descriptionLabel',
                  header: movementLabels.description,
                  size: 260,
                  cell: (row) => <span className="text-slate-600">{row.descriptionLabel}</span>,
                },
                {
                  key: 'methodLabel',
                  header: movementLabels.method,
                  size: 140,
                  cell: (row) => <span className="text-slate-700">{row.methodLabel}</span>,
                },
                {
                  key: 'registerLabel',
                  header: movementLabels.register,
                  size: 180,
                  cell: (row) => (
                    <span className="text-slate-600">{row.registerLabel || '—'}</span>
                  ),
                },
                {
                  key: 'amount',
                  header: movementLabels.amount,
                  type: 'number',
                  align: 'right',
                  size: 150,
                  footerSum: true,
                  footerFormat: (n) => signedMoney(n),
                  cell: (row) => (
                    <span
                      className={`font-semibold tabular-nums ${row.amount < 0 ? 'text-red-600' : 'text-green-700'}`}
                    >
                      {signedMoney(row.amount)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="cash-status-kpi-row">
        <CashKpiCard
          testId="cash-status-card-in"
          toneKey="total-revenue"
          icon={ArrowDownLeft}
          title={labels.totalIn}
          amount={money(totalIn)}
          hint={labels.totalInHint}
        />
        <CashKpiCard
          testId="cash-status-card-out"
          toneKey="total-expense"
          icon={ArrowUpRight}
          title={labels.totalOut}
          amount={money(totalOut)}
          hint={labels.totalOutHint}
        />
        <CashKpiCard
          testId="cash-status-card-balance"
          toneKey="net-cash"
          icon={Wallet}
          title={labels.balance}
          amount={money(balance)}
          hint={labels.balanceHint}
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
