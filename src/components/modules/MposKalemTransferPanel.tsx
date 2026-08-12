/**
 * Kalem / JRetail Basic M-POS «Bilgilerinin Gönderilmesi / Alınması» — klasik ERP dialog düzeni.
 * JRetail: çoklu kasa checkbox, Değişenler/Tümü, tarih aralığı, ürün resmi.
 */

import React from 'react';
import { HelpCircle, RefreshCw, Upload, Download } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { BranchStoreOption } from '../../services/hybridSyncService';
import type { PosTerminalRegistration } from '../../services/deviceRegistrationService';
import type { MposSendSyncMode } from '../../services/mposSendService';

export type MposKalemTransferMode = 'send' | 'receive';

type FileTypeOption = { id: string; label: string };

type Props = {
  mode: MposKalemTransferMode;
  title: string;
  fileTypes: FileTypeOption[];
  fileType: string;
  onFileTypeChange: (value: string) => void;
  branchStores: BranchStoreOption[];
  selectedBranchStoreId: string;
  onBranchChange: (storeId: string) => void;
  selectedTerminalDeviceId: string;
  onTerminalChange: (deviceId: string) => void;
  filteredTerminals: PosTerminalRegistration[];
  /** JRetail: gönderimde birden fazla kasa seçimi */
  selectedTerminalDeviceIds?: string[];
  onTerminalSelectionChange?: (deviceIds: string[]) => void;
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  theme: 'light' | 'dark';
  helpText?: string;
  showProductImagesOption?: boolean;
  includeProductImages?: boolean;
  onIncludeProductImagesChange?: (value: boolean) => void;
  /** Malzeme/cari için Değişenler veya Tümü */
  syncMode?: MposSendSyncMode;
  onSyncModeChange?: (mode: MposSendSyncMode) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  sendProgress?: { current: number; total: number; label: string } | null;
  /** Üst barda hedef seçiliyse işyeri/kasa alanlarını gizle */
  hideTargetFields?: boolean;
  className?: string;
};

const fieldClass = (theme: 'light' | 'dark') =>
  `h-9 w-full border px-3 text-sm rounded-md ${
    theme === 'dark'
      ? 'bg-gray-700 border-gray-600 text-gray-100'
      : 'bg-white border-gray-300 text-gray-900'
  }`;

const SYNC_DATE_TYPES = new Set(['products', 'customers']);

