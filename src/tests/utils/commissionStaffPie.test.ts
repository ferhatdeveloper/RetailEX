/**
 * Pasta dilimi kayıtlı toplam primdir. Peşinat ve sıfır prim dilim tutarını şişirmez.
 */
import { describe, expect, it } from 'vitest';
import { buildCommissionStaffPieSlices } from '../../utils/commissionStaffPie';

describe('uzman prim pastası', () => {
  it('ZAHRA 7.500 dilim olur, sıfır prim dilime girmez, toplam dilim 7.500', () => {
    const slices = buildCommissionStaffPieSlices([
      {
        specialist_id: 'id-zahra',
        name: 'ZAHRA',
        total_commission: 7_500,
      },
      {
        specialist_id: 'id-admin',
        name: 'System Administrator',
        total_commission: 0,
      },
    ]);

    expect(slices.find((slice) => slice.name === 'ZAHRA')).toMatchObject({
      specialist_id: 'id-zahra',
      amount: 7_500,
      inChart: true,
      sharePercent: 100,
    });
    expect(slices.find((slice) => slice.name === 'System Administrator')).toMatchObject({
      amount: 0,
      inChart: false,
      sharePercent: 0,
    });
    const painted = slices.filter((slice) => slice.inChart);
    expect(painted).toHaveLength(1);
    expect(painted.reduce((sum, slice) => sum + slice.amount, 0)).toBe(7_500);
    expect(painted.reduce((sum, slice) => sum + slice.sharePercent, 0)).toBe(100);
  });

  it('peşinat alanı yok sayılır; negatif prim dilim olmaz', () => {
    const slices = buildCommissionStaffPieSlices([
      {
        specialist_id: 'id-zahra',
        name: 'ZAHRA',
        total_commission: 7_500,
      },
      {
        specialist_id: 'id-neg',
        name: 'Eksi',
        total_commission: -100,
      },
    ]);
    expect(slices.map((slice) => slice.amount)).toEqual([7_500, -100]);
    expect(slices[0].inChart).toBe(true);
    expect(slices[1].inChart).toBe(false);
    expect(slices[1].sharePercent).toBe(0);
    expect(slices[0].amount).not.toBe(7_500 + 15_000);
  });
});
