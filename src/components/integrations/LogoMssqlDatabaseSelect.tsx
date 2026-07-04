import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { IS_TAURI } from '../../utils/env';
import {
  canListLogoMssqlDatabases,
  listLogoMssqlDatabases,
  setLogoMssqlDatabase,
  type LogoMssqlConnectionOverride,
} from '../../services/logoMssqlSyncService';

type Mode = 'list' | 'manual';

type Props = {
  value?: string | null;
  onChange?: (db: string) => void;
  /** true ise seçim config.db + localStorage'a yazılır */
  persist?: boolean;
  /** Elle yazma modu (kurulum sihirbazı) */
  allowManual?: boolean;
  /** Kurulumda henüz kaydedilmemiş host/kullanıcı/şifre */
  connectionConfig?: LogoMssqlConnectionOverride;
  variant?: 'light' | 'dark';
  className?: string;
  label?: string;
  disabled?: boolean;
};

export function LogoMssqlDatabaseSelect({
  value,
  onChange,
  persist = true,
  allowManual = false,
  connectionConfig,
  variant = 'light',
  className = '',
  label = 'Logo veritabanı (MSSQL)',
  disabled = false,
}: Props) {
  const [mode, setMode] = useState<Mode>('list');
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualValue, setManualValue] = useState('');

  const connHost = connectionConfig?.erp_host?.trim() ?? '';
  const connUser = connectionConfig?.erp_user?.trim() ?? '';
  const connPass = connectionConfig?.erp_pass ?? '';
  const connectionOverride = useMemo<LogoMssqlConnectionOverride | undefined>(
    () =>
      connHost || connUser || connPass
        ? { erp_host: connHost, erp_user: connUser, erp_pass: connPass }
        : undefined,
    [connHost, connUser, connPass],
  );

  const resolvedValue = (value ?? '').trim();
  const canList = useMemo(
    () => canListLogoMssqlDatabases(connectionOverride),
    [connectionOverride],
  );

  const load = useCallback(async () => {
    if (!IS_TAURI) return;
    if (!canList) {
      setDatabases([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listLogoMssqlDatabases(connectionOverride);
      setDatabases(list);
      if (allowManual && resolvedValue && !list.includes(resolvedValue)) {
        setMode('manual');
        setManualValue(resolvedValue);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      if (allowManual) setMode('manual');
    } finally {
      setLoading(false);
    }
  }, [allowManual, canList, connectionOverride, resolvedValue]);

  const switchToListMode = () => {
    setMode('list');
    if (canList) void load();
  };

  useEffect(() => {
    setDatabases([]);
  }, [connHost, connUser, connPass]);

  useEffect(() => {
    if (mode === 'list' && canList && databases.length === 0 && !loading) {
      void load();
    }
  }, [mode, canList, databases.length, loading, load]);

  useEffect(() => {
    if (resolvedValue) {
      setManualValue(resolvedValue);
      if (allowManual && databases.length > 0 && !databases.includes(resolvedValue)) {
        setMode('manual');
      }
    }
  }, [resolvedValue, allowManual, databases]);

  const applyValue = async (db: string) => {
    const trimmed = db.trim();
    onChange?.(trimmed);
    if (persist && trimmed) {
      try {
        await setLogoMssqlDatabase(trimmed);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleListChange = (db: string) => {
    void applyValue(db);
  };

  const handleManualChange = (db: string) => {
    setManualValue(db);
    onChange?.(db);
  };

  const handleManualBlur = () => {
    void applyValue(manualValue);
  };

  const isDark = variant === 'dark';
  const labelClass = isDark
    ? 'text-[9px] font-black text-blue-200/40 uppercase tracking-widest pl-1'
    : 'text-sm font-medium text-gray-800 flex items-center gap-1.5';
  const inputClass = isDark
    ? 'w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-xs text-white focus:outline-none focus:border-blue-500 transition-all font-bold placeholder:font-medium disabled:opacity-90'
    : 'w-full border border-gray-300 rounded-lg pl-3 pr-3 py-2 text-sm bg-white disabled:bg-gray-100';
  const selectClass = isDark
    ? `${inputClass} pl-3 appearance-none`
    : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-gray-100';
  const hintClass = isDark
    ? 'text-[9px] text-blue-200/30 mt-1 leading-snug pl-1'
    : 'text-[10px] text-gray-500 mt-1 leading-snug';
  const modeBtnClass = (active: boolean) =>
    isDark
      ? `px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest transition-all ${
          active ? 'bg-blue-600 text-white' : 'bg-white/[0.03] text-slate-500 border border-white/5 hover:text-white'
        }`
      : `px-2 py-0.5 rounded text-xs ${active ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'}`;
  const refreshClass = isDark
    ? 'inline-flex items-center gap-1 text-[9px] font-black text-blue-400 hover:text-blue-300 disabled:opacity-40 uppercase tracking-widest'
    : 'inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 disabled:opacity-50';

  const listValue =
    resolvedValue && databases.includes(resolvedValue) ? resolvedValue : databases[0] ?? '';

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className={labelClass}>
          {!isDark && <Database className="h-4 w-4 text-slate-600 shrink-0 inline mr-1" />}
          {label}
        </label>
        <div className="flex items-center gap-2 shrink-0">
          {allowManual ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || !canList}
                className={modeBtnClass(mode === 'list')}
                onClick={switchToListMode}
              >
                Listeden
              </button>
              <button
                type="button"
                disabled={disabled}
                className={modeBtnClass(mode === 'manual')}
                onClick={() => setMode('manual')}
              >
                Elle yaz
              </button>
            </div>
          ) : null}
          {mode === 'list' ? (
            <button
              type="button"
              disabled={loading || disabled || !canList}
              onClick={() => void load()}
              className={refreshClass}
              title="Veritabanlarını yenile"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Yenile
            </button>
          ) : null}
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="relative group">
          {isDark ? (
            <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500/40 group-focus-within:text-blue-500 transition-colors" />
          ) : null}
          <input
            type="text"
            className={inputClass}
            value={manualValue}
            disabled={disabled}
            placeholder="Örn. LOGO, TIGER3, LG_009_2024"
            onChange={(e) => handleManualChange(e.target.value)}
            onBlur={handleManualBlur}
          />
        </div>
      ) : (
        <select
          className={selectClass}
          value={listValue}
          disabled={disabled || loading || !canList || databases.length === 0}
          onChange={(e) => void handleListChange(e.target.value)}
        >
          {!canList ? (
            <option value="">Önce sunucu ve kullanıcı girin</option>
          ) : databases.length === 0 ? (
            <option value="">{loading ? 'Yükleniyor…' : 'Veritabanı bulunamadı'}</option>
          ) : (
            databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))
          )}
        </select>
      )}

      <p className={hintClass}>
        {mode === 'manual'
          ? 'Veritabanı adını elle yazın veya Listeden moduna geçip sunucudaki veritabanlarını yükleyin.'
          : 'SQL Server üzerindeki Logo/Tiger veritabanını seçin. Liste, yukarıdaki sunucu ve SQL kullanıcı bilgilerine göre yüklenir.'}
      </p>
    </div>
  );
}
