import React from 'react';
import { DatePicker } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { toSqlDateInputString } from '../../utils/localCalendarDate';
import {
  buildReportDateRangeChange,
  emptyCashStatusDate,
  type CashStatusDateValue,
  type ReportDatePreset,
  type ReportDateRangeValue,
} from '../../utils/reportDatePresets';

export interface ReportDateRangePresetsProps<T extends CashStatusDateValue = ReportDateRangeValue> {
  value: T;
  onChange: (next: T) => void;
  tm: (key: string) => string;
  min?: string;
  max?: string;
  className?: string;
  showMonthNav?: boolean;
  accentColor?: string;
  accentText?: string;
  /** Kasa Durumu: açılışta hiçbir düğme seçili olmasın, aynı düğme seçimi kaldırsın. */
  allowEmpty?: boolean;
  /** Tarih kutuları hazır aralıkta da görünsün. Boş değer filtre yok demektir. */
  alwaysShowDates?: boolean;
  /** Aralık hesabı. Verilmezse makine yerel günü kullanılır. */
  buildRange?: (
    preset: ReportDatePreset,
    monthOffset: number,
    customFrom?: string,
    customTo?: string,
  ) => T;
}

/** Rapor filtrelerinde sabit görünen tarih biçimi (gg.aa.yyyy). */
export const REPORT_DATE_PICKER_FORMAT = 'DD.MM.YYYY';

const PRESET_BUTTONS: Array<{ id: ReportDatePreset; labelKey: string }> = [
  { id: 'today', labelKey: 'bCallBoardToday' },
  { id: 'week', labelKey: 'bCallBoardWeek' },
  { id: 'month', labelKey: 'bCallBoardMonth' },
  { id: 'lastMonth', labelKey: 'reportDatePresetLastMonth' },
];

function presetButtonClass(active: boolean, accented: boolean): string {
  return [
    'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
    active
      ? (accented ? 'shadow-sm' : 'bg-blue-600 text-white shadow-sm')
      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
  ].join(' ');
}

function presetButtonStyle(
  active: boolean,
  accentColor?: string,
  accentText?: string,
): React.CSSProperties | undefined {
  if (!active || !accentColor) return undefined;
  return {
    backgroundColor: accentColor,
    borderColor: accentColor,
    color: accentText || '#ffffff',
  };
}

function ymdToDayjs(ymd: string): Dayjs | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = dayjs(ymd);
  return d.isValid() ? d : null;
}

function dayjsToYmd(value: Dayjs | null): string {
  if (!value || !value.isValid()) return '';
  return toSqlDateInputString(value.format('YYYY-MM-DD'));
}

/** Tek gün seçici — rapor filtrelerinde `DD.MM.YYYY` gösterir, değer `YYYY-MM-DD` tutar. */
export function ReportYmdDatePicker({
  value,
  onChange,
  allowClear = false,
  min,
  max,
  className,
  placeholder,
}: {
  value: string;
  onChange: (ymd: string) => void;
  allowClear?: boolean;
  min?: string;
  max?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <DatePicker
      allowClear={allowClear}
      format={REPORT_DATE_PICKER_FORMAT}
      value={ymdToDayjs(value)}
      minDate={min ? ymdToDayjs(min) ?? undefined : undefined}
      maxDate={max ? ymdToDayjs(max) ?? undefined : undefined}
      onChange={(picked: Dayjs | null) => {
        if (!picked || !picked.isValid()) {
          if (allowClear) onChange('');
          return;
        }
        onChange(dayjsToYmd(picked));
      }}
      className={className ?? 'min-w-[9.5rem] w-full'}
      placeholder={placeholder}
    />
  );
}

export function ReportDateRangePresets<T extends CashStatusDateValue = ReportDateRangeValue>({
  value,
  onChange,
  tm,
  min = '1990-01-01',
  max = '2100-12-31',
  className = '',
  showMonthNav = true,
  accentColor,
  accentText,
  allowEmpty = false,
  alwaysShowDates = false,
  buildRange,
}: ReportDateRangePresetsProps<T>) {
  const resolveRange = (
    preset: ReportDatePreset,
    monthOffset = 0,
    customFrom?: string,
    customTo?: string,
  ): T => {
    if (buildRange) return buildRange(preset, monthOffset, customFrom, customTo);
    return buildReportDateRangeChange(preset, monthOffset, customFrom, customTo) as T;
  };

  const clearRange = () => {
    onChange(emptyCashStatusDate() as T);
  };

  const applyPreset = (preset: ReportDatePreset, monthOffset = 0) => {
    const samePreset = value.preset === preset && (preset !== 'month' || value.monthOffset === monthOffset);
    if (allowEmpty && samePreset) {
      clearRange();
      return;
    }
    onChange(resolveRange(preset, monthOffset, value.from, value.to));
  };

  const handleFromChange = (from: string) => {
    if (!from) {
      if (allowEmpty) clearRange();
      return;
    }
    const to = !value.to || from > value.to ? from : value.to;
    onChange(resolveRange('custom', 0, from, to));
  };

  const handleToChange = (to: string) => {
    if (!to) {
      if (allowEmpty) clearRange();
      return;
    }
    const from = !value.from || to < value.from ? to : value.from;
    onChange(resolveRange('custom', 0, from, to));
  };

  const showDateFields = alwaysShowDates
    || value.preset === 'custom'
    || value.preset === 'month'
    || value.preset === 'lastMonth';

  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`.trim()}>
      <div className="flex flex-wrap items-center gap-2">
        {PRESET_BUTTONS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => applyPreset(id, id === 'month' ? 0 : 0)}
            className={presetButtonClass(
              value.preset === id && (id !== 'month' || value.monthOffset === 0),
              Boolean(accentColor),
            )}
            style={presetButtonStyle(
              value.preset === id && (id !== 'month' || value.monthOffset === 0),
              accentColor,
              accentText,
            )}
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
              ? (accentColor ? 'shadow-sm' : 'bg-blue-600 text-white shadow-sm')
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
          ].join(' ')}
          style={presetButtonStyle(value.preset === 'custom', accentColor, accentText)}
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

      {showDateFields && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('dateFrom')}</span>
            <ReportYmdDatePicker
              value={value.from}
              onChange={handleFromChange}
              allowClear={allowEmpty}
              min={min}
              max={max}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-500">{tm('dateTo')}</span>
            <ReportYmdDatePicker
              value={value.to}
              onChange={handleToChange}
              allowClear={allowEmpty}
              min={min}
              max={max}
            />
          </label>
        </div>
      )}
    </div>
  );
}
