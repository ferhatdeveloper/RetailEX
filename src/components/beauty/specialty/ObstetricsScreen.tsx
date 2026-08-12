import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function ObstetricsScreen({
    embed,
    initialWeeks,
    onPersistWeeks,
}: {
    embed?: boolean;
    initialWeeks?: number;
    onPersistWeeks?: (weeks: number) => void | Promise<void>;
}) {
    const { tm } = useLanguage();
    const w0 = typeof initialWeeks === 'number' && initialWeeks >= 4 && initialWeeks <= 42 ? initialWeeks : 24;
    const [weeks, setWeeks] = useState(w0);
    const seed = JSON.stringify(initialWeeks ?? null);
    useEffect(() => {
        setWeeks(w0);
    }, [seed, w0]);

    const dirty = useRef(false);
    const persistT = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!embed || !onPersistWeeks || !dirty.current) return;
        if (persistT.current) clearTimeout(persistT.current);
        persistT.current = setTimeout(() => {
            persistT.current = null;
            void Promise.resolve(onPersistWeeks(weeks)).finally(() => {
                dirty.current = false;
            });
        }, 550);
        return () => {
            if (persistT.current) clearTimeout(persistT.current);
        };
    }, [weeks, embed, onPersistWeeks]);

    const trimester = weeks < 14 ? 1 : weeks < 28 ? 2 : 3;

    const pad = embed ? 'p-2 space-y-3' : 'p-4 md:p-6 max-w-3xl mx-auto space-y-6';
    const bg = embed ? 'transparent' : '#f7f6fb';

    return (
        <div className={pad} style={{ background: bg, minHeight: embed ? undefined : '100%' }}>
            {!embed && (
                <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">{tm('bObstetricsTitle')}</h2>
                    <p className="text-sm text-slate-600 mt-1">{tm('bObstetricsHint')}</p>
                </div>
            )}
            {embed && <p className="text-[11px] text-slate-500 leading-snug">{tm('bObstetricsHintEmbed')}</p>}
            <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4 ${embed ? 'p-3' : 'p-5'}`}>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{tm('bObstetricsWeeks')}</span>
                    <div className="flex items-center gap-4 mt-2">
                        <input
                            type="range"
                            min={4}
                            max={42}
                            value={weeks}
                            onChange={e => {
                                if (onPersistWeeks) dirty.current = true;
                                setWeeks(Number(e.target.value));
                            }}
                            className="flex-1 accent-violet-600"
                        />
                        <span className="text-2xl font-black text-violet-700 tabular-nums w-12 text-right">{weeks}</span>
                    </div>
                </label>
                <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 text-sm font-semibold text-violet-900">
                    {tm('bObstetricsTrimester')}: {trimester} —{' '}
                    {trimester === 1 ? tm('bObstetricsTri1') : trimester === 2 ? tm('bObstetricsTri2') : tm('bObstetricsTri3')}
                </div>
                <ul className="text-sm text-slate-700 space-y-2 list-disc list-inside">
                    <li>{tm('bObstetricsCheck1')}</li>
                    <li>{tm('bObstetricsCheck2')}</li>
                    <li>{tm('bObstetricsCheck3')}</li>
                </ul>
            </div>
        </div>
    );
}
