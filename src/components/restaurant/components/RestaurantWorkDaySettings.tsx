import React from 'react';
import { Clock, Sun, Moon, Info } from 'lucide-react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { cn } from '@/components/ui/utils';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

/**
 * Mali gün: belirlenen saatte kasayı otomatik aç / gün sonu (Z öncesi kontrollerle).
 */
export function RestaurantWorkDaySettings() {
    const tmR = useRestaurantModuleTm();
    const {
        workDayAutoStartEnabled,
        workDayAutoEndEnabled,
        workDayStartTime,
        workDayEndTime,
        workDayAutoOpeningCash,
        setWorkDayAutomation,
    } = useRestaurantStore();

    return (
        <div className="max-w-2xl space-y-8">
            <div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">{tmR('resWorkDayTitle')}</h3>
                <p className="text-sm text-slate-500 mt-1">
                    {tmR('resWorkDayIntro')}
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
                    <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                    <p>
                        {tmR('resWorkDayAlert')}
                    </p>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                    <label className={cn('flex flex-col gap-2 rounded-xl border p-4 cursor-pointer transition-colors', workDayAutoStartEnabled ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:bg-slate-50')}>
                        <span className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                checked={workDayAutoStartEnabled}
                                onChange={(e) => setWorkDayAutomation({ workDayAutoStartEnabled: e.target.checked })}
                            />
                            <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800">{tmR('resWorkDayAutoStart')}</span>
                        </span>
                        <span className="text-xs text-slate-500 pl-7">{tmR('resWorkDayAutoStartHint')}</span>
                    </label>

                    <label className={cn('flex flex-col gap-2 rounded-xl border p-4 cursor-pointer transition-colors', workDayAutoEndEnabled ? 'border-violet-300 bg-violet-50/50' : 'border-slate-200 hover:bg-slate-50')}>
                        <span className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                checked={workDayAutoEndEnabled}
                                onChange={(e) => setWorkDayAutomation({ workDayAutoEndEnabled: e.target.checked })}
                            />
                            <Moon className="w-4 h-4 text-violet-500 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800">{tmR('resWorkDayAutoEnd')}</span>
                        </span>
                        <span className="text-xs text-slate-500 pl-7">{tmR('resWorkDayAutoEndHint')}</span>
                    </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                            <Clock className="w-3.5 h-3.5" />
                            {tmR('resWorkDayLabelStartTime')}
                        </label>
                        <input
                            type="time"
                            value={workDayStartTime}
                            onChange={(e) => setWorkDayAutomation({ workDayStartTime: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                            <Clock className="w-3.5 h-3.5" />
                            {tmR('resWorkDayLabelEndTime')}
                        </label>
                        <input
                            type="time"
                            value={workDayEndTime}
                            onChange={(e) => setWorkDayAutomation({ workDayEndTime: e.target.value })}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 block">
                        {tmR('resWorkDayLabelOpeningCash')}
                    </label>
                    <input
                        type="number"
                        min={0}
                        step={1}
                        value={workDayAutoOpeningCash}
                        onChange={(e) => setWorkDayAutomation({ workDayAutoOpeningCash: Math.max(0, Number(e.target.value) || 0) })}
                        className="w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <p className="text-xs text-slate-400 mt-1">{tmR('resWorkDayOpeningCashHint')}</p>
                </div>
            </div>
        </div>
    );
}
