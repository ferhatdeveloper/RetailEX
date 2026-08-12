/**
 * Tüm M-POS sekmelerinde paylaşılan Firma + Cihaz seçimi (Kalem akışı).
 */

import React from 'react';
import { Building2, Monitor, Send, Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import type { PosTerminalRegistration } from '../../services/deviceRegistrationService';

export type MposFirmOption = {
  firmNr: string;
  name: string;
};

type Props = {
  firms: MposFirmOption[];
  selectedFirmNr: string;
  onFirmChange: (firmNr: string) => void;
  selectedTerminalDeviceId: string;
  onTerminalChange: (deviceId: string) => void;
  filteredTerminals: PosTerminalRegistration[];
  /** Çoklu cihaz seçimi */
  selectedTerminalDeviceIds?: string[];
  onTerminalSelectionChange?: (deviceIds: string[]) => void;
  targetLabel: string;
  theme: 'light' | 'dark';
  onBulkSendAll?: () => void;
  bulkSendDisabled?: boolean;
  onOpenTransfer?: () => void;
  transferDisabled?: boolean;
  transferHint?: string;
  className?: string;
};

const fieldClass = (theme: 'light' | 'dark') =>
  `h-9 w-full border px-3 text-sm rounded-md ${
    theme === 'dark'
      ? 'bg-gray-700 border-gray-600 text-gray-100'
      : 'bg-white border-gray-300 text-gray-900'
  }`;

export function MposKalemTargetBar({
  firms,
  selectedFirmNr,
  onFirmChange,
  selectedTerminalDeviceId,
  onTerminalChange,
  filteredTerminals,
  selectedTerminalDeviceIds = [],
  onTerminalSelectionChange,
  targetLabel,
  theme,
  onBulkSendAll,
  bulkSendDisabled,
  onOpenTransfer,
  transferDisabled,
  transferHint,
  className = '',
}: Props) {
  const isDark = theme === 'dark';
  const multiSelect = Boolean(onTerminalSelectionChange);

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

  const allTerminalsSelected =
    filteredTerminals.length > 0 &&
    filteredTerminals.every((t) => selectedTerminalDeviceIds.includes(t.deviceId));
  const someTerminalsSelected =
    selectedTerminalDeviceIds.length > 0 && !allTerminalsSelected;

  const toggleSelectAllTerminals = () => {
    if (allTerminalsSelected) clearAllTerminals();
    else selectAllTerminals();
  };

  return (
    <div
      className={`w-full rounded-xl border shadow-sm overflow-hidden flex flex-col h-full min-h-[320px] ${className} ${
        isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'
      }`}
      role="region"
      aria-label="Hedef firma ve kasa"
    >
      <div
        className={`px-4 py-2.5 text-sm font-semibold shrink-0 ${
          isDark
            ? 'bg-slate-700 text-white border-b border-gray-600'
            : 'bg-[#0054a6] text-white border-b border-[#004080]'
        }`}
      >
        Hedef firma ve kasa
      </div>

      <div className={`px-4 py-4 flex-1 flex flex-col gap-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <p className={`text-xs leading-snug ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {targetLabel}
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="mpos-target-firm"
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Firma
            </label>
            <select
              id="mpos-target-firm"
              value={selectedFirmNr}
              onChange={(e) => onFirmChange(e.target.value)}
              className={fieldClass(theme)}
            >
              <option value="">Firma seçin…</option>
              {firms.map((f) => (
                <option key={f.firmNr} value={f.firmNr}>
                  {f.name} ({f.firmNr})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Kasalar
            </label>

            {multiSelect ? (
              <div
                className={`space-y-2 rounded-md border p-3 ${
                  isDark ? 'border-gray-600 bg-gray-900/50' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Çoklu seçim
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={selectAllTerminals}
                      disabled={!selectedFirmNr || filteredTerminals.length === 0}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/50 text-blue-600 dark:text-blue-400 disabled:opacity-50"
                    >
                      Tümünü seç
                    </button>
                    <button
                      type="button"
                      onClick={clearAllTerminals}
                      disabled={selectedTerminalDeviceIds.length === 0}
                      className={`text-[10px] px-1.5 py-0.5 rounded border disabled:opacity-50 ${
                        isDark ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'
                      }`}
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {!selectedFirmNr ? (
                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    Önce firma seçin.
                  </p>
                ) : filteredTerminals.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Bu firmada onaylı kasa yok.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <label
                      className={`flex items-center gap-2 cursor-pointer text-xs font-medium rounded px-1 py-1 border-b ${
                        isDark ? 'border-gray-700 text-gray-200' : 'border-gray-100 text-gray-800'
                      }`}
                    >
                      <Checkbox
                        checked={
                          allTerminalsSelected
                            ? true
                            : someTerminalsSelected
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={() => toggleSelectAllTerminals()}
                      />
                      Tümünü seç
                    </label>
                    <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {filteredTerminals.map((t) => {
                      const checked = selectedTerminalDeviceIds.includes(t.deviceId);
                      const missingStore = !t.storeId?.trim();
                      return (
                        <label
                          key={t.deviceId}
                          className={`flex items-start gap-2 cursor-pointer text-xs rounded px-1 py-0.5 ${
                            checked
                              ? isDark
                                ? 'bg-blue-900/30'
                                : 'bg-blue-50'
                              : ''
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => toggleTerminal(t.deviceId, c === true)}
                            className="mt-0.5"
                          />
                          <span className="flex-1 min-w-0">
                            <span className={isDark ? 'text-gray-200' : 'text-gray-800'}>
                              {t.terminalName}
                              {t.storeName ? ` — ${t.storeName}` : ''}
                              {t.computerName ? ` (${t.computerName})` : ''}
                            </span>
                            {missingStore && (
                              <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                                Mağaza atanmamış
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                    </div>
                  </div>
                )}

                {selectedTerminalDeviceIds.length > 0 && (
                  <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {selectedTerminalDeviceIds.length} kasa seçili
                  </p>
                )}
              </div>
            ) : (
              <select
                id="mpos-target-terminal"
                value={selectedTerminalDeviceId}
                onChange={(e) => onTerminalChange(e.target.value)}
                disabled={!selectedFirmNr}
                className={`${fieldClass(theme)} disabled:opacity-50`}
              >
                <option value="">Cihaz seçin…</option>
                {filteredTerminals.map((t) => (
                  <option key={t.deviceId} value={t.deviceId}>
                    {t.terminalName}
                    {t.storeName ? ` — ${t.storeName}` : ''}
                    {t.computerName ? ` (${t.computerName})` : ''}
                  </option>
                ))}
              </select>
            )}

            {!multiSelect && selectedFirmNr && filteredTerminals.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Bu firmada onaylı cihaz yok.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {onBulkSendAll || onOpenTransfer ? (
        <div
          className={`px-4 py-3 border-t shrink-0 space-y-2 ${
            isDark ? 'border-gray-600 bg-gray-900/80' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onBulkSendAll ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                disabled={bulkSendDisabled}
                onClick={onBulkSendAll}
              >
                <Send className="w-3.5 h-3.5" />
                Tüm kasalara gönder (firma)
              </Button>
            ) : null}
            {onOpenTransfer ? (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={transferDisabled}
                onClick={onOpenTransfer}
              >
                <Upload className="w-3.5 h-3.5" />
                Veri Gönder / Al…
              </Button>
            ) : null}
          </div>
          {transferHint ? (
            <p
              className={`text-xs text-right leading-snug ${
                transferHint.includes('Mağaza') || transferHint.includes('bağlantı')
                  ? 'text-amber-600 dark:text-amber-400'
                  : isDark
                    ? 'text-gray-500'
                    : 'text-gray-500'
              }`}
            >
              {transferHint}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
