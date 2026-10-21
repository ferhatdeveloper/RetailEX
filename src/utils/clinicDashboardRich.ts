/**
 * Klinik V2 karşılama panosunun alt şeridi.
 * Sayılar gelen kayıtlardan sayılır; kayıt yoksa dilim 0 kalır.
 */
import {
    GRAFANA_READY_REPORTS,
    getGrafanaBaseUrl,
    type GrafanaReadyReport,
} from './grafanaEmbed';
import { grafanaAppReportsAsReady } from './grafanaAppReportsCatalog';

export type ClinicMonthPoint = {
    key: string;
    label: string;
    appointments: number;
    newCustomers: number;
};

export type ClinicQuickIcon =
    | 'calendar'
    | 'list'
    | 'users'
    | 'package'
    | 'pipette'
    | 'chart'
    | 'settings'
    | 'globe'
    | 'bell'
    | 'wallet'
    | 'book'
    | 'headset';

export type ClinicQuickLink = {
    id: string;
    labelKey: string;
    /** Klinik kabuğundaki mevcut sekme. */
    tab: string;
    destKey: string;
    /** Karşılığı yok; en yakın rapor veya ayar sekmesi. */
    proxy: boolean;
    color: string;
    icon: ClinicQuickIcon;
};

/** Seçilen Grafana pano uid listesi. */
export const CLINIC_V2_GRAFANA_PICKS_KEY = 'retailex_clinic_v2_grafana_picks';

