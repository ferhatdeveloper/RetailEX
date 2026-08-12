import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyAppointmentClinicalData, ToothClinicalState } from '../../../types/beauty';

/** FDI yetişkin */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
const LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31] as const;
const LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48] as const;

/** FDI süt (deciduous) */
const D_UPPER_RIGHT = [55, 54, 53, 52, 51] as const;
const D_UPPER_LEFT = [61, 62, 63, 64, 65] as const;
const D_LOWER_LEFT = [85, 84, 83, 82, 81] as const;
const D_LOWER_RIGHT = [71, 72, 73, 74, 75] as const;

const ALL_PERM = new Set<number>([...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT]);
const ALL_DEC = new Set<number>([...D_UPPER_RIGHT, ...D_UPPER_LEFT, ...D_LOWER_LEFT, ...D_LOWER_RIGHT]);

type ToothState = ToothClinicalState;

const STATE_STYLES: Record<ToothState, { bg: string; border: string }> = {
    ok: { bg: '#f8fafc', border: '#e2e8f0' },
    watch: { bg: '#fef9c3', border: '#eab308' },
    treat: { bg: '#fee2e2', border: '#ef4444' },
};

export type DentalChartScreenProps = {
    compact?: boolean;
    /** Sunucu dışı taslak (yalnızca `onPersistDental` yoksa kullanılır) */
    storageScopeId?: string;
    showHeader?: boolean;
    /** Sunucudan `clinical_data.dental` */
    initialDental?: BeautyAppointmentClinicalData['dental'];
    /** Kalıcı kayıt — randevu `clinical_data` güncellenir */
    onPersistDental?: (dental: NonNullable<BeautyAppointmentClinicalData['dental']>) => void | Promise<void>;
};

function loadMarksLocal(key: string): Record<number, ToothState> {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const o = JSON.parse(raw) as Record<string, string>;
        const out: Record<number, ToothState> = {};
        for (const [k, v] of Object.entries(o)) {
            const n = parseInt(k, 10);
            if (!Number.isFinite(n)) continue;
            if (v === 'ok' || v === 'watch' || v === 'treat') out[n] = v;
        }
        return out;
    } catch {
        return {};
    }
}

function saveMarksLocal(key: string, marks: Record<number, ToothState>) {
    try {
        const o: Record<string, string> = {};
        for (const [k, v] of Object.entries(marks)) {
            if (v && v !== 'ok') o[k] = v;
        }
        localStorage.setItem(key, JSON.stringify(o));
    } catch {
        /* ignore */
    }
}

function dentalFromServer(d?: BeautyAppointmentClinicalData['dental']): Record<number, ToothState> {
    const out: Record<number, ToothState> = {};
    const merge = (rec?: Record<string, ToothState>) => {
        if (!rec) return;
        for (const [k, v] of Object.entries(rec)) {
            const n = parseInt(k, 10);
            if (!Number.isFinite(n)) continue;
            if (v === 'ok' || v === 'watch' || v === 'treat') out[n] = v;
        }
    };
    merge(d?.permanent as Record<string, ToothState> | undefined);
    merge(d?.deciduous as Record<string, ToothState> | undefined);
    return out;
}

function splitDentalForServer(marks: Record<number, ToothState>): NonNullable<BeautyAppointmentClinicalData['dental']> {
    const permanent: Record<string, ToothState> = {};
    const deciduous: Record<string, ToothState> = {};
    for (const [ks, st] of Object.entries(marks)) {
        if (!st || st === 'ok') continue;
        const n = Number(ks);
        if (!Number.isFinite(n)) continue;
        if (ALL_PERM.has(n)) permanent[String(n)] = st;
        else if (ALL_DEC.has(n)) deciduous[String(n)] = st;
    }
    return { permanent, deciduous };
}

