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

/** Finansal menüden çıkarılan rapor. Bileşen dosyası durur; listeye geri konmaz. */
export const UNLISTED_FINANCIAL_REPORT_KEYS = ['contact-account-legacy'] as const;

const UNLISTED_FINANCIAL_REPORT_KEY_SET = new Set<string>(UNLISTED_FINANCIAL_REPORT_KEYS);

export const PAYMENT_REPORT_GROUP_KEY = 'grp-payment';

/** Ödeme grubundan çıkarılan rapor. Menüde ve yönlendirmede kalmaz. */
export const UNLISTED_PAYMENT_REPORT_KEYS = ['payment-distribution'] as const;

const UNLISTED_PAYMENT_REPORT_KEY_SET = new Set<string>(UNLISTED_PAYMENT_REPORT_KEYS);

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

/** Finansal menüden kaldırılmış rapor anahtarlarını düşürür. Komşu raporlar kalır. */
export function omitUnlistedFinancialReports<T extends ReportMenuGroup>(groups: T[]): T[] {
  return groups.map((group) => {
    if (group.key !== FINANCIAL_REPORT_GROUP_KEY || !Array.isArray(group.children)) return group;
    return {
      ...group,
      children: group.children.filter(
        (child) => !UNLISTED_FINANCIAL_REPORT_KEY_SET.has(String(child?.key ?? '')),
      ),
    } as T;
  });
}

/** Ödeme grubundan kaldırılmış rapor anahtarlarını düşürür. Kasa Durumu ve Kasalar kalır. */
export function omitUnlistedPaymentReports<T extends ReportMenuGroup>(groups: T[]): T[] {
  return groups.map((group) => {
    if (group.key !== PAYMENT_REPORT_GROUP_KEY || !Array.isArray(group.children)) return group;
    return {
      ...group,
      children: group.children.filter(
        (child) => !UNLISTED_PAYMENT_REPORT_KEY_SET.has(String(child?.key ?? '')),
      ),
    } as T;
  });
}
