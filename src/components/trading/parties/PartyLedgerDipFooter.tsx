import { formatNumber } from '../../../utils/formatNumber';
import { sumBaseEquivalents, sumOriginalByCurrency } from '../../../utils/cashFxPosting';

export function formatFxOriginal(amount?: number | null, currency?: string | null): string {
  if (amount == null || !(Number(amount) > 0)) return '';
  const text = formatNumber(Number(amount), 2, true);
  const code = String(currency || '').trim();
  return code ? `${text} ${code}` : text;
}

export function formatFxBase(amount?: number | null): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '';
  return formatNumber(Number(amount), 2, true);
}

/** Para birimleri ayrı toplanır. Ana para yalnız dolu karşılıkların toplamıdır. */
export function fxTotalsLabel(
  rows: Array<{ original_amount?: number | null; original_currency?: string | null; base_amount?: number | null }>,
  baseCurrency: string,
  baseLabel: string,
): string {
  const byCurrency = sumOriginalByCurrency(
    rows.map((row) => ({ amount: row.original_amount, currency: row.original_currency })),
  );
  if (byCurrency.length === 0) return '';
  const parts = byCurrency.map((row) => `${formatNumber(row.total, 2, true)} ${row.currency}`);
  const base = sumBaseEquivalents(rows.map((row) => ({ baseAmount: row.base_amount })));
  if (base != null && baseCurrency) {
    parts.push(`${baseLabel} ${formatNumber(base, 2, true)} ${baseCurrency}`);
  }
  return parts.join(' · ');
}

export function PartyLedgerDipFooter({
  count,
  debit,
  credit,
  balance,
  label,
  leadColSpan = 4,
  trailColSpan = 0,
  fxLine,
}: {
  count: number;
  debit: number;
  credit: number;
  balance: number;
  label: string;
  leadColSpan?: number;
  /** Sil gibi ekstra sağ kolonlar */
  trailColSpan?: number;
  /** Orijinal para birimi toplamları ve ana para karşılığı. Karışık tek sayı yok. */
  fxLine?: string;
}) {
  const money = (n: number) => formatNumber(n, 2, true);
  const span = leadColSpan + 3 + (trailColSpan > 0 ? trailColSpan : 0);
  return (
    <tfoot className="sticky bottom-0 z-[2] border-t-2 border-blue-300 bg-blue-50">
      <tr>
        <td
          colSpan={leadColSpan}
          className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-blue-800"
        >
          {label}
          <span className="ml-1 font-semibold text-blue-600/80">({count})</span>
        </td>
        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-blue-900">{money(debit)}</td>
        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-blue-900">{money(credit)}</td>
        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-blue-900">{money(balance)}</td>
        {trailColSpan > 0 ? <td colSpan={trailColSpan} /> : null}
      </tr>
      {fxLine ? (
        <tr>
          <td colSpan={span} className="px-3 py-1.5 text-xs font-semibold text-blue-900">
            {fxLine}
          </td>
        </tr>
      ) : null}
    </tfoot>
  );
}
