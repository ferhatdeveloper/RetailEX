/** Dönem özeti raporu — ortak paylaşım tercihleri (localStorage) */

export const DEFAULT_PARTNER_SHARE_MAJOR_PCT = 75;
export const DEFAULT_PARTNER_SHARE_MINOR_PCT = 25;

const STORAGE_KEY = 'retailex_period_summary_partner_split';

export type PeriodSummaryPartnerSplitPrefs = {
  enabled: boolean;
  majorPct: number;
  minorPct: number;
};

export const DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT: PeriodSummaryPartnerSplitPrefs = {
  enabled: true,
  majorPct: DEFAULT_PARTNER_SHARE_MAJOR_PCT,
  minorPct: DEFAULT_PARTNER_SHARE_MINOR_PCT,
};

function clampPct(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function normalizePartnerSplitPrefs(
  raw: Partial<PeriodSummaryPartnerSplitPrefs> | null | undefined,
): PeriodSummaryPartnerSplitPrefs {
  let major = clampPct(raw?.majorPct ?? DEFAULT_PARTNER_SHARE_MAJOR_PCT);
  let minor = clampPct(raw?.minorPct ?? DEFAULT_PARTNER_SHARE_MINOR_PCT);
  if (major + minor !== 100) {
    major = DEFAULT_PARTNER_SHARE_MAJOR_PCT;
    minor = DEFAULT_PARTNER_SHARE_MINOR_PCT;
  }
  return {
    enabled: raw?.enabled !== false,
    majorPct: major,
    minorPct: minor,
  };
}

export function loadPeriodSummaryPartnerSplitPrefs(): PeriodSummaryPartnerSplitPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT };
    return normalizePartnerSplitPrefs(JSON.parse(raw) as Partial<PeriodSummaryPartnerSplitPrefs>);
  } catch {
    return { ...DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT };
  }
}

export function savePeriodSummaryPartnerSplitPrefs(prefs: PeriodSummaryPartnerSplitPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePartnerSplitPrefs(prefs)));
  } catch {
    /* ignore quota */
  }
}

export function partnerShareAmounts(
  netRemaining: number,
  majorPct: number,
  minorPct: number,
): { major: number; minor: number } {
  const major = majorPct / 100;
  const minor = minorPct / 100;
  return {
    major: netRemaining * major,
    minor: netRemaining * minor,
  };
}
