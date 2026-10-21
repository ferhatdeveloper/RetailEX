import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';

/** Seçili Grafana kartının yükseklik kademesi ve tam genişlik bayrağı. uid başına. */
export const CLINIC_V2_GRAFANA_SIZE_KEY = 'retailex_clinic_v2_grafana_size';

/** Yönetim panosu kart boyutu. Klinik boyutu ile karışmaz. */
export const BACKOFFICE_GRAFANA_SIZE_KEY = 'retailex_backoffice_grafana_size';

export const CLINIC_GRAFANA_HEIGHT_STEPS = [280, 420, 640] as const;

type HeightStep = (typeof CLINIC_GRAFANA_HEIGHT_STEPS)[number];

type SizeFile = {
    heights: Record<string, HeightStep>;
    /** Aynı anda tek kart tam genişlik. Boşsa ızgara eski haline döner. */
    wideUid: string;
};

const listeners = new Set<() => void>();

function emptyFile(): SizeFile {
    return { heights: {}, wideUid: '' };
}

function isHeightStep(value: number): value is HeightStep {
    return (CLINIC_GRAFANA_HEIGHT_STEPS as readonly number[]).includes(value);
}

function readSizeFile(storageKey: string): SizeFile {
    try {
        if (typeof localStorage === 'undefined') return emptyFile();
        const raw = localStorage.getItem(storageKey);
        if (!raw) return emptyFile();
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return emptyFile();
        const rec = parsed as { heights?: unknown; wideUid?: unknown };
        const heights: Record<string, HeightStep> = {};
        if (rec.heights && typeof rec.heights === 'object') {
            for (const [uid, value] of Object.entries(rec.heights as Record<string, unknown>)) {
                const key = uid.trim();
                const n = Number(value);
                if (key && isHeightStep(n)) heights[key] = n;
            }
        }
        return { heights, wideUid: String(rec.wideUid ?? '').trim() };
    } catch {
        return emptyFile();
    }
}

export function readClinicGrafanaSizeFile(): SizeFile {
    return readSizeFile(CLINIC_V2_GRAFANA_SIZE_KEY);
}

function sameSizeFile(a: SizeFile, b: SizeFile): boolean {
    if (a.wideUid !== b.wideUid) return false;
    const aKeys = Object.keys(a.heights);
    const bKeys = Object.keys(b.heights);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => a.heights[key] === b.heights[key]);
}

function writeSizeFile(storageKey: string, file: SizeFile): void {
    try {
        localStorage.setItem(storageKey, JSON.stringify(file));
    } catch {
        /* depolama kapalı */
    }
    for (const notify of listeners) notify();
}

function useClinicGrafanaSizeFile(storageKey: string): SizeFile {
    const [file, setFile] = useState<SizeFile>(() => readSizeFile(storageKey));
    useEffect(() => {
        const pull = () => {
            const next = readSizeFile(storageKey);
            setFile((prev) => (sameSizeFile(prev, next) ? prev : next));
        };
        listeners.add(pull);
        pull();
        return () => {
            listeners.delete(pull);
        };
    }, [storageKey]);
    return file;
}

function stepIndex(height: number): number {
    const index = CLINIC_GRAFANA_HEIGHT_STEPS.indexOf(height as HeightStep);
    return index < 0 ? 0 : index;
}

export function ClinicGrafanaCardFrame({
    uid,
    title,
    children,
    onRemove,
    storageKey = CLINIC_V2_GRAFANA_SIZE_KEY,
}: {
    uid: string;
    title: string;
    children: ReactNode;
    onRemove?: () => void;
    /** Yükseklik ve genişlik kaydı. Verilmezse klinik anahtarı kalır. */
    storageKey?: string;
}) {
    const { tm } = useLanguage();
    const file = useClinicGrafanaSizeFile(storageKey);
    const height = file.heights[uid] ?? CLINIC_GRAFANA_HEIGHT_STEPS[0];
    const wide = file.wideUid === uid;
    const index = stepIndex(height);

    const setHeight = (next: HeightStep) => {
        const current = readSizeFile(storageKey);
        current.heights[uid] = next;
        writeSizeFile(storageKey, current);
    };

    const toggleWide = () => {
        const current = readSizeFile(storageKey);
        current.wideUid = current.wideUid === uid ? '' : uid;
        writeSizeFile(storageKey, current);
    };

    return (
        <article
            data-testid="clinic-grafana-card"
            data-uid={uid}
            data-wide={wide ? 'true' : 'false'}
            data-height={String(height)}
            className="min-w-0 overflow-hidden bg-white"
            style={{
                borderRadius: 12,
                border: '1px solid #e6ebf2',
                gridColumn: wide ? '1 / -1' : undefined,
                order: wide ? -1 : 0,
            }}
        >
            <div className="flex flex-wrap items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: '#e6ebf2' }}>
                <h3 className="min-w-0 flex-1 truncate text-xs font-extrabold">{title}</h3>
                <button
                    type="button"
                    data-testid="clinic-grafana-shrink"
                    disabled={index <= 0}
                    onClick={() => setHeight(CLINIC_GRAFANA_HEIGHT_STEPS[index - 1])}
                    className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
                    style={{ borderColor: '#e6ebf2' }}
                >
                    {tm('bClinicV2GrafanaShrink')}
                </button>
                <button
                    type="button"
                    data-testid="clinic-grafana-grow"
                    disabled={index >= CLINIC_GRAFANA_HEIGHT_STEPS.length - 1}
                    onClick={() => setHeight(CLINIC_GRAFANA_HEIGHT_STEPS[index + 1])}
                    className="shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
                    style={{ borderColor: '#e6ebf2' }}
                >
                    {tm('bClinicV2GrafanaGrow')}
                </button>
                <button
                    type="button"
                    data-testid="clinic-grafana-wide"
                    aria-pressed={wide}
                    onClick={toggleWide}
                    className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white"
                    style={{ background: wide ? '#0f766e' : '#2563eb' }}
                >
                    {wide ? tm('bClinicV2GrafanaCollapse') : tm('bClinicV2GrafanaExpand')}
                </button>
                {onRemove ? (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="shrink-0 text-[11px] font-bold"
                        style={{ color: '#2563eb' }}
                    >
                        {tm('bClinicV2GrafanaRemove')}
                    </button>
                ) : null}
            </div>
            <div data-testid="clinic-grafana-frame-body" className="w-full" style={{ height }}>
                {children}
            </div>
        </article>
    );
}