export function clinicMonthKeys(anchorYmd: string): string[] {
    const [y, m] = anchorYmd.split('-').map((n) => Number(n));
    const year = Number.isFinite(y) ? y : 1970;
    const month = Number.isFinite(m) ? m : 1;
    const out: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
        const dt = new Date(year, month - 1 - i, 1);
        out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

/** Grafiğin kapsadığı takvim ayı. Bitiş günü dahil. */
export function clinicChartFetchBounds(anchorYmd: string): { start: string; end: string } {
    const keys = clinicMonthKeys(anchorYmd);
    const start = `${keys[0]}-01`;
    const [y, m] = keys[keys.length - 1].split('-').map((n) => Number(n));
    const last = new Date(y || 1970, m || 1, 0);
    const end = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    return { start, end };
}

function ymdMonth(raw: string | null | undefined): string {
    const text = String(raw ?? '').trim();
    const match = text.match(/^(\d{4}-\d{2})/);
    return match ? match[1] : '';
}

export function buildClinicMonthSeries(input: {
    anchorYmd: string;
    locale: string;
    appointments: ReadonlyArray<{ dateKey?: string | null }>;
    customers: ReadonlyArray<{ createdAt?: string | null }>;
}): ClinicMonthPoint[] {
    const locale = input.locale || 'tr-TR';
    const apptCounts = new Map<string, number>();
    for (const row of input.appointments) {
        const key = ymdMonth(row.dateKey);
        if (!key) continue;
        apptCounts.set(key, (apptCounts.get(key) ?? 0) + 1);
    }
    const customerCounts = new Map<string, number>();
    for (const row of input.customers) {
        const key = ymdMonth(row.createdAt);
        if (!key) continue;
        customerCounts.set(key, (customerCounts.get(key) ?? 0) + 1);
    }
    return clinicMonthKeys(input.anchorYmd).map((key) => {
        const [yy, mm] = key.split('-').map((n) => Number(n));
        const label = new Date(yy, (mm || 1) - 1, 1).toLocaleDateString(locale, { month: 'short' });
        return {
            key,
            label,
            appointments: apptCounts.get(key) ?? 0,
            newCustomers: customerCounts.get(key) ?? 0,
        };
    });
}

/**
 * Ekrandaki 4×3 sıra.
 * Laboratuvar, online randevu, bildirim, kredi, yardım ve destek için ayrı sekme yok.
 */
export const CLINIC_QUICK_LINKS: readonly ClinicQuickLink[] = [
    { id: 'calendar', labelKey: 'bClinicV2QaCalendar', tab: 'calendar', destKey: 'bShellNavCalendar', proxy: false, color: '#3b82f6', icon: 'calendar' },
    { id: 'appt-list', labelKey: 'bClinicV2QaApptList', tab: 'clinic_board', destKey: 'bClinicBoardNav', proxy: false, color: '#22c55e', icon: 'list' },
    { id: 'clients', labelKey: 'bClinicV2QaClients', tab: 'clients', destKey: 'bClinicV2OpenClients', proxy: false, color: '#8b5cf6', icon: 'users' },
    { id: 'stock', labelKey: 'bClinicV2QaStock', tab: 'product_sales', destKey: 'bShellNavProductSales', proxy: false, color: '#f59e0b', icon: 'package' },
    { id: 'lab', labelKey: 'bClinicV2QaLab', tab: 'reports', destKey: 'bShellNavReports', proxy: true, color: '#ec4899', icon: 'pipette' },
    { id: 'reports', labelKey: 'bClinicV2QaReports', tab: 'reports', destKey: 'bShellNavReports', proxy: false, color: '#64748b', icon: 'chart' },
    { id: 'branch', labelKey: 'bClinicV2QaBranch', tab: 'clinic_ops', destKey: 'bShellNavClinicOps', proxy: false, color: '#38bdf8', icon: 'settings' },
    { id: 'online', labelKey: 'bClinicV2QaOnline', tab: 'clinic_ops', destKey: 'bShellNavClinicOps', proxy: true, color: '#22c55e', icon: 'globe' },
    { id: 'notify', labelKey: 'bClinicV2QaNotify', tab: 'clinic_ops', destKey: 'bShellNavClinicOps', proxy: true, color: '#a855f7', icon: 'bell' },
    { id: 'credit', labelKey: 'bClinicV2QaCredit', tab: 'reports', destKey: 'bShellNavReports', proxy: true, color: '#f59e0b', icon: 'wallet' },
    { id: 'help', labelKey: 'bClinicV2QaHelp', tab: 'reports', destKey: 'bShellNavReports', proxy: true, color: '#ef4444', icon: 'book' },
    { id: 'support', labelKey: 'bClinicV2QaSupport', tab: 'clinic_ops', destKey: 'bShellNavClinicOps', proxy: true, color: '#334155', icon: 'headset' },
];

export function readClinicGrafanaPicks(): string[] {
    try {
        if (typeof localStorage === 'undefined') return [];
        const raw = localStorage.getItem(CLINIC_V2_GRAFANA_PICKS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        const out: string[] = [];
        for (const item of parsed) {
            const uid = String(item ?? '').trim();
            if (uid && !out.includes(uid)) out.push(uid);
        }
        return out;
    } catch {
        return [];
    }
}

export function writeClinicGrafanaPicks(uids: readonly string[]): void {
    const out: string[] = [];
    for (const item of uids) {
        const uid = String(item ?? '').trim();
        if (uid && !out.includes(uid)) out.push(uid);
    }
    try {
        localStorage.setItem(CLINIC_V2_GRAFANA_PICKS_KEY, JSON.stringify(out));
    } catch {
        /* depolama kapalı */
    }
}

/** Proje kataloğu. Güzellik panoları önde. Sorgu oluşturucu ayrı tutulur. */
export function clinicGrafanaCatalog(): GrafanaReadyReport[] {
    const pool = [...grafanaAppReportsAsReady(), ...GRAFANA_READY_REPORTS];
    const seen = new Set<string>();
    const beauty: GrafanaReadyReport[] = [];
    const rest: GrafanaReadyReport[] = [];
    for (const report of pool) {
        if (report.isBuilder) continue;
        const uid = String(report.uid || '').trim();
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        if (report.category === 'beauty') beauty.push(report);
        else rest.push(report);
    }
    return [...beauty, ...rest];
}

export function clinicGrafanaCards(
    uids: readonly string[],
    catalog: readonly GrafanaReadyReport[],
): GrafanaReadyReport[] {
    const byUid = new Map(catalog.map((report) => [report.uid, report]));
    const cards: GrafanaReadyReport[] = [];
    for (const uid of uids) {
        const report = byUid.get(uid);
        if (report) cards.push(report);
    }
    return cards;
}

/** Gömme adresi, rapor oluşturucudaki ile aynı: getGrafanaBaseUrl + embedPath. */
export function clinicGrafanaEmbedUrl(report: GrafanaReadyReport, theme: 'light' | 'dark' = 'light'): string {
    return `${getGrafanaBaseUrl()}${report.embedPath(theme)}`;
}
