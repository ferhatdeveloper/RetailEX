import React, { useEffect, useRef, useState } from 'react';
import { Input } from 'antd';
import {
  emptyPartialDateParts,
  parseIsoToPartialDate,
  partialDatePartsToIso,
  type PartialDateParts,
} from '../../utils/partialDateInput';

export type PartialDateFieldsProps = {
  /** ISO `YYYY-MM-DD` veya null */
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  labels?: { day?: string; month?: string; year?: string };
  disabled?: boolean;
  className?: string;
  /** Yıl kutusu placeholder — varsayılan yy / yyyy */
  yearPlaceholder?: string;
};

/**
 * Gün · Ay · Yıl ayrı kutular. Yıl 2 hane (son iki hane) veya 4 hane kabul eder.
 */
export function PartialDateFields({
  value,
  onChange,
  labels,
  disabled,
  className,
  yearPlaceholder = 'yy',
}: PartialDateFieldsProps) {
  const [parts, setParts] = useState<PartialDateParts>(() => parseIsoToPartialDate(value));
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setParts(parseIsoToPartialDate(value));
  }, [value]);

  const emit = (next: PartialDateParts) => {
    setParts(next);
    const iso = partialDatePartsToIso(next);
    const empty = !next.day && !next.month && !next.year;
    if (empty) {
      onChange(null);
      return;
    }
    // Eksik parçadayken üst değeri silme — kullanıcı yazmaya devam etsin
    if (iso) onChange(iso);
  };

  const onlyDigits = (s: string, maxLen: number) => s.replace(/\D/g, '').slice(0, maxLen);

  return (
    <div className={`flex items-end gap-2 ${className ?? ''}`.trim()}>
      <div className="min-w-0 flex-1">
        {labels?.day ? (
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {labels.day}
          </div>
        ) : null}
        <Input
          ref={dayRef as never}
          className="!rounded-2xl !px-3 !py-2.5 !text-center tabular-nums"
          inputMode="numeric"
          maxLength={2}
          disabled={disabled}
          placeholder="gg"
          value={parts.day}
          aria-label={labels?.day || 'Gün'}
          onChange={(e) => {
            const day = onlyDigits(e.target.value, 2);
            emit({ ...parts, day });
            if (day.length >= 2) monthRef.current?.focus();
          }}
        />
      </div>
      <span className="pb-2.5 text-slate-400 font-bold select-none" aria-hidden>
        /
      </span>
      <div className="min-w-0 flex-1">
        {labels?.month ? (
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {labels.month}
          </div>
        ) : null}
        <Input
          ref={monthRef as never}
          className="!rounded-2xl !px-3 !py-2.5 !text-center tabular-nums"
          inputMode="numeric"
          maxLength={2}
          disabled={disabled}
          placeholder="aa"
          value={parts.month}
          aria-label={labels?.month || 'Ay'}
          onChange={(e) => {
            const month = onlyDigits(e.target.value, 2);
            emit({ ...parts, month });
            if (month.length >= 2) yearRef.current?.focus();
          }}
        />
      </div>
      <span className="pb-2.5 text-slate-400 font-bold select-none" aria-hidden>
        /
      </span>
      <div className="min-w-0 flex-[1.4]">
        {labels?.year ? (
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {labels.year}
          </div>
        ) : null}
        <Input
          ref={yearRef as never}
          className="!rounded-2xl !px-3 !py-2.5 !text-center tabular-nums"
          inputMode="numeric"
          maxLength={4}
          disabled={disabled}
          placeholder={yearPlaceholder}
          value={parts.year}
          aria-label={labels?.year || 'Yıl'}
          onChange={(e) => {
            const year = onlyDigits(e.target.value, 4);
            emit({ ...parts, year });
          }}
          onBlur={() => {
            // 2 haneli yılı blur’da ISO’ya çevirip gösterimi 4 haneye çek
            const iso = partialDatePartsToIso(parts);
            if (iso) {
              setParts(parseIsoToPartialDate(iso));
              onChange(iso);
            } else if (!parts.day && !parts.month && !parts.year) {
              onChange(null);
            }
          }}
        />
      </div>
    </div>
  );
}

export { emptyPartialDateParts, parseIsoToPartialDate, partialDatePartsToIso };
