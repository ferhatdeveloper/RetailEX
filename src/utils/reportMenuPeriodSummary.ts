/**
 * Aylık gün özeti ve yıllık ay özeti tek yerde durur: genel rapor grubu.
 * Kar-Zarar'ın bulunduğu finansal grupta aynı anahtarlar tekrarlanmaz.
 */
export const PERIOD_SUMMARY_MENU_KEYS = [
  'monthly-days-summary',
  'yearly-months-summary',
] as const;

const PERIOD_SUMMARY_MENU_KEY_SET = new Set<string>(PERIOD_SUMMARY_MENU_KEYS);

export const FINANCIAL_REPORT_GROUP_KEY = 'grp-financial';

type ReportMenuGroup = {
  key?: string;
  children?: { key?: string }[];
};

/** Finansal menüden dönem özeti kopyalarını düşürür; genel grup ve Kar-Zarar kalır. */
export function omitRepeatedPeriodSummaryUnderFinance<T extends ReportMenuGroup>(groups: T[]): T[] {
  return groups.map((group) => {
    if (group.key !== FINANCIAL_REPORT_GROUP_KEY || !Array.isArray(group.children)) return group;
    return {
      ...group,
      children: group.children.filter((child) => !PERIOD_SUMMARY_MENU_KEY_SET.has(String(child?.key ?? ''))),
    } as T;
  });
}
