/**
 * Günlük rapor — Gider Detayları satır tıklaması.
 * Gider pusulası ve maaş ödemesi satış faturası değildir.
 * Tıklama fiş detayını açar; fatura silme eylemi üretmez ve kasa satırını silmez.
 */

export interface DailyExpenseClickRow {
  ficheNo?: string | null;
  timeLabel?: string | null;
  typeLabel?: string | null;
  category?: string | null;
  description?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  baseAmount?: number | null;
  payLabel?: string | null;
}

export interface DailyExpenseDetailModel {
  ficheNo: string;
  timeLabel: string;
  typeLabel: string;
  category: string;
  description: string;
  amount: number;
  currencyCode: string;
  baseAmount: number | null;
  paymentLabel: string;
}

export type DailyExpenseRowClickResult =
  | { action: 'detail'; detail: DailyExpenseDetailModel }
  | { action: 'invoice-delete' };

function text(value: unknown, fallback = '—'): string {
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

/** Satır tıklamasının sonucu. Gider satırı her zaman detaydır. */
export function resolveDailyExpenseRowClick(row: DailyExpenseClickRow): DailyExpenseRowClickResult {
  const base = row.baseAmount;
  const baseAmount = base != null && Number.isFinite(Number(base)) ? Number(base) : null;
  return {
    action: 'detail',
    detail: {
      ficheNo: text(row.ficheNo),
      timeLabel: text(row.timeLabel),
      typeLabel: text(row.typeLabel),
      category: text(row.category),
      description: text(row.description, ''),
      amount: Number(row.amount) || 0,
      currencyCode: String(row.currencyCode ?? '').trim(),
      baseAmount,
      paymentLabel: text(row.payLabel),
    },
  };
}
