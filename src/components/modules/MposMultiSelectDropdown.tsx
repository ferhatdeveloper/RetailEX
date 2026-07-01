/**
 * M-POS aktarım modalı — çoklu dosya tipi seçimi (checkbox listesi).
 */

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../ui/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Checkbox } from '../ui/checkbox';

export type MposSelectOption<T extends string> = {
  id: T;
  label: string;
};

type Props<T extends string> = {
  options: MposSelectOption<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  minSelection?: number;
};

function summaryLabel<T extends string>(
  options: MposSelectOption<T>[],
  value: T[],
  placeholder: string,
): string {
  if (!value.length) return placeholder;
  const labels = value
    .map((id) => options.find((o) => o.id === id)?.label)
    .filter(Boolean) as string[];
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  return `${labels[0]} +${labels.length - 1} tip`;
}

export function MposMultiSelectDropdown<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  placeholder = 'Seçin…',
  className,
  minSelection = 1,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const label = useMemo(() => summaryLabel(options, value, placeholder), [options, value, placeholder]);

  const toggle = (id: T, checked: boolean) => {
    if (checked) {
      if (value.includes(id)) return;
      onChange([...value, id]);
      return;
    }
    if (value.length <= minSelection) return;
    onChange(value.filter((v) => v !== id));
  };

  const selectAll = () => onChange(options.map((o) => o.id));
  const clearToMin = () => {
    if (options.length <= minSelection) {
      onChange(options.slice(0, minSelection).map((o) => o.id));
      return;
    }
    onChange([options[0].id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'h-9 w-full border px-2 text-sm rounded-md flex items-center justify-between gap-2 text-left',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className={cn('w-4 h-4 shrink-0 opacity-60', open && 'rotate-180 transition-transform')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 max-h-72 flex flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b text-[11px]">
          <span className="text-gray-500">{value.length} / {options.length} seçili</span>
          <div className="flex gap-2">
            <button type="button" className="text-blue-600 hover:underline" onClick={selectAll}>
              Tümü
            </button>
            <button type="button" className="text-gray-500 hover:underline" onClick={clearToMin}>
              Temizle
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-1">
          {options.map((opt) => {
            const checked = value.includes(opt.id);
            const locked = checked && value.length <= minSelection;
            return (
              <label
                key={opt.id}
                className={cn(
                  'flex items-start gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800',
                  locked && 'cursor-default',
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(c) => toggle(opt.id, c === true)}
                  className="mt-0.5"
                />
                <span className="leading-snug">{opt.label}</span>
                {checked && <Check className="w-3 h-3 text-blue-600 ml-auto shrink-0 mt-0.5" />}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
