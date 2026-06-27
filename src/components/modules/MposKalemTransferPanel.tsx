/**
 * Kalem KLRetail M-POS «Bilgilerinin Gönderilmesi / Alınması» — klasik ERP dialog düzeni.
 * Ekran görüntüsü: etiket solda, alan sağda; alt sol yardım, alt sağ Vazgeç + Gönder/Al.
 */

import React from 'react';
import { HelpCircle, RefreshCw, Upload, Download } from 'lucide-react';
import { Button } from '../ui/button';
import type { BranchStoreOption } from '../../services/hybridSyncService';
import type { PosTerminalRegistration } from '../../services/deviceRegistrationService';

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
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  theme: 'light' | 'dark';
  helpText?: string;
};

const fieldClass = (theme: 'light' | 'dark') =>
  `h-8 w-full border px-2 text-sm rounded-sm ${
    theme === 'dark'
      ? 'bg-gray-700 border-gray-500 text-gray-100'
      : 'bg-white border-gray-400 text-gray-900'
  }`;

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
  isBusy,
  onCancel,
  onSubmit,
  theme,
  helpText,
}: Props) {
  const isDark = theme === 'dark';
  const submitLabel = mode === 'send' ? 'Gönder' : 'Al';
  const SubmitIcon = mode === 'send' ? Upload : Download;

  return (
    <div
      className={`inline-block w-full max-w-[440px] border shadow-md ${
        isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-400 bg-[#ececec]'
      }`}
      role="dialog"
      aria-label={title}
    >
      {/* Kalem tarzı başlık çubuğu */}
      <div
        className={`px-3 py-2 text-sm font-semibold select-none ${
          isDark
            ? 'bg-gradient-to-r from-slate-700 to-slate-600 text-white border-b border-gray-600'
            : 'bg-gradient-to-r from-[#0054a6] to-[#0066cc] text-white'
        }`}
      >
        {title}
      </div>

      {/* Form gövdesi — etiket sağa hizalı, alan solda (Kalem LOD) */}
      <div className={`px-4 py-4 ${isDark ? 'bg-gray-800' : 'bg-[#f5f5f5]'}`}>
        <div className="grid grid-cols-[108px_1fr] gap-x-3 gap-y-3 items-center">
          <label className={`text-sm text-right pr-1 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
            Dosya Tipi
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

          <label className={`text-sm text-right pr-1 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
            İşyeri
          </label>
          <select
            value={selectedBranchStoreId}
            onChange={(e) => onBranchChange(e.target.value)}
            className={fieldClass(theme)}
          >
            <option value="" />
            {branchStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>

          <label className={`text-sm text-right pr-1 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
            Kasa
          </label>
          <select
            value={selectedTerminalDeviceId}
            onChange={(e) => onTerminalChange(e.target.value)}
            disabled={!selectedBranchStoreId}
            className={`${fieldClass(theme)} disabled:opacity-60`}
          >
            <option value="" />
            {filteredTerminals.map((t) => (
              <option key={t.deviceId} value={t.deviceId}>
                {t.terminalName}
                {t.computerName ? ` (${t.computerName})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedBranchStoreId && filteredTerminals.length === 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-3 ml-[120px]">
            Bu işyerinde onaylı kasa yok.
          </p>
        )}
      </div>

      {/* Alt çubuk — sol yardım ikonu, sağ Vazgeç + Gönder/Al */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-t ${
          isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-400 bg-[#ececec]'
        }`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title={helpText ?? 'Kalem M-POS eğitim videosu akışı'}
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
