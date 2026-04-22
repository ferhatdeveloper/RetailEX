import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';

const ZONES = [
    { id: 'head', labelKey: 'bPhysioZoneHead' },
    { id: 'neck', labelKey: 'bPhysioZoneNeck' },
    { id: 'shoulder_l', labelKey: 'bPhysioZoneShoulderL' },
    { id: 'shoulder_r', labelKey: 'bPhysioZoneShoulderR' },
    { id: 'spine', labelKey: 'bPhysioZoneSpine' },
    { id: 'hip', labelKey: 'bPhysioZoneHip' },
    { id: 'knee_l', labelKey: 'bPhysioZoneKneeL' },
    { id: 'knee_r', labelKey: 'bPhysioZoneKneeR' },
] as const;

export function PhysioBodyScreen({
    embed,
    initialActiveZone,
    onPersistZone,
}: {
    embed?: boolean;
    initialActiveZone?: string | null;
    onPersistZone?: (zone: string | null) => void | Promise<void>;
}) {
    const { tm } = useLanguage();
    const [active, setActive] = useState<string | null>(initialActiveZone ?? null);
    const seed = JSON.stringify(initialActiveZone ?? null);
    useEffect(() => {
        setActive(initialActiveZone ?? null);
    }, [seed, initialActiveZone]);

    const dirty = useRef(false);
    const persistT = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!embed || !onPersistZone || !dirty.current) return;
        if (persistT.current) clearTimeout(persistT.current);
        persistT.current = setTimeout(() => {
            persistT.current = null;
            void Promise.resolve(onPersistZone(active)).finally(() => {
                dirty.current = false;
            });
        }, 550);
        return () => {
            if (persistT.current) clearTimeout(persistT.current);
        };
    }, [active, embed, onPersistZone]);

    const pad = embed ? 'p-2 gap-3 flex-col' : 'p-4 md:p-6 gap-6 flex-col lg:flex-row';
    const maxW = embed ? '' : 'max-w-5xl mx-auto';
    const bg = embed ? 'transparent' : '#f7f6fb';
    const svgClass = embed ? 'w-36 max-h-[45vh]' : 'w-48 md:w-56 max-h-[70vh]';

    return (
        <div className={`flex ${pad} ${maxW}`} style={{ background: bg, minHeight: embed ? undefined : '100%' }}>
            <div className="flex-1 min-w-0 space-y-1.5">
                {!embed && (
                    <>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">{tm('bPhysioTitle')}</h2>
                        <p className="text-sm text-slate-600">{tm('bPhysioHint')}</p>
                    </>
                )}
                {embed && <p className="text-[11px] text-slate-500 leading-snug">{tm('bPhysioHintEmbed')}</p>}
                <div className={`rounded-2xl border border-slate-200 bg-white flex justify-center ${embed ? 'p-3' : 'p-6'}`}>
                    <svg viewBox="0 0 200 360" className={svgClass} aria-hidden>
                        <ellipse cx="100" cy="38" rx="22" ry="28" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
                        <rect x="92" y="64" width="16" height="24" rx="4" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
                        <path
                            d="M100 88 L60 120 L60 200 L85 320 L115 320 L140 200 L140 120 Z"
                            fill="#f1f5f9"
                            stroke="#64748b"
                            strokeWidth="2"
                        />
                        <path d="M60 120 L35 145 M140 120 L165 145" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
                        <path d="M85 320 L75 350 M115 320 L125 350" stroke="#64748b" strokeWidth="3" strokeLinecap="round" />
                        {[
                            { id: 'head', cx: 100, cy: 38, r: 14 },
                            { id: 'neck', cx: 100, cy: 76, r: 10 },
                            { id: 'shoulder_l', cx: 52, cy: 118, r: 12 },
                            { id: 'shoulder_r', cx: 148, cy: 118, r: 12 },
                            { id: 'spine', cx: 100, cy: 180, r: 14 },
                            { id: 'hip', cx: 100, cy: 248, r: 16 },
                            { id: 'knee_l', cx: 82, cy: 312, r: 10 },
                            { id: 'knee_r', cx: 118, cy: 312, r: 10 },
                        ].map(z => (
                            <circle
                                key={z.id}
                                cx={z.cx}
                                cy={z.cy}
                                r={z.r}
                                fill={active === z.id ? 'rgba(124,58,237,0.35)' : 'rgba(124,58,237,0.08)'}
                                stroke={active === z.id ? '#7c3aed' : '#c4b5fd'}
                                strokeWidth="2"
                            />
                        ))}
                    </svg>
                </div>
            </div>
            <div className={`w-full shrink-0 space-y-1.5 ${embed ? '' : 'lg:w-64'}`}>
                <h3 className={`font-bold text-slate-800 ${embed ? 'text-xs' : 'text-sm'}`}>{tm('bPhysioZones')}</h3>
                <ul className="space-y-1">
                    {ZONES.map(z => (
                        <li key={z.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    if (onPersistZone) dirty.current = true;
                                    setActive(z.id === active ? null : z.id);
                                }}
                                className={`w-full text-left rounded-xl border transition-colors ${
                                    embed ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
                                } font-semibold ${
                                    active === z.id
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white border-slate-200 text-slate-700 hover:border-violet-300'
                                }`}
                            >
                                {tm(z.labelKey)}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
