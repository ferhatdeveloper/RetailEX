/**
 * Kar-Zarar (finansal) menüsünde aylık/yıllık dönem özeti tekrarlanmaz.
 * Tek kopya genel grupta kalır.
 */
import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_REPORT_GROUP_KEY,
  omitRepeatedPeriodSummaryUnderFinance,
  omitUnlistedFinancialReports,
  PERIOD_SUMMARY_MENU_KEYS,
  UNLISTED_FINANCIAL_REPORT_KEYS,
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

describe('omitUnlistedFinancialReports', () => {
  it('eski müşteri / devam eden alacak kaydını çıkarır, kasa defteri ve fatura kalem detayı kalır', () => {
    const groups = [
      {
        key: FINANCIAL_REPORT_GROUP_KEY,
        children: [
          { key: 'profit-loss' },
          { key: 'cash-flow' },
          { key: 'debt-aging' },
          { key: 'cari-debtors' },
          { key: 'cari-creditors' },
          { key: 'party-customer-sales' },
          { key: 'party-supplier-purchases' },
          { key: 'product-sales-by-period' },
          { key: 'cari-extract' },
          { key: 'collection-due' },
          { key: 'cash-ledger' },
          { key: 'contact-account-legacy' },
          { key: 'invoice-items-detail' },
          { key: 'monthly-days-summary' },
          { key: 'yearly-months-summary' },
        ],
      },
    ];
    const next = omitUnlistedFinancialReports(groups);
    const keys = (next[0]?.children ?? []).map((child) => child.key);
    expect(keys).toEqual([
      'profit-loss',
      'cash-flow',
      'debt-aging',
      'cari-debtors',
      'cari-creditors',
      'party-customer-sales',
      'party-supplier-purchases',
      'product-sales-by-period',
      'cari-extract',
      'collection-due',
      'cash-ledger',
      'invoice-items-detail',
      'monthly-days-summary',
      'yearly-months-summary',
    ]);
    for (const removed of UNLISTED_FINANCIAL_REPORT_KEYS) {
      expect(keys).not.toContain(removed);
    }
  });

  it('finansal olmayan grubu değiştirmez', () => {
    const groups = [{ key: 'grp-sales', children: [{ key: 'contact-account-legacy' }] }];
    expect(omitUnlistedFinancialReports(groups)).toEqual(groups);
  });
});
