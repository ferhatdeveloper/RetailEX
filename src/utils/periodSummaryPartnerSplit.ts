/** Dönem özeti raporu — ortak paylaşım tercihleri (localStorage) */

export const DEFAULT_PARTNER_SHARE_MAJOR_PCT = 75;
export const DEFAULT_PARTNER_SHARE_MINOR_PCT = 25;

const STORAGE_KEY = 'retailex_period_summary_partner_split_v2';

export type PeriodSummaryPartnerSplitPrefs = {
  enabled: boolean;
  majorPct: number;
  minorPct: number;
};

/** Güzellik/klinik dışı varsayılan: ortak payı gizli */
export const DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT: PeriodSummaryPartnerSplitPrefs = {
  enabled: false,
  majorPct: DEFAULT_PARTNER_SHARE_MAJOR_PCT,
  minorPct: DEFAULT_PARTNER_SHARE_MINOR_PCT,
};

/** Güzellik / klinik kiracılarında varsayılan açık */
export const DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT_BEAUTY: PeriodSummaryPartnerSplitPrefs = {
  enabled: true,
  majorPct: DEFAULT_PARTNER_SHARE_MAJOR_PCT,
  minorPct: DEFAULT_PARTNER_SHARE_MINOR_PCT,
};

function clampPct(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/** system_type / tenant_module / enabled modules — güzellik/klinik mi? */
export function isBeautyOrClinicContext(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const rawCfg = localStorage.getItem('retailex_web_config');
    if (rawCfg) {
      const cfg = JSON.parse(rawCfg) as { system_type?: string; tenant_module?: string };
      const st = String(cfg.system_type || '').toLowerCase();
      const tm = String(cfg.tenant_module || '').toLowerCase();
      if (st === 'beauty' || st === 'clinic' || tm === 'clinic' || tm === 'beauty') return true;
    }
    const enabled = JSON.parse(localStorage.getItem('retailex_enabled_modules') || '[]');
    if (Array.isArray(enabled) && enabled.includes('beauty') && enabled.length <= 3) {
      // Yalnızca beauty (+ management) kabuğu açıksa güzellik bağlamı
      const shells = enabled.filter((m: string) => m !== 'management');
      if (shells.length === 1 && shells[0] === 'beauty') return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function defaultPartnerSplitPrefsForContext(
  beautyContext = isBeautyOrClinicContext(),
): PeriodSummaryPartnerSplitPrefs {
  return beautyContext
    ? { ...DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT_BEAUTY }
    : { ...DEFAULT_PERIOD_SUMMARY_PARTNER_SPLIT };
}

export function normalizePartnerSplitPrefs(
  raw: Partial<PeriodSummaryPartnerSplitPrefs> | null | undefined,
  opts?: { defaultEnabled?: boolean },
): PeriodSummaryPartnerSplitPrefs {
  let major = clampPct(raw?.majorPct ?? DEFAULT_PARTNER_SHARE_MAJOR_PCT);
  let minor = clampPct(raw?.minorPct ?? DEFAULT_PARTNER_SHARE_MINOR_PCT);
  if (major + minor !== 100) {
    major = DEFAULT_PARTNER_SHARE_MAJOR_PCT;
    minor = DEFAULT_PARTNER_SHARE_MINOR_PCT;
  }
  const fallbackEnabled = opts?.defaultEnabled ?? false;
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallbackEnabled,
    majorPct: major,
    minorPct: minor,
  };
}

export function loadPeriodSummaryPartnerSplitPrefs(): PeriodSummaryPartnerSplitPrefs {
  const beauty = isBeautyOrClinicContext();
  const defaults = defaultPartnerSplitPrefsForContext(beauty);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return normalizePartnerSplitPrefs(JSON.parse(raw) as Partial<PeriodSummaryPartnerSplitPrefs>, {
      defaultEnabled: defaults.enabled,
    });
  } catch {
    return defaults;
  }
}

export function savePeriodSummaryPartnerSplitPrefs(prefs: PeriodSummaryPartnerSplitPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        normalizePartnerSplitPrefs(prefs, {
          defaultEnabled: isBeautyOrClinicContext(),
        }),
      ),
    );
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

export type PeriodPartnerShareSlice = {
  id: string;
  name: string;
  sharePct: number;
};

export type PeriodPartnerShareAmount = PeriodPartnerShareSlice & { amount: number };

/**
 * Net kalanı aktif ortak paylarına böler.
 * Son ortağa yuvarlama farkı verilir (kâr dağıtım motoru ile aynı).
 */
export function splitAmountByPartners(
  amount: number,
  partners: PeriodPartnerShareSlice[],
): PeriodPartnerShareAmount[] {
  if (!partners.length) return [];
  const totalPct = partners.reduce((s, p) => s + (Number(p.sharePct) || 0), 0);
  if (!(totalPct > 0) || !Number.isFinite(amount)) {
    return partners.map((p) => ({ ...p, amount: 0 }));
  }
  const working = partners
    .slice()
    .sort((a, b) => (b.sharePct || 0) - (a.sharePct || 0) || a.name.localeCompare(b.name, 'tr'));
  let allocated = 0;
  return working.map((p, i) => {
    let share: number;
    if (i === working.length - 1) {
      share = amount - allocated;
    } else {
      share = Math.round(((amount * (p.sharePct || 0)) / totalPct) * 100) / 100;
      allocated += share;
    }
    return { ...p, amount: share };
  });
}
