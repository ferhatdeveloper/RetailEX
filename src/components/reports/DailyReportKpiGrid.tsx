import {
  Banknote,
  Calendar,
  Percent,
  ShoppingCart,
  TrendingDown,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useClinicMenuPalette } from '../beauty/clinicMenuPalette';
import {
  dailyReportCardTone,
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
  'net-cash': Wallet,
};

/**
 * Günlük Rapor KPI ızgarası. Sekiz kart iki sırada durur.
 * Zemin, seçili klinik menü paletinin birbirinden ayrı açık tonudur.
 */
export function DailyReportKpiGrid({ cards }: { cards: readonly DailyReportKpiCardModel[] }) {
  const palette = useClinicMenuPalette();
  const visible = cards.filter((card) => dailyReportScreenShowsCard(card.key));
  if (visible.length === 0) return null;

  return (
    <div
      className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4 auto-rows-fr"
      data-testid="daily-report-kpi-grid"
    >
      {visible.map((card) => {
        const tone = dailyReportCardTone(palette, card.key);
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
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-5" style={{ color: tone.label }}>
                {card.label}
              </p>
              <Icon className="h-5 w-5 shrink-0" style={{ color: tone.accent }} aria-hidden />
            </div>
            <p
              className="mt-3 text-2xl font-semibold tabular-nums leading-none tracking-tight"
              style={{ color: tone.value }}
            >
              {card.value}
            </p>
            <p
              className="mt-auto min-h-[2.25rem] whitespace-pre-line pt-2 text-xs leading-snug"
              style={{ color: tone.hint }}
            >
              {card.hint || '\u00a0'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
