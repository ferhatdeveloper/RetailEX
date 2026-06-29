/**
 * Tüm M-POS sekmelerinde paylaşılan Firma + Cihaz seçimi (Kalem akışı).
 */

import React from 'react';
import { Building2, Monitor, Send } from 'lucide-react';
import { Button } from '../ui/button';
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
  targetLabel: string;
  theme: 'light' | 'dark';
  onBulkSendAll?: () => void;
  bulkSendDisabled?: boolean;
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
  targetLabel,
  theme,
  onBulkSendAll,
  bulkSendDisabled,
  className = '',
}: Props) {
  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-xl border shadow-sm flex flex-col h-full ${className} ${
        isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-2 px-4 py-2.5 border-b ${
          isDark ? 'border-gray-700 bg-gray-800/80' : 'border-gray-100 bg-gray-50'
        }`}
      >
        <Building2 className={`w-4 h-4 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
        <span className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Hedef firma ve cihaz
        </span>
        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {targetLabel}
        </span>
      </div>

      <div className="px-4 py-4 flex-1 flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              htmlFor="mpos-target-terminal"
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Cihazlar
            </label>
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
          </div>
        </div>

        {onBulkSendAll && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 text-xs gap-1.5"
              disabled={bulkSendDisabled}
              onClick={onBulkSendAll}
            >
              <Send className="w-3.5 h-3.5" />
              Tüm cihazlara gönder (firma)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
