import React from 'react';
import { ReportYmdDatePicker } from '../shared/ReportDateRangePresets';
import {
  analysisRankCustomRange,
  analysisRankPresetRange,
  type AnalysisRankPreset,
} from '../../utils/analysisRankDateRange';
import type { ReportDateRangeValue } from '../../utils/reportDatePresets';

const PRESETS: Array<{ id: AnalysisRankPreset; labelKey: string }> = [
  { id: 'today', labelKey: 'bCallBoardToday' },
  { id: 'week', labelKey: 'bCallBoardWeek' },
  { id: 'month', labelKey: 'bCallBoardMonth' },
  { id: 'lastMonth', labelKey: 'reportDatePresetLastMonth' },
];

/** Kategori Analizi ve En Çok Satanlar tarih aralığı. Seçim anında raporu çalıştırır. */
export function AnalysisRankDateFilter({
  value,
  onChange,
  tm,
}: {
  value: ReportDateRangeValue;
  onChange: (next: ReportDateRangeValue) => void;
  tm: (key: string) => string;
}) {
  const applyPreset = (preset: AnalysisRankPreset) => {
    const span = analysisRankPresetRange(preset);
    onChange({ preset, monthOffset: 0, from: span.from, to: span.to });
  };

  const applyFrom = (from: string) => {
    if (!from) return;
    const span = analysisRankCustomRange(from, value.to || from);
    onChange({ preset: 'custom', monthOffset: 0, from: span.from, to: span.to });
  };

  const applyTo = (to: string) => {
    if (!to) return;
    const span = analysisRankCustomRange(value.from || to, to);
    onChange({ preset: 'custom', monthOffset: 0, from: span.from, to: span.to });
  };

  return (
    <div className="bg-white rounded-lg border p-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            data-testid={`analysis-rank-preset-${id}`}
            onClick={() => applyPreset(id)}
            className={
              value.preset === id
                ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm'
                : 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }
          >
            {tm(labelKey)}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-500">{tm('dateFrom')}</span>
        <ReportYmdDatePicker value={value.from} onChange={applyFrom} className="min-w-[9.5rem]" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-500">{tm('dateTo')}</span>
        <ReportYmdDatePicker value={value.to} onChange={applyTo} className="min-w-[9.5rem]" />
      </label>
    </div>
  );
}
