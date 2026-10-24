import {
  Banknote,
  Calendar,
  Percent,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  DAILY_REPORT_SCREEN_CARD_TONES,
  dailyReportScreenShowsCard,
  type DailyReportScreenCardKey,
} from '../../utils/dailyReportScreenCards';

export type DailyReportKpiCardModel = {
  key: DailyReportScreenCardKey;
  label: string;
  value: string;
  hint?: string;
  testId?: string;
};

const CARD_ICONS: Record<DailyReportScreenCardKey, LucideIcon> = {
  'total-sales': ShoppingCart,
  'reservation-amount': Calendar,
  'total-revenue': Banknote,
  'total-discount': Percent,
  cash: Banknote,
  'sales-return': TrendingDown,
  'total-expense': Wallet,
  'net-gross': TrendingUp,
  'net-cash': Wallet,
};

/**
 * Günlük Rapor KPI ızgarası. Yalnızca ekran kart listesindeki anahtarlar çizilir.
 * Aynı yükseklik, eşit boşluk, koyu yazı, abartısız gölge.
 */
export function DailyReportKpiGrid({ cards }: { cards: readonly DailyReportKpiCardModel[] }) {
  const visible = cards.filter((card) => dailyReportScreenShowsCard(card.key));
  if (visible.length === 0) return null;

  return (
    <div
      className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 auto-rows-fr"
      data-testid="daily-report-kpi-grid"
    >
      {visible.map((card) => {
        const tone = DAILY_REPORT_SCREEN_CARD_TONES[card.key];
        const Icon = CARD_ICONS[card.key];
        return (
          <div
            key={card.key}
            data-testid={card.testId ?? `daily-report-card-${card.key}`}
            data-daily-card-key={card.key}
            className="flex h-full min-h-[9rem] flex-col rounded-xl border px-4 py-3.5"
            style={{
              backgroundColor: tone.background,
              borderColor: tone.border,
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-5 text-slate-700">{card.label}</p>
              <Icon className="h-5 w-5 shrink-0" style={{ color: tone.accent }} aria-hidden />
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums leading-none tracking-tight text-slate-900">
              {card.value}
            </p>
            <p className="mt-auto min-h-[2.25rem] whitespace-pre-line pt-2 text-xs leading-snug text-slate-600">
              {card.hint || '\u00a0'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
