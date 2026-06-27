/**
 * Tüm M-POS sekmelerinde paylaşılan İşyeri + Kasa seçimi (Kalem akışı).
 */

import React from 'react';
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
};

const fieldClass = (theme: 'light' | 'dark') =>
  `h-8 w-full border px-2 text-sm rounded-sm ${
    theme === 'dark'
      ? 'bg-gray-700 border-gray-500 text-gray-100'
      : 'bg-white border-gray-400 text-gray-900'
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
}: Props) {
  const isDark = theme === 'dark';

  return (
    <div
      className={`border shadow-sm max-w-[640px] ${
        isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-400 bg-[#f5f5f5]'
      }`}
    >
      <div
        className={`px-3 py-1.5 text-xs font-semibold ${
          isDark ? 'bg-slate-700 text-white' : 'bg-[#0066cc] text-white'
        }`}
      >
        Aktif Kasa Hedefi
      </div>
      <div className="px-3 py-3">
        <div className="grid grid-cols-1 sm:grid-cols-[108px_1fr_108px_1fr] gap-x-3 gap-y-2 items-center">
          <label className={`text-sm text-right ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
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
          <label className={`text-sm text-right ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
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
              </option>
            ))}
          </select>
        </div>
        <p className={`text-xs mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Hedef: <strong>{targetLabel}</strong>
        </p>
        {onBulkSendAll && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-8 text-xs rounded-sm"
            disabled={bulkSendDisabled}
            onClick={onBulkSendAll}
          >
            Tüm kasalara gönder (işyeri)
          </Button>
        )}
      </div>
    </div>
  );
}
