import { useCallback, useEffect, useState } from 'react';
import { Loader2, Monitor, Send } from 'lucide-react';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  collectDesktopDeviceMetadata,
  getDesktopTerminalStatus,
  registerDesktopTerminal,
  type DesktopDeviceInfo,
  type PosTerminalStatus,
} from '../../services/deviceRegistrationService';
import { DeviceRegistrationInfoCard } from './DeviceRegistrationInfoCard';

type Props = {
  darkMode?: boolean;
  onRegistered?: (status: PosTerminalStatus) => void;
};

export function DeviceRegistrationForm({ darkMode = false, onRegistered }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DesktopDeviceInfo | null>(null);
  const [terminalName, setTerminalName] = useState('');
  const [status, setStatus] = useState<PosTerminalStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!IS_TAURI) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const info = await collectDesktopDeviceMetadata();
      setDeviceInfo(info);
      setTerminalName(info.terminalName || info.deviceId || '');
      const st = await getDesktopTerminalStatus(info.deviceId);
      setStatus(st.status);
      setStatusMessage(st.message);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegister = async () => {
    const name = terminalName.trim();
    if (!name) {
      toast.error('Cihaz / kasa adı zorunludur.');
      return;
    }
    if (!deviceInfo) return;

    setSubmitting(true);
    try {
      if (IS_TAURI) {
        const { invoke } = await import('@tauri-apps/api/core');
        const cfg = (await invoke('get_app_config')) as Record<string, unknown>;
        await invoke('save_app_config', {
          config: { ...cfg, terminal_name: name, device_id: deviceInfo.deviceId },
        });
      }

      const result = await registerDesktopTerminal({
        deviceId: deviceInfo.deviceId,
        terminalName: name,
        storeId: deviceInfo.storeId,
        firmNr: deviceInfo.firmNr,
        role: deviceInfo.role,
        hostname: deviceInfo.computerName || deviceInfo.hostname,
        osUser: deviceInfo.osUser,
        deviceInfo: { ...deviceInfo, terminalName: name },
      });

      setStatus(result.status);
      setStatusMessage(result.message);
      if (result.ok) {
        toast.success(result.message || 'Cihaz kaydı merkeze iletildi.');
      } else {
        toast.error(result.message || 'Cihaz kaydı başarısız.');
      }
      onRegistered?.(result.status);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setStatusMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!IS_TAURI) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cihaz bilgileri okunuyor…
      </div>
    );
  }

  const showForm = status !== 'approved';

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        darkMode ? 'border-amber-800/50 bg-amber-950/20' : 'border-amber-200 bg-amber-50/80'
      }`}
    >
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-xs font-black uppercase tracking-widest text-amber-800 dark:text-amber-200">
          Cihaz kaydı (merkez onayı)
        </span>
      </div>

      {deviceInfo && (
        <DeviceRegistrationInfoCard
          device={{ ...deviceInfo, terminalName: terminalName || deviceInfo.terminalName }}
          compact
          showStatus={status === 'pending'}
          statusLabel="Onay bekliyor"
        />
      )}

      {showForm && (
        <>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Cihaz / kasa adı *
            </label>
            <input
              type="text"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
              placeholder="Örn: KASA-01, Şube-1-Merkez"
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                darkMode
                  ? 'border-gray-700 bg-gray-900 text-white'
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
              autoComplete="off"
            />
            <p className="text-[10px] text-slate-500">
              Merkez panelinde bu isimle görünür; onay sonrası giriş yapabilirsiniz.
            </p>
          </div>

          <button
            type="button"
            disabled={submitting || !terminalName.trim()}
            onClick={() => void handleRegister()}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber-600 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Merkeze kaydet
          </button>
        </>
      )}

      {statusMessage && (
        <p className={`text-[10px] ${status === 'approved' ? 'text-emerald-700' : 'text-amber-800'}`}>
          {statusMessage}
        </p>
      )}
    </div>
  );
}
