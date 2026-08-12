/**
 * JRetail Basic «Günsonu Al» — işyeri, çoklu kasa, iş günü tarihi.
 */

import React, { useEffect, useState } from 'react';
import { Calendar, Download, Monitor, RefreshCw, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { BranchStoreOption } from '../../services/hybridSyncService';
import type { PosTerminalRegistration } from '../../services/deviceRegistrationService';

type Props = {
  open: boolean;
  onClose: () => void;
  branchStores: BranchStoreOption[];
  filteredTerminals: PosTerminalRegistration[];
  initialStoreId?: string;
  initialTerminalIds?: string[];
  isBusy: boolean;
  onSubmit: (opts: {
    storeId: string;
    businessDate: string;
    terminalDeviceIds: string[];
  }) => void;
  theme: 'light' | 'dark';
};

export function MposDayEndDialog({
  open,
  onClose,
  branchStores,
  filteredTerminals,
  initialStoreId = '',
  initialTerminalIds = [],
  isBusy,
  onSubmit,
  theme,
}: Props) {
  const isDark = theme === 'dark';
  const [storeId, setStoreId] = useState(initialStoreId);
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTerminalIds);

  useEffect(() => {
    if (!open) return;
    setStoreId(initialStoreId);
    setSelectedIds(initialTerminalIds);
    setBusinessDate(new Date().toISOString().slice(0, 10));
  }, [open, initialStoreId, initialTerminalIds]);

  const terminalsForStore = filteredTerminals.filter((t) => t.storeId === storeId);

  const toggleTerminal = (deviceId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, deviceId])] : prev.filter((id) => id !== deviceId),
    );
  };

  if (!open) return null;

  const fieldClass = isDark
    ? 'bg-gray-700 border-gray-500 text-gray-100'
    : 'bg-white border-gray-400 text-gray-900';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-[440px] border shadow-xl rounded-sm overflow-hidden ${
          isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-400 bg-[#ececec]'
        }`}
        role="dialog"
        aria-label="Günsonu Al"
      >
        <div
          className={`px-3 py-2 text-sm font-semibold flex items-center justify-between ${
            isDark ? 'bg-slate-700 text-white' : 'bg-gradient-to-r from-[#0054a6] to-[#0066cc] text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Günsonu Al
          </span>
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/10 rounded" aria-label="Kapat">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`px-4 py-4 space-y-3 ${isDark ? 'bg-gray-800' : 'bg-[#f5f5f5]'}`}>
          <div className="grid grid-cols-[108px_1fr] gap-x-3 gap-y-3 items-center">
            <Label className={`text-sm text-right ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
              İşyeri
            </Label>
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setSelectedIds([]);
              }}
              className={`h-8 w-full border px-2 text-sm rounded-sm ${fieldClass}`}
            >
              <option value="" />
              {branchStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>

            <Label className={`text-sm text-right ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
              İş günü
            </Label>
            <Input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {storeId ? (
            <div
              className={`ml-[120px] space-y-2 rounded border p-2 ${
                isDark ? 'border-gray-600 bg-gray-900/40' : 'border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium flex items-center gap-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  <Monitor className="w-3.5 h-3.5" />
                  Kasalar
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/50 text-blue-600"
                    onClick={() => setSelectedIds(terminalsForStore.map((t) => t.deviceId))}
                  >
                    Tümünü seç
                  </button>
                  <button
                    type="button"
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${isDark ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'}`}
                    onClick={() => setSelectedIds([])}
                  >
                    Temizle
                  </button>
                </div>
              </div>
              {terminalsForStore.length === 0 ? (
                <p className="text-xs text-amber-600">Bu işyerinde onaylı kasa yok.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {terminalsForStore.map((t) => (
                    <label key={t.deviceId} className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox
                        checked={selectedIds.includes(t.deviceId)}
                        onCheckedChange={(c) => toggleTerminal(t.deviceId, c === true)}
                      />
                      <span>{t.terminalName}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div
          className={`flex justify-end gap-2 px-3 py-2 border-t ${
            isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-400 bg-[#ececec]'
          }`}
        >
          <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={onClose} className="h-8 min-w-[88px]">
            Vazgeç
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isBusy || !storeId || !businessDate || selectedIds.length === 0}
            className="h-8 min-w-[88px] gap-1.5 bg-sky-700 hover:bg-sky-800 text-white"
            onClick={() =>
              onSubmit({ storeId, businessDate, terminalDeviceIds: selectedIds })
            }
          >
            {isBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Al
          </Button>
        </div>
      </div>
    </div>
  );
}
