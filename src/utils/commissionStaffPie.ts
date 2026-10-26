/**
 * Prim raporu halkası. Dilim, uzmanın kayıtlı toplam primidir.
 * Peşinat, indirim ve ciro prime eklenmez. Sıfır ve negatif tutar dilim olmaz.
 */
import { integerSharePercents } from './sharePercent';

const CHART_EPS = 0.004;

export const COMMISSION_PIE_COLORS = [
  '#15803d',
  '#7c3aed',
  '#ea580c',
  '#0f766e',
  '#1d4ed8',
  '#be123c',
  '#a16207',
  '#0369a1',
  '#4338ca',
  '#b45309',
] as const;

export type CommissionPieSource = {
  specialist_id: string;
  name: string;
  total_commission: number;
};

export type CommissionPieSlice = {
  specialist_id: string;
  name: string;
  amount: number;
  /** Sıfır ve negatif prim pastada yer kaplamaz. Lejantta kalabilir. */
  inChart: boolean;
  sharePercent: number;
};

export function commissionPieColor(index: number): string {
  const palette = COMMISSION_PIE_COLORS;
  const safe = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  return palette[safe % palette.length];
}

/** Uzman satırındaki total_commission olduğu gibi dilim tutarıdır. */
export function buildCommissionStaffPieSlices(
  rows: readonly CommissionPieSource[],
): CommissionPieSlice[] {
  const drafts: CommissionPieSlice[] = [];
  for (const row of rows) {
    const specialistId = String(row.specialist_id ?? '').trim();
    if (!specialistId) continue;
    const amount = Number(row.total_commission);
    const safe = Number.isFinite(amount) ? amount : 0;
    drafts.push({
      specialist_id: specialistId,
      name: String(row.name ?? '').trim() || '—',
      amount: safe,
      inChart: safe > CHART_EPS,
      sharePercent: 0,
    });
  }
  const percents = integerSharePercents(
    drafts.map((slice) => (slice.inChart ? slice.amount : 0)),
  );
  return drafts.map((slice, index) => ({
    ...slice,
    sharePercent: slice.inChart ? percents[index] : 0,
  }));
}
