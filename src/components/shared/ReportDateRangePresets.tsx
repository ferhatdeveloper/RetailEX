import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { toSqlDateInputString } from '../../utils/localCalendarDate';
import {
  buildReportDateRangeChange,
  type ReportDatePreset,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';

export interface ReportDateRangePresetsProps {
  value: ReportDateRangeValue;
  onChange: (next: ReportDateRangeValue) => void;
  tm: (key: string) => string;
  min?: string;
  max?: string;
  className?: string;
  showMonthNav?: boolean;
}

const PRESET_BUTTONS: Array<{ id: ReportDatePreset; labelKey: string }> = [
  { id: 'today', labelKey: 'bCallBoardToday' },
  { id: 'week', labelKey: 'bCallBoardWeek' },
  { id: 'month', labelKey: 'bCallBoardMonth' },
  { id: 'lastMonth', labelKey: 'reportDatePresetLastMonth' },
];

function presetButtonClass(active: boolean): string {
  return [
    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
    active
      ? 'bg-[var(--asin-accent,#1FA8A0)] text-white shadow-sm'
      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
  ].join(' ');
}

export function ReportDateRangePresets({
  value,
  onChange,
  tm,
  min = '1990-01-01',
  max = '2100-12-31',
  className = '',
  showMonthNav = true,
}: ReportDateRangePresetsProps) {
  const applyPreset = (preset: ReportDatePreset, monthOffset = 0) => {
    onChange(buildReportDateRangeChange(preset, monthOffset, value.from, value.to));
  };

  const handleFromChange = (raw: string) => {
    const from = toSqlDateInputString(raw);
    if (!from) return;
    const to = from > value.to ? from : value.to;
    onChange(buildReportDateRangeChange('custom', 0, from, to));
  };

  const handleToChange = (raw: string) => {
    const to = toSqlDateInputString(raw);
    if (!to) return;
    const from = to < value.from ? to : value.from;
    onChange(buildReportDateRangeChange('custom', 0, from, to));
  };

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_BUTTONS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id, id === 'month' ? 0 : 0)}
            className={presetButtonClass(value.preset === id && (id !== 'month' || value.monthOffset === 0))}
          >
            {tm(labelKey)}
          </button>
        ))}
        <button
          type="button"
          title={tm('bCallBoardDateRange')}
          aria-label={tm('bCallBoardDateRange')}
          onClick={() => applyPreset('custom')}
          className={[
            'inline-flex items-center justify-center p-2 rounded-lg transition-colors',
            value.preset === 'custom'
              ? 'bg-[var(--asin-accent,#1FA8A0)] text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
          ].join(' ')}
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>

      {showMonthNav && value.preset === 'month' && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={tm('bCallBoardPrevMonth')}
            aria-label={tm('bCallBoardPrevMonth')}
            onClick={() => applyPreset('month', value.monthOffset - 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {tm('bCallBoardPrevMonth')}
          </button>
          <button
            type="button"
            title={tm('bCallBoardNextMonth')}
            aria-label={tm('bCallBoardNextMonth')}
            onClick={() => applyPreset('month', value.monthOffset + 1)}
            disabled={value.monthOffset >= 0}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {tm('bCallBoardNextMonth')}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {(value.preset === 'custom' || value.preset === 'month' || value.preset === 'lastMonth') && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('dateFrom')}</span>
            <input
              type="date"
              min={min}
              max={max}
              value={value.from}
              onChange={(e) => handleFromChange(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[9.5rem]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('dateTo')}</span>
            <input
              type="date"
              min={min}
              max={max}
              value={value.to}
              onChange={(e) => handleToChange(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[9.5rem]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
