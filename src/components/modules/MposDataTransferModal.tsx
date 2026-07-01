/**
 * M-POS «Veri Gönder / Al» — POS müşteri modalı düzeninde birleşik aktarım penceresi.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  RefreshCw,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { cn } from '../ui/utils';
import {
  MPOS_SEND_FILE_TYPES,
  type MposSendFileType,
  type MposSendSyncMode,
} from '../../services/mposSendService';
import { MPOS_RECEIVE_FILE_TYPES, type MposReceiveFileType } from '../../services/mposReceiveService';
import {
  getMposTransferPreview,
  type MposTransferPreview,
} from '../../services/mposSyncPreviewService';
import { MposMultiSelectDropdown } from './MposMultiSelectDropdown';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

type TransferStep = {
  id: string;
  title: string;
  detail?: string;
  status: StepStatus;
};

export type MposSendDeviceStatus = {
  deviceId: string;
  terminalName: string;
  storeName?: string;
  status: StepStatus;
  detail?: string;
  recordCount?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  targetLabel: string;
  firmNr: string;
  storeId: string;
  terminalName?: string;
  selectedTerminals?: { deviceId: string; terminalName: string; storeName?: string }[];
  sendDeviceStatuses?: MposSendDeviceStatus[];
  targetBlockReason?: string | null;
  sendFileTypes: MposSendFileType[];
  onSendFileTypesChange: (v: MposSendFileType[]) => void;
  receiveFileTypes: MposReceiveFileType[];
  onReceiveFileTypesChange: (v: MposReceiveFileType[]) => void;
  syncMode: MposSendSyncMode;
  onSyncModeChange: (v: MposSendSyncMode) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  includeProductImages: boolean;
  onIncludeProductImagesChange: (v: boolean) => void;
  isBusy: boolean;
  sendProgress?: { current: number; total: number; label: string } | null;
  onSend: () => Promise<{ success?: number; failed?: number } | void>;
  onReceive: () => Promise<void>;
  onSendAndReceive: () => Promise<void>;
};

function stepIcon(status: StepStatus) {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === 'skipped') return <Circle className="h-4 w-4 text-gray-300" />;
  return <Circle className="h-4 w-4 text-gray-400" />;
}

export function MposDataTransferModal({
  open,
  onClose,
  theme,
  targetLabel,
  firmNr,
  storeId,
  terminalName,
  selectedTerminals = [],
  sendDeviceStatuses = [],
  targetBlockReason = null,
  sendFileTypes,
  onSendFileTypesChange,
  receiveFileTypes,
  onReceiveFileTypesChange,
  syncMode,
  onSyncModeChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  includeProductImages,
  onIncludeProductImagesChange,
  isBusy,
  sendProgress,
  onSend,
  onReceive,
  onSendAndReceive,
}: Props) {
  const isDark = theme === 'dark';
  const [preview, setPreview] = useState<MposTransferPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [activeFlow, setActiveFlow] = useState<'send' | 'receive' | 'both'>('both');
  const [steps, setSteps] = useState<TransferStep[]>([]);
  const [phase, setPhase] = useState<'preview' | 'running' | 'done'>('preview');

  const loadPreview = useCallback(async () => {
    if (!open || !storeId) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const p = await getMposTransferPreview({
        firmNr,
        storeId,
        terminalName,
        sendFileTypes,
        receiveFileTypes,
        syncMode,
        dateFrom,
        dateTo,
      });
      setPreview(p);
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [open, firmNr, storeId, terminalName, sendFileTypes, receiveFileTypes, syncMode, dateFrom, dateTo]);

  useEffect(() => {
    if (open) {
      setPhase('preview');
      setSteps([]);
      void loadPreview();
    }
  }, [open, loadPreview]);

  const selectFlow = (flow: 'send' | 'receive' | 'both') => {
    setActiveFlow(flow);
    if (phase === 'done') {
      setPhase('preview');
      setSteps([]);
    }
  };

  if (!open) return null;

  const transferBlocked = Boolean(targetBlockReason?.trim());
  const canTransfer =
    !transferBlocked &&
    (selectedTerminals.length > 0 ? true : Boolean(storeId?.trim()));
  const multiDevice = selectedTerminals.length > 1;

  const sendHasMasterTypes = sendFileTypes.some((t) => t === 'products' || t === 'customers');
  const sendHasProducts = sendFileTypes.includes('products');

  const fieldClass = isDark
    ? 'bg-gray-800 border-gray-600 text-gray-100'
    : 'bg-white border-gray-300 text-gray-900';

  const runFlow = async (flow: 'send' | 'receive' | 'both') => {
    setActiveFlow(flow);
    setPhase('running');
    const initial: TransferStep[] = [];
    if (flow === 'send' || flow === 'both') {
      initial.push({
        id: 'send',
        title:
          selectedTerminals.length > 1
            ? `Merkezden ${selectedTerminals.length} cihaza gönder`
            : 'Merkezden kasaya gönder',
        status: 'pending',
      });
    }
    if (flow === 'receive' || flow === 'both') {
      initial.push({ id: 'receive', title: 'Kasadan merkeze al', status: 'pending' });
    }
    setSteps(initial);

    const patch = (id: string, patchStep: Partial<TransferStep>) => {
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patchStep } : s)));
    };

    try {
      if (flow === 'send' || flow === 'both') {
        patch('send', {
          status: 'running',
          detail:
            selectedTerminals.length > 1
              ? `${selectedTerminals.length} cihaza gönderiliyor…`
              : 'Gönderiliyor…',
        });
        const sendResult = await onSend();
        const successCount = sendResult?.success ?? sendDeviceStatuses.filter((d) => d.status === 'done').length;
        const failedCount = sendResult?.failed ?? sendDeviceStatuses.filter((d) => d.status === 'error').length;
        patch('send', {
          status: failedCount > 0 && successCount === 0 ? 'error' : 'done',
          detail:
            selectedTerminals.length > 1
              ? `${successCount} başarılı, ${failedCount} hata`
              : failedCount > 0
                ? 'Gönderim hatası'
                : 'Gönderim tamamlandı.',
        });
      }
      if (flow === 'receive' || flow === 'both') {
        patch('receive', { status: 'running', detail: 'Alınıyor…' });
        await onReceive();
        patch('receive', { status: 'done', detail: 'Alım tamamlandı.' });
      }
      setPhase('done');
      await loadPreview();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error', detail: msg } : s)),
      );
    }
  };

  const handleClose = () => {
    if (isBusy) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div
        className={cn(
          'w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl rounded-sm overflow-hidden',
          isDark ? 'bg-gray-900' : 'bg-white',
        )}
        role="dialog"
        aria-label="Veri gönder ve al"
      >
        <div
          className={cn(
            'p-3 border-b flex items-center justify-between shrink-0',
            isDark
              ? 'border-gray-700 bg-gradient-to-r from-gray-700 to-gray-600'
              : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700',
          )}
        >
          <h3 className="text-base text-white flex items-center gap-2 font-semibold">
            <RefreshCw className="w-5 h-5" />
            Veri Gönder / Al
          </h3>
          <button type="button" onClick={handleClose} disabled={isBusy} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={cn('px-4 py-3 border-b text-sm', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-blue-50/40')}>
          <p className={isDark ? 'text-gray-300' : 'text-gray-700'}>
            Hedef: <strong>{targetLabel}</strong>
          </p>
          {selectedTerminals.length > 0 && (
            <p className={cn('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-600')}>
              Seçili cihazlar:{' '}
              {selectedTerminals.map((t) => t.terminalName).join(', ')}
            </p>
          )}
          <p className={cn('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
            Fiyat değişiklikleri merkezde «Değişenler» ile gider; satış/fatura kasadan «Al» veya hibrit kuyruk ile
            merkeze gelir.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                { id: 'send' as const, title: 'Yalnızca gönder', icon: Upload, desc: 'Merkez → kasa' },
                { id: 'receive' as const, title: 'Yalnızca al', icon: Download, desc: 'Kasa → merkez' },
                { id: 'both' as const, title: 'Gönder + al', icon: RefreshCw, desc: 'Çift yönlü' },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = activeFlow === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isBusy || phase === 'running'}
                  onClick={() => selectFlow(opt.id)}
                  className={cn(
                    'p-4 rounded border-2 transition-all text-left',
                    selected
                      ? isDark
                        ? 'border-blue-500 bg-blue-900/30'
                        : 'border-blue-500 bg-blue-50'
                      : isDark
                        ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                        : 'border-gray-200 bg-white hover:border-blue-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={cn('w-4 h-4', selected ? 'text-blue-600' : 'text-gray-500')} />
                        <span className={cn('font-medium text-sm', isDark ? 'text-white' : 'text-gray-900')}>
                          {opt.title}
                        </span>
                      </div>
                      <p className={cn('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{opt.desc}</p>
                    </div>
                    {selected && (
                      <div className="text-blue-600 shrink-0">
                        <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(activeFlow === 'send' || activeFlow === 'both') && (
              <div className={cn('rounded-lg border p-4 space-y-3', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white')}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowUpFromLine className="w-4 h-4 text-blue-600" />
                  Merkezden kasaya
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dosya tipi (çoklu seçim)</Label>
                  <MposMultiSelectDropdown
                    options={MPOS_SEND_FILE_TYPES}
                    value={sendFileTypes}
                    onChange={onSendFileTypesChange}
                    disabled={isBusy}
                    placeholder="Gönderilecek tipleri seçin"
                    className={fieldClass}
                  />
                </div>
                {sendHasMasterTypes && (
                  <>
                    <RadioGroup value={syncMode} onValueChange={(v) => onSyncModeChange(v as MposSendSyncMode)} className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="incremental" id="modal-sync-changed" />
                        <Label htmlFor="modal-sync-changed" className="text-xs cursor-pointer">
                          Değişenler (fiyat vb.)
                        </Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="full" id="modal-sync-all" />
                        <Label htmlFor="modal-sync-all" className="text-xs cursor-pointer">
                          Tümü
                        </Label>
                      </div>
                    </RadioGroup>
                    {syncMode === 'incremental' && (
                      <div className="flex flex-wrap gap-2">
                        <Input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className="h-8 text-xs w-36" />
                        <Input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className="h-8 text-xs w-36" />
                      </div>
                    )}
                  </>
                )}
                {sendHasProducts && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={includeProductImages} onCheckedChange={(c) => onIncludeProductImagesChange(c === true)} />
                    Ürün resmi de aktarılsın
                  </label>
                )}
              </div>
            )}

            {(activeFlow === 'receive' || activeFlow === 'both') && (
              <div className={cn('rounded-lg border p-4 space-y-3', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white')}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
                  Kasadan merkeze
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alınacak veri (çoklu seçim)</Label>
                  <MposMultiSelectDropdown
                    options={MPOS_RECEIVE_FILE_TYPES}
                    value={receiveFileTypes}
                    onChange={onReceiveFileTypesChange}
                    disabled={isBusy}
                    placeholder="Alınacak verileri seçin"
                    className={fieldClass}
                  />
                </div>
                <p className={cn('text-xs leading-relaxed', isDark ? 'text-gray-400' : 'text-gray-600')}>
                  Satış fişleri ve günsonu kasada oluşur; «Al» veya üst çubuk «Senkron» ile merkeze iletilir.
                </p>
              </div>
            )}
          </div>

          <div className={cn('rounded-lg border p-4', isDark ? 'border-gray-700' : 'border-gray-200')}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Aktarım özeti</span>
              <button type="button" onClick={() => void loadPreview()} disabled={loadingPreview || isBusy} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <RefreshCw className={cn('w-3 h-3', loadingPreview && 'animate-spin')} />
                Yenile
              </button>
            </div>
            {loadingPreview ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Özet hesaplanıyor…
              </div>
            ) : preview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(activeFlow === 'send' || activeFlow === 'both') && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Gönderilecek ({preview.sendTotal})</p>
                    {preview.sendLines.map((line) => (
                      <div key={line.key} className={cn('flex justify-between gap-2 p-2 rounded border text-xs', isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-100 bg-gray-50')}>
                        <span>{line.label}</span>
                        <span className="font-semibold tabular-nums">{line.count}</span>
                      </div>
                    ))}
                  </div>
                )}
                {(activeFlow === 'receive' || activeFlow === 'both') && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Alınacak ({preview.receiveTotal})</p>
                    {preview.receiveLines.map((line) => (
                      <div key={line.key} className={cn('flex justify-between gap-2 p-2 rounded border text-xs', isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-100 bg-gray-50')}>
                        <span>{line.label}</span>
                        <span className="font-semibold tabular-nums">{line.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-600">
                {targetBlockReason?.trim() || 'Özet yüklenemedi — firma ve cihaz seçili olmalı.'}
              </p>
            )}
          </div>

          {multiDevice && (activeFlow === 'receive' || activeFlow === 'both') && phase === 'preview' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Alım işlemi yalnızca birincil seçili cihaz ({terminalName || '—'}) için yapılır.
              Çoklu cihazdan alım için her cihazı ayrı seçin veya günsonu alımını kullanın.
            </p>
          )}

          {sendDeviceStatuses.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Cihaz gönderim durumu ({sendDeviceStatuses.length})
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {sendDeviceStatuses.map((device) => (
                  <div
                    key={device.deviceId}
                    className={cn(
                      'flex gap-3 rounded-lg border px-3 py-2',
                      isDark && 'border-gray-700',
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{stepIcon(device.status)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {device.terminalName}
                        {device.storeName ? (
                          <span className="font-normal text-gray-500"> — {device.storeName}</span>
                        ) : null}
                      </p>
                      {device.detail && (
                        <p className="text-xs text-gray-500 mt-0.5 break-words">{device.detail}</p>
                      )}
                      {device.recordCount != null && device.status === 'done' && (
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                          {device.recordCount} kayıt kuyruğa eklendi
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">İşlem adımları</p>
              {steps.map((step, idx) => (
                <div key={step.id} className={cn('flex gap-3 rounded-lg border px-3 py-2.5', isDark && 'border-gray-700')}>
                  <div className="mt-0.5">{stepIcon(step.status)}</div>
                  <div>
                    <p className="text-sm font-medium">{idx + 1}. {step.title}</p>
                    {step.detail && <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {sendProgress && sendProgress.total > 0 && (
            <div className="text-xs text-gray-500">
              <div className="flex justify-between mb-1">
                <span>{sendProgress.label}</span>
                <span>{sendProgress.current}/{sendProgress.total}</span>
              </div>
              <div className={cn('h-1.5 rounded-full overflow-hidden', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round((sendProgress.current / sendProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className={cn('px-4 py-3 border-t shrink-0', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" disabled={isBusy} onClick={handleClose}>
              {phase === 'done' ? 'Kapat' : 'Vazgeç'}
            </Button>
            {activeFlow === 'receive' && (
              <Button
                type="button"
                disabled={isBusy || !canTransfer}
                onClick={() => {
                  if (phase === 'done') {
                    setPhase('preview');
                    setSteps([]);
                  }
                  void runFlow('receive');
                }}
                className="gap-2 bg-sky-700 hover:bg-sky-800 text-white"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {phase === 'done' ? 'Tekrar al' : 'Al'}
              </Button>
            )}
            {activeFlow === 'send' && (
              <Button
                type="button"
                disabled={isBusy || !canTransfer}
                onClick={() => {
                  if (phase === 'done') {
                    setPhase('preview');
                    setSteps([]);
                  }
                  void runFlow('send');
                }}
                className="gap-2"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {phase === 'done' ? 'Tekrar gönder' : 'Gönder'}
              </Button>
            )}
            {activeFlow === 'both' && (
              <Button
                type="button"
                disabled={isBusy || !canTransfer}
                onClick={() => {
                  if (phase === 'done') {
                    setPhase('preview');
                    setSteps([]);
                  }
                  void runFlow('both');
                }}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {phase === 'done' ? 'Tekrar gönder ve al' : 'Gönder ve al'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