export function MposKalemTransferPanel({
  mode,
  title,
  fileTypes,
  fileType,
  onFileTypeChange,
  branchStores,
  selectedBranchStoreId,
  onBranchChange,
  selectedTerminalDeviceId,
  onTerminalChange,
  filteredTerminals,
  selectedTerminalDeviceIds = [],
  onTerminalSelectionChange,
  isBusy,
  onCancel,
  onSubmit,
  theme,
  helpText,
  showProductImagesOption,
  includeProductImages,
  onIncludeProductImagesChange,
  syncMode = 'full',
  onSyncModeChange,
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
  sendProgress,
  hideTargetFields = false,
  className = '',
}: Props) {
  const isDark = theme === 'dark';
  const submitLabel = mode === 'send' ? 'Gönder' : 'Al';
  const SubmitIcon = mode === 'send' ? Upload : Download;
  const multiSend = mode === 'send' && !!onTerminalSelectionChange;
  const showSyncScope = mode === 'send' && SYNC_DATE_TYPES.has(fileType) && onSyncModeChange;

  const toggleTerminal = (deviceId: string, checked: boolean) => {
    if (!onTerminalSelectionChange) return;
    const next = checked
      ? [...new Set([...selectedTerminalDeviceIds, deviceId])]
      : selectedTerminalDeviceIds.filter((id) => id !== deviceId);
    onTerminalSelectionChange(next);
    if (next.length === 1) onTerminalChange(next[0]);
    else if (next.length === 0) onTerminalChange('');
    else if (!next.includes(selectedTerminalDeviceId)) onTerminalChange(next[0]);
  };

  const selectAllTerminals = () => {
    const ids = filteredTerminals.map((t) => t.deviceId);
    onTerminalSelectionChange?.(ids);
    if (ids[0]) onTerminalChange(ids[0]);
  };

  const clearAllTerminals = () => {
    onTerminalSelectionChange?.([]);
    onTerminalChange('');
  };

  return (
    <div
      className={`w-full rounded-xl border shadow-sm overflow-hidden flex flex-col h-full min-h-[320px] ${className} ${
        isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'
      }`}
      role="region"
      aria-label={title}
    >
      <div
        className={`px-4 py-2.5 text-sm font-semibold ${
          isDark
            ? 'bg-slate-700 text-white border-b border-gray-600'
            : 'bg-[#0054a6] text-white border-b border-[#004080]'
        }`}
      >
        {title}
      </div>

      <div className={`px-4 py-4 space-y-4 flex-1 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className={`grid gap-3 ${hideTargetFields ? 'grid-cols-1' : 'grid-cols-1'}`}>
          <div className="space-y-1.5">
            <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Dosya tipi
            </label>
            <select
              value={fileType}
              onChange={(e) => onFileTypeChange(e.target.value)}
              className={fieldClass(theme)}
            >
              {fileTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {ft.label}
                </option>
              ))}
            </select>
          </div>

          {!hideTargetFields ? (
            <>
              <div className="space-y-1.5">
                <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  İşyeri
                </label>
                <select
                  value={selectedBranchStoreId}
                  onChange={(e) => onBranchChange(e.target.value)}
                  className={fieldClass(theme)}
                >
                  <option value="">Seçin…</option>
                  {branchStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {!multiSend ? (
                <div className="space-y-1.5">
                  <label className={`block text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Kasa
                  </label>
                  <select
                    value={selectedTerminalDeviceId}
                    onChange={(e) => onTerminalChange(e.target.value)}
                    disabled={!selectedBranchStoreId}
                    className={`${fieldClass(theme)} disabled:opacity-60`}
                  >
                    <option value="">Seçin…</option>
                    {filteredTerminals.map((t) => (
                      <option key={t.deviceId} value={t.deviceId}>
                        {t.terminalName}
                        {t.computerName ? ` (${t.computerName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {multiSend && (hideTargetFields ? filteredTerminals.length > 0 : selectedBranchStoreId) ? (
          <div className={`space-y-2 rounded-md border p-3 ${isDark ? 'border-gray-600 bg-gray-900/50' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Cihazlar (çoklu seçim)
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={selectAllTerminals}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/50 text-blue-600 dark:text-blue-400"
                >
                  Tümünü seç
                </button>
                <button
                  type="button"
                  onClick={clearAllTerminals}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${isDark ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'}`}
                >
                  Temizle
                </button>
              </div>
            </div>
            {filteredTerminals.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">Bu firmada onaylı cihaz yok.</p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {filteredTerminals.map((t) => (
                  <label key={t.deviceId} className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={selectedTerminalDeviceIds.includes(t.deviceId)}
                      onCheckedChange={(c) => toggleTerminal(t.deviceId, c === true)}
                    />
                    <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                      {t.terminalName}
                      {t.computerName ? ` (${t.computerName})` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedTerminalDeviceIds.length > 0 && (
              <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {selectedTerminalDeviceIds.length} cihaz seçili
              </p>
            )}
          </div>
        ) : null}

        {!multiSend && !hideTargetFields && selectedBranchStoreId && filteredTerminals.length === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Bu işyerinde onaylı kasa yok.
          </p>
        )}

        {showSyncScope ? (
          <div className={`space-y-2 rounded-md border p-3 ${isDark ? 'border-gray-600 bg-gray-900/50' : 'border-gray-200 bg-white'}`}>
            <Label className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Gönderim kapsamı
            </Label>
            <RadioGroup
              value={syncMode}
              onValueChange={(v) => onSyncModeChange(v as MposSendSyncMode)}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="incremental" id="mpos-sync-changed" />
                <Label htmlFor="mpos-sync-changed" className="text-xs cursor-pointer">
                  Değişenler
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="full" id="mpos-sync-all" />
                <Label htmlFor="mpos-sync-all" className="text-xs cursor-pointer">
                  Tümü
                </Label>
              </div>
            </RadioGroup>
            {syncMode === 'incremental' && onDateFromChange && onDateToChange ? (
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-gray-500">İlk tarih</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => onDateFromChange(e.target.value)}
                    className="h-7 w-32 text-xs"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-gray-500">Son tarih</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => onDateToChange(e.target.value)}
                    className="h-7 w-32 text-xs"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {showProductImagesOption && mode === 'send' && fileType === 'products' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!includeProductImages}
              onChange={(e) => onIncludeProductImagesChange?.(e.target.checked)}
              className="rounded border-gray-400"
            />
            <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>Ürün resmi de aktarılsın</span>
          </label>
        )}

        {sendProgress && sendProgress.total > 0 ? (
          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className="flex justify-between mb-1">
              <span>{sendProgress.label}</span>
              <span>
                {sendProgress.current}/{sendProgress.total}
              </span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${Math.round((sendProgress.current / sendProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`flex items-center justify-between px-4 py-3 border-t gap-3 ${
          isDark ? 'border-gray-600 bg-gray-900/80' : 'border-gray-200 bg-white'
        }`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title={helpText ?? 'Kasa veri gönder/al akışı'}
          onClick={() => {
            if (helpText) window.alert(helpText);
          }}
        >
          <HelpCircle className="w-4 h-4" />
        </Button>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={onCancel}
            className={`h-8 min-w-[88px] rounded-sm ${
              isDark ? '' : 'bg-[#e1e1e1] border-gray-400 hover:bg-[#d4d4d4]'
            }`}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isBusy}
            onClick={onSubmit}
            className={`h-8 min-w-[88px] rounded-sm gap-1.5 ${
              mode === 'receive'
                ? 'bg-sky-700 hover:bg-sky-800 text-white'
                : 'bg-[#0066cc] hover:bg-[#0054a6] text-white'
            }`}
          >
            {isBusy ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SubmitIcon className="w-3.5 h-3.5" />
            )}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
