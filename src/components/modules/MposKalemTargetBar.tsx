/**
 * Tüm M-POS sekmelerinde paylaşılan İşyeri + Kasa seçimi (Kalem akışı).
 */

import React from 'react';
import { MapPin, Monitor, Send } from 'lucide-react';
import { Button } from '../ui/button';
import type { BranchStoreOption } from '../../services/hybridSyncService';
import type { PosTerminalRegistration } from '../../services/deviceRegistrationService';

type Props = {
  branchStores: BranchStoreOption[];
  selectedBranchStoreId: string;
  onBranchChange: (storeId: string) => void;
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
  branchStores,
  selectedBranchStoreId,
  onBranchChange,
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
        <MapPin className={`w-4 h-4 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
        <span className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
          Aktif Kasa Hedefi
        </span>
        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {targetLabel}
        </span>
      </div>

      <div className="px-4 py-4 flex-1 flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="mpos-target-store"
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                isDark ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              İşyeri
            </label>
            <select
              id="mpos-target-store"
              value={selectedBranchStoreId}
              onChange={(e) => onBranchChange(e.target.value)}
              className={fieldClass(theme)}
            >
              <option value="">İşyeri seçin…</option>
              {branchStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
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
              Kasa
            </label>
            <select
              id="mpos-target-terminal"
              value={selectedTerminalDeviceId}
              onChange={(e) => onTerminalChange(e.target.value)}
              disabled={!selectedBranchStoreId}
              className={`${fieldClass(theme)} disabled:opacity-50`}
            >
              <option value="">Kasa seçin…</option>
              {filteredTerminals.map((t) => (
                <option key={t.deviceId} value={t.deviceId}>
                  {t.terminalName}
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
              Tüm kasalara gönder (işyeri)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
