import React from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautySatisfactionSurvey } from '../../../types/beauty';
import { cn } from '../../ui/utils';

type SurveyReportToolbarProps = {
    titleKey: string;
    subtitleKey: string;
    icon: React.ReactNode;
    iconClassName?: string;
    buttonClassName?: string;
    startYmd: string;
    endYmd: string;
    onStartChange: (v: string) => void;
    onEndChange: (v: string) => void;
    surveyId: string;
    onSurveyChange: (v: string) => void;
    surveyOptions: BeautySatisfactionSurvey[];
    loading: boolean;
    onRun: () => void;
    extraFilters?: React.ReactNode;
    /** Raporlar modülü üst tarih çubuğu kullanılıyorsa yerel tarih alanlarını gizle */
    hideDateRange?: boolean;
};

export function SurveyReportToolbar({
    titleKey,
    subtitleKey,
    icon,
    iconClassName = 'bg-violet-100 text-violet-700',
    buttonClassName = 'bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300',
    startYmd,
    endYmd,
    onStartChange,
    onEndChange,
    surveyId,
    onSurveyChange,
    surveyOptions,
    loading,
    onRun,
    extraFilters,
    hideDateRange = false,
}: SurveyReportToolbarProps) {
    const { tm } = useLanguage();

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', iconClassName)}>
                    {icon}
                </div>
                <div className="min-w-0">
                    <h2 className="text-xl font-black text-gray-900">{tm(titleKey)}</h2>
                    <p className="text-xs font-semibold text-gray-500">{tm(subtitleKey)}</p>
                </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 w-full pt-1 border-t border-gray-50">
                {!hideDateRange ? (
                    <>
                        <label className="flex flex-col gap-1 shrink-0">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('date')}</span>
                            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white">
                                <CalendarDays size={14} className="text-violet-600 shrink-0" />
                                <input
                                    type="date"
                                    value={startYmd}
                                    onChange={(e) => onStartChange(e.target.value)}
                                    className="text-xs font-bold text-gray-700 outline-none bg-transparent min-w-0"
                                />
                            </div>
                        </label>
                        <label className="flex flex-col gap-1 shrink-0">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bToDate')}</span>
                            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white">
                                <CalendarDays size={14} className="text-violet-600 shrink-0" />
                                <input
                                    type="date"
                                    value={endYmd}
                                    onChange={(e) => onEndChange(e.target.value)}
                                    className="text-xs font-bold text-gray-700 outline-none bg-transparent min-w-0"
                                />
                            </div>
                        </label>
                    </>
                ) : null}
                <label className="flex flex-col gap-1 min-w-[160px] shrink-0">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bSurveyReportFilter')}</span>
                    <select
                        value={surveyId}
                        onChange={(e) => onSurveyChange(e.target.value)}
                        className="h-10 border border-gray-200 rounded-xl px-3 text-xs font-bold text-gray-700 bg-white w-full"
                    >
                        <option value="all">{tm('bSurveyReportAllSurveys')}</option>
                        {surveyOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </label>
                {extraFilters}
                <button
                    type="button"
                    onClick={onRun}
                    disabled={loading}
                    className={cn(
                        'h-10 px-5 rounded-xl text-white text-xs font-extrabold flex items-center gap-2 shrink-0 ml-auto',
                        buttonClassName,
                    )}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {loading ? tm('bLoading') : tm('bBookingModalOk')}
                </button>
            </div>
        </div>
    );
}
