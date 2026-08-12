import React from 'react';
import { Sparkles, Smile, Activity, Baby, Apple } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useClinicErpSpecialty } from '../context/ClinicErpSpecialtyContext';
import type { ClinicErpSpecialty } from '../../../types/beauty';

const OPTIONS: {
    id: ClinicErpSpecialty;
    icon: typeof Sparkles;
    color: string;
    labelKey: string;
    descKey: string;
}[] = [
    { id: 'beauty_default', icon: Sparkles, color: '#7c3aed', labelKey: 'bClinicSpec_beauty_default', descKey: 'bClinicSpec_beauty_default_desc' },
    { id: 'dental', icon: Smile, color: '#0ea5e9', labelKey: 'bClinicSpec_dental', descKey: 'bClinicSpec_dental_desc' },
    { id: 'physiotherapy', icon: Activity, color: '#16a34a', labelKey: 'bClinicSpec_physiotherapy', descKey: 'bClinicSpec_physiotherapy_desc' },
    { id: 'obstetrics', icon: Baby, color: '#ec4899', labelKey: 'bClinicSpec_obstetrics', descKey: 'bClinicSpec_obstetrics_desc' },
    { id: 'dietitian', icon: Apple, color: '#ca8a04', labelKey: 'bClinicSpec_dietitian', descKey: 'bClinicSpec_dietitian_desc' },
];

export function ClinicSpecialtyModePanel() {
    const { tm } = useLanguage();
    const { specialty, setSpecialty, firmNr } = useClinicErpSpecialty();

    return (
        <div className="max-w-2xl space-y-4">
            <div>
                <h3 className="text-base font-black text-slate-900">{tm('bClinicSpecialtyTitle')}</h3>
                <p className="text-sm text-slate-600 mt-1">{tm('bClinicSpecialtyIntro')}</p>
                <p className="text-[11px] text-slate-500 mt-2 font-mono">Firma: {firmNr}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    const active = specialty === opt.id;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSpecialty(opt.id)}
                            className="flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all"
                            style={{
                                borderColor: active ? opt.color : '#e2e8f0',
                                background: active ? `${opt.color}12` : '#fff',
                                boxShadow: active ? `0 0 0 1px ${opt.color}40` : undefined,
                            }}
                        >
                            <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                                style={{ background: opt.color }}
                            >
                                <Icon size={20} />
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-slate-900 text-sm">{tm(opt.labelKey)}</div>
                                <div className="text-xs text-slate-600 mt-0.5 leading-snug">{tm(opt.descKey)}</div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
