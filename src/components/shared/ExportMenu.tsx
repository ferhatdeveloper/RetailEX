/**
 * RetailEX — Reusable rapor export menüsü.
 *
 * Tek bir antd `Dropdown` butonu; tıklanınca `xlsx / csv / pdf / Yazdır`
 * seçenekleri listelenir. Parent `onExport(format)` çağırır, format dispatch
 * `utils/reportExport.ts` üzerinden yapılır.
 *
 * Kullanım:
 *   <ExportMenu onExport={handleExport} loading={busy} />
 */

import React from 'react';
import { Dropdown, Button } from 'antd';
import type { MenuProps } from 'antd';
import { Download, FileSpreadsheet, FileText, Printer, FileCode } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '../ui/utils';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'print';

export interface ExportMenuProps {
  /** Format dispatch callback — `reportExport.exportReport` veya kendi handler */
  onExport: (format: ExportFormat) => void;
  /** Tüm menü disable (rapor yüklenirken vb.) */
  loading?: boolean;
  /** Görünür formatlar — default: hepsi */
  formats?: ExportFormat[];
  /** Buton metni override (örn. "Dışa Aktar") */
  label?: string;
  /** Ekstra buton className */
  className?: string;
  /** Buton tipi — antd `type` (default / primary) */
  variant?: 'default' | 'primary' | 'ghost';
}

interface FormatMeta {
  key: ExportFormat;
  i18nKey: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const FORMAT_META: Record<ExportFormat, FormatMeta> = {
  xlsx: { key: 'xlsx', i18nKey: 'exportFormatXlsx', icon: FileSpreadsheet },
  csv: { key: 'csv', i18nKey: 'exportFormatCsv', icon: FileCode },
  pdf: { key: 'pdf', i18nKey: 'exportFormatPdf', icon: FileText },
  print: { key: 'print', i18nKey: 'exportFormatPrint', icon: Printer },
};

export function ExportMenu({
  onExport,
  loading = false,
  formats,
  label,
  className,
  variant = 'default',
}: ExportMenuProps) {
  const { tm } = useLanguage();
  const list: ExportFormat[] = formats ?? ['xlsx', 'csv', 'pdf', 'print'];

  const items: MenuProps['items'] = list.map((f) => {
    const meta = FORMAT_META[f];
    const Icon = meta.icon;
    return {
      key: f,
      label: (
        <div className="flex items-center gap-2 min-w-[140px]">
          <Icon size={14} className="text-slate-600" />
          <span className="text-sm font-semibold">{tm(meta.i18nKey)}</span>
        </div>
      ),
      onClick: () => onExport(f),
    };
  });

  const buttonBase =
    'inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-extrabold transition-colors';
  const variantClass =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : variant === 'ghost'
        ? 'text-slate-600 hover:bg-slate-100'
        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50';

  return (
    <Dropdown
      menu={{ items }}
      trigger={['click']}
      placement="bottomRight"
      disabled={loading}
    >
      <Button
        type="default"
        disabled={loading}
        className={cn(buttonBase, variantClass, className)}
        onClick={(e) => e.preventDefault()}
      >
        <Download size={14} className={loading ? 'animate-pulse' : ''} />
        {label ?? tm('exportMenuLabel')}
      </Button>
    </Dropdown>
  );
}