export function DentalChartScreen(props: DentalChartScreenProps = {}) {
    const { compact, storageScopeId, showHeader = true, initialDental, onPersistDental } = props;
    const { tm } = useLanguage();
    const [arch, setArch] = useState<'permanent' | 'deciduous'>('permanent');
    const [marks, setMarks] = useState<Record<number, ToothState>>({});
    const [dirty, setDirty] = useState(false);
    const serverSeed = JSON.stringify(initialDental ?? {});

    const useServer = !!onPersistDental;
    const storageKey =
        !useServer && storageScopeId ? `retailex_dental_teeth_${storageScopeId}_${arch}` : null;

    /** Sunucu / props ile senkron (kullanıcı düzenlemiyorken) */
    useEffect(() => {
        if (useServer) {
            setMarks(dentalFromServer(initialDental));
            setDirty(false);
            return;
        }
        if (!storageKey) {
            setMarks({});
            return;
        }
        setMarks(loadMarksLocal(storageKey));
    }, [useServer, serverSeed, storageKey, initialDental]);

    useEffect(() => {
        if (storageKey && !useServer) {
            const t = window.setTimeout(() => saveMarksLocal(storageKey, marks), 200);
            return () => window.clearTimeout(t);
        }
    }, [marks, storageKey, useServer]);

    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!useServer || !onPersistDental || !dirty) return;
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(() => {
            persistTimer.current = null;
            void Promise.resolve(onPersistDental(splitDentalForServer(marks))).finally(() => setDirty(false));
        }, 550);
        return () => {
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, [marks, dirty, onPersistDental, useServer]);

    const cycle = useCallback((n: number) => {
        if (useServer) setDirty(true);
        setMarks(prev => {
            const cur: ToothState = prev[n] || 'ok';
            const next: ToothState = cur === 'ok' ? 'watch' : cur === 'watch' ? 'treat' : 'ok';
            return { ...prev, [n]: next };
        });
    }, [useServer]);

    const btnClass = compact ? 'w-7 h-9 rounded text-[10px]' : 'w-9 h-11 rounded-md text-[11px]';

    function Row({ label, teeth }: { label: string; teeth: readonly number[] }) {
        return (
            <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                    {teeth.map(n => {
                        const st = marks[n] || 'ok';
                        const s = STATE_STYLES[st];
                        return (
                            <button
                                key={n}
                                type="button"
                                title={String(n)}
                                onClick={() => cycle(n)}
                                className={`${btnClass} font-bold transition-shadow shrink-0 border-2`}
                                style={{
                                    background: s.bg,
                                    borderColor: s.border,
                                    color: '#334155',
                                }}
                            >
                                {n}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    const upper =
        arch === 'permanent' ? [...UPPER_RIGHT, ...UPPER_LEFT] : [...D_UPPER_RIGHT, ...D_UPPER_LEFT];
    const lower =
        arch === 'permanent' ? [...LOWER_LEFT, ...LOWER_RIGHT] : [...D_LOWER_LEFT, ...D_LOWER_RIGHT];

    const wrap = compact ? 'p-2 space-y-2' : 'p-4 md:p-6 max-w-4xl mx-auto space-y-4';
    const box = compact ? 'p-2 space-y-3' : 'p-4 shadow-sm space-y-6';

    return (
        <div className={wrap} style={{ background: compact ? 'transparent' : '#f7f6fb', minHeight: compact ? undefined : '100%' }}>
            {showHeader ? (
                <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">{tm('bDentalChartTitle')}</h2>
                    <p className="text-sm text-slate-600 mt-1">{tm('bDentalChartHint')}</p>
                </div>
            ) : (
                <p className="text-[11px] text-slate-500 leading-snug">{tm('bDentalChartHintEmbed')}</p>
            )}

            <div className="flex gap-1.5 flex-wrap">
                <button
                    type="button"
                    onClick={() => setArch('permanent')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        arch === 'permanent' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                >
                    {tm('bDentalArchPermanent')}
                </button>
                <button
                    type="button"
                    onClick={() => setArch('deciduous')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        arch === 'deciduous' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                >
                    {tm('bDentalArchDeciduous')}
                </button>
            </div>

            <div className={`rounded-2xl border border-slate-200 bg-white ${box}`}>
                <Row label={tm('bDentalUpper')} teeth={upper} />
                <div className="border-t border-slate-100" />
                <Row label={tm('bDentalLower')} teeth={lower} />
            </div>
            {!compact && (
                <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border-2" style={STATE_STYLES.ok} /> {tm('bDentalLegendOk')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border-2" style={STATE_STYLES.watch} /> {tm('bDentalLegendWatch')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border-2" style={STATE_STYLES.treat} /> {tm('bDentalLegendTreat')}
                    </span>
                </div>
            )}
            {compact && (
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                    <span>● {tm('bDentalLegendOk')}</span>
                    <span>● {tm('bDentalLegendWatch')}</span>
                    <span>● {tm('bDentalLegendTreat')}</span>
                </div>
            )}
        </div>
    );
}
