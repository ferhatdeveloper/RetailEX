/**
 * Kar-Zarar (finansal) menüsünde aylık/yıllık dönem özeti tekrarlanmaz.
 * Tek kopya genel grupta kalır.
 */
import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_REPORT_GROUP_KEY,
  omitRepeatedPeriodSummaryUnderFinance,
  PERIOD_SUMMARY_MENU_KEYS,
} from '../../utils/reportMenuPeriodSummary';

describe('omitRepeatedPeriodSummaryUnderFinance', () => {
  const groups = [
    {
      key: 'grp-general',
      children: [
        { key: 'daily' },
        { key: 'monthly-days-summary' },
        { key: 'yearly-months-summary' },
      ],
    },
    {
      key: FINANCIAL_REPORT_GROUP_KEY,
      children: [
        { key: 'profit-loss' },
        { key: 'monthly-days-summary' },
        { key: 'yearly-months-summary' },
        { key: 'cash-flow' },
      ],
    },
    {
      key: 'grp-sales',
      children: [{ key: 'cashiers' }],
    },
  ];

  it('finansal gruptan aylık ve yıllık özeti çıkarır, Kar-Zarar kalır', () => {
    const next = omitRepeatedPeriodSummaryUnderFinance(groups);
    const financial = next.find((group) => group.key === FINANCIAL_REPORT_GROUP_KEY);
    const keys = (financial?.children ?? []).map((child) => child.key);
    expect(keys).toEqual(['profit-loss', 'cash-flow']);
    for (const periodKey of PERIOD_SUMMARY_MENU_KEYS) {
      expect(keys).not.toContain(periodKey);
    }
  });

  it('genel gruptaki tek dönem özetini olduğu gibi bırakır', () => {
    const next = omitRepeatedPeriodSummaryUnderFinance(groups);
    const general = next.find((group) => group.key === 'grp-general');
    expect((general?.children ?? []).map((child) => child.key)).toEqual([
      'daily',
      'monthly-days-summary',
      'yearly-months-summary',
    ]);
  });

  it('çocuğu olmayan grubu değiştirmez', () => {
    const bare = [{ key: FINANCIAL_REPORT_GROUP_KEY, label: 'Finans' }];
    expect(omitRepeatedPeriodSummaryUnderFinance(bare)).toEqual(bare);
  });
});
