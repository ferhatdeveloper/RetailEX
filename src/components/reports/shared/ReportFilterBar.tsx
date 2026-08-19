import React from 'react';
import { Select, DatePicker, Button } from 'antd';
import { FilterOutlined, ClearOutlined } from '@ant-design/icons';
import { useLanguage } from '../../../contexts/LanguageContext';

export type ReportFilterType = 'date-start' | 'date-end' | 'select';

export interface ReportFilterOption {
  value: string;
  label: string;
}

export interface ReportFilterBarItem {
  key: string;
  label: string;
  type: ReportFilterType;
  options?: ReportFilterOption[];
  value: any;
  onChange: (v: any) => void;
  span?: number;
  placeholder?: string;
}

export interface ReportFilterBarProps {
  filters: ReportFilterBarItem[];
  onClear?: () => void;
  className?: string;
  /** "Tümünü temizle" etiketi; çeviri anahtarı. */
  clearLabel?: string;
}

const TYPE_GRID_COL = {
  'date-start': 'md:col-span-1',
  'date-end': 'md:col-span-1',
  select: 'md:col-span-1',
};

function ItemWrapper({
  item,
  children,
}: {
  item: ReportFilterBarItem;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${TYPE_GRID_COL[item.type] ?? 'md:col-span-1'}`}>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {item.label}
      </span>
      {children}
    </label>
  );
}

export const ReportFilterBar: React.FC<ReportFilterBarProps> = ({
  filters,
  onClear,
  className = '',
  clearLabel,
}) => {
  const { tm: globalTm } = useLanguage();
  const resolvedClearLabel = clearLabel ?? globalTm('reportsFilterBarClear');

  const gridCols = `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-${Math.min(
    filters.length + (onClear ? 1 : 0),
    6,
  )} gap-3`;

  return (
    <div
      className={`bg-white border border-slate-200 rounded-lg p-3 sm:p-4 shadow-sm ${className}`.trim()}
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500 mb-2">
        <FilterOutlined />
        <span>{globalTm('reportsFilterBarTitle')}</span>
      </div>
      <div className={gridCols}>
        {filters.map((item) => {
          if (item.type === 'date-start' || item.type === 'date-end') {
            return (
              <ItemWrapper key={item.key} item={item}>
                <input
                  type="date"
                  value={item.value ?? ''}
                  onChange={(e) => item.onChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
              </ItemWrapper>
            );
          }
          if (item.type === 'select') {
            return (
              <ItemWrapper key={item.key} item={item}>
                <Select
                  allowClear
                  showSearch
                  size="middle"
                  value={item.value === '' || item.value == null ? undefined : item.value}
                  onChange={(v) =>
                    item.onChange(v == null || String(v).length === 0 ? '' : String(v))
                  }
                  placeholder={item.placeholder ?? item.label}
                  options={item.options ?? []}
                  optionFilterProp="label"
                  className="w-full"
                />
              </ItemWrapper>
            );
          }
          return null;
        })}
        {onClear ? (
          <div className="flex items-end justify-end md:col-span-1">
            <Button
              icon={<ClearOutlined />}
              onClick={onClear}
              className="w-full md:w-auto"
            >
              {resolvedClearLabel}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ReportFilterBar;