import { formatNumber } from '../../../utils/formatNumber';

export function PartyLedgerDipFooter({
  count,
  debit,
  credit,
  balance,
  label,
  leadColSpan = 4,
}: {
  count: number;
  debit: number;
  credit: number;
  balance: number;
  label: string;
  leadColSpan?: number;
}) {
  const money = (n: number) => formatNumber(n, 2, true);
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
      </tr>
    </tfoot>
  );
}
