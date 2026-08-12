import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';

export function DietitianScreen({
    embed,
    initialKcal,
    onPersistKcal,
}: {
    embed?: boolean;
    initialKcal?: number;
    onPersistKcal?: (kcal: number) => void | Promise<void>;
}) {
    const { tm } = useLanguage();
    const k0 =
        typeof initialKcal === 'number' && initialKcal >= 1200 && initialKcal <= 3200 ? initialKcal : 2000;
    const [kcal, setKcal] = useState(k0);
    const seed = JSON.stringify(initialKcal ?? null);
    useEffect(() => {
        setKcal(k0);
    }, [seed, k0]);

    const dirty = useRef(false);
    const persistT = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!embed || !onPersistKcal || !dirty.current) return;
        if (persistT.current) clearTimeout(persistT.current);
        persistT.current = setTimeout(() => {
            persistT.current = null;
            void Promise.resolve(onPersistKcal(kcal)).finally(() => {
                dirty.current = false;
            });
        }, 550);
        return () => {
            if (persistT.current) clearTimeout(persistT.current);
        };
    }, [kcal, embed, onPersistKcal]);

    const p = Math.round(kcal * 0.2 / 4);
    const f = Math.round(kcal * 0.3 / 9);
    const c = Math.round(kcal * 0.5 / 4);

    const pad = embed ? 'p-2 space-y-3' : 'p-4 md:p-6 max-w-3xl mx-auto space-y-6';
    const bg = embed ? 'transparent' : '#f7f6fb';

    return (
        <div className={pad} style={{ background: bg, minHeight: embed ? undefined : '100%' }}>
            {!embed && (
                <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight">{tm('bDietitianTitle')}</h2>
                    <p className="text-sm text-slate-600 mt-1">{tm('bDietitianHint')}</p>
                </div>
            )}
            {embed && <p className="text-[11px] text-slate-500 leading-snug">{tm('bDietitianHintEmbed')}</p>}
            <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm space-y-5 ${embed ? 'p-3' : 'p-5'}`}>
                <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{tm('bDietitianEnergy')}</span>
                    <div className="flex items-center gap-4 mt-2">
                        <input
                            type="range"
                            min={1200}
                            max={3200}
                            step={50}
                            value={kcal}
                            onChange={e => {
                                if (onPersistKcal) dirty.current = true;
                                setKcal(Number(e.target.value));
                            }}
                            className="flex-1 accent-emerald-600"
                        />
                        <span className="text-xl font-black text-emerald-700 tabular-nums">{kcal} kcal</span>
                    </div>
                </label>
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                        <div className="text-[10px] font-bold uppercase text-rose-600">{tm('bDietitianProtein')}</div>
                        <div className="text-lg font-black text-rose-800">{p} g</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                        <div className="text-[10px] font-bold uppercase text-amber-600">{tm('bDietitianFat')}</div>
                        <div className="text-lg font-black text-amber-900">{f} g</div>
                    </div>
                    <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                        <div className="text-[10px] font-bold uppercase text-sky-600">{tm('bDietitianCarb')}</div>
                        <div className="text-lg font-black text-sky-900">{c} g</div>
                    </div>
                </div>
                <p className="text-xs text-slate-500">{tm('bDietitianMacroNote')}</p>
            </div>
        </div>
    );
}
