import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  RefreshCw,
  Store,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOptionalFirmaDonem } from '../../contexts/FirmaDonemContext';
import {
  DB_SETTINGS,
  ERP_SETTINGS,
  LOCAL_CONFIG,
  REMOTE_CONFIG,
  getCentralRemotePgConfig,
  resolveHybridSyncConnectionProvider,
  type HybridSyncDirection,
} from '../../services/postgres';
import { runHybridSync, type HybridSyncFlow, type HybridSyncScopeMode } from '../../services/hybridSyncEngine';
import {
  buildSyncFilter,
  getBranchSyncStats,
  listActiveStores,
  listStoreCashiers,
  type BranchCashierOption,
  type BranchStoreOption,
} from '../../services/hybridSyncService';

type CashierScope = 'branch_all' | 'mine_only' | 'selected';

type Props = {
  compact?: boolean;
  darkMode?: boolean;
  /** Login ekranından tek seferlik yön */
  directionOverride?: HybridSyncDirection;
};

export function HybridSyncPanel({ compact = false, darkMode = false, directionOverride }: Props) {
  const { user } = useAuth();
  const firmaCtx = useOptionalFirmaDonem();
  const firmNr = firmaCtx?.selectedFirm?.firm_nr ?? ERP_SETTINGS.firmNr ?? '001';

  const [stores, setStores] = useState<BranchStoreOption[]>([]);
  const [cashiers, setCashiers] = useState<BranchCashierOption[]>([]);
  const [storeId, setStoreId] = useState<string>('');
  const [cashierScope, setCashierScope] = useState<CashierScope>('branch_all');
  const [selectedCashierId, setSelectedCashierId] = useState<string>('');
  const [scopeMode, setScopeMode] = useState<HybridSyncScopeMode>('all');
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [localPending, setLocalPending] = useState(0);
  const [remotePending, setRemotePending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const isHybrid = DB_SETTINGS.activeMode === 'hybrid';

  const effectiveStoreId = storeId || user?.store_id || '';

  const refreshStats = useCallback(async () => {
    if (!isHybrid) return;
    setStatsLoading(true);
    try {
      const filter = buildSyncFilter({
        storeId: effectiveStoreId || null,
        userId: cashierScope === 'mine_only' ? user?.id : cashierScope === 'selected' ? selectedCashierId : null,
        cashierUsername:
          cashierScope === 'mine_only'
            ? user?.username
            : cashierScope === 'selected'
              ? cashiers.find((c) => c.id === selectedCashierId)?.username
              : null,
        scopeCashierOnly: cashierScope !== 'branch_all',
      });
      const s = await getBranchSyncStats(filter);
      setLocalPending(s.localPending);
      setRemotePending(s.remotePending >= 0 ? s.remotePending : 0);
      setLastSync(s.lastSyncedAt);
    } catch (e: unknown) {
      console.warn('[HybridSyncPanel] stats', e);
    } finally {
      setStatsLoading(false);
    }
  }, [isHybrid, effectiveStoreId, cashierScope, selectedCashierId, user, cashiers]);

  useEffect(() => {
    if (!isHybrid) return;
    void (async () => {
      try {
        const list = await listActiveStores(firmNr);
        setStores(list);
        if (!storeId && user?.store_id) setStoreId(user.store_id);
        else if (!storeId && list.length === 1) setStoreId(list[0].id);
      } catch {
        /* PG hazır değil */
      }
    })();
  }, [isHybrid, firmNr, user?.store_id, storeId]);

  useEffect(() => {
    if (!effectiveStoreId) {
      setCashiers([]);
      return;
    }
    void listStoreCashiers(effectiveStoreId)
      .then(setCashiers)
      .catch(() => setCashiers([]));
  }, [effectiveStoreId]);

  useEffect(() => {
    void refreshStats();
    const t = setInterval(() => void refreshStats(), 15_000);
    return () => clearInterval(t);
  }, [refreshStats]);

  const runFlow = async (flow: HybridSyncFlow) => {
    if (!isHybrid) {
      toast.error('Hibrit mod aktif değil. Veritabanı ayarlarından Hybrid seçin.');
      return;
    }
    setLoading(true);
    try {
      const filter = buildSyncFilter({
        storeId: effectiveStoreId || null,
        userId: cashierScope === 'mine_only' ? user?.id : cashierScope === 'selected' ? selectedCashierId : null,
        cashierUsername:
          cashierScope === 'mine_only'
            ? user?.username
            : cashierScope === 'selected'
              ? cashiers.find((c) => c.id === selectedCashierId)?.username
              : null,
        scopeCashierOnly: cashierScope !== 'branch_all',
      });

      const direction =
        directionOverride ??
        (flow === 'send'
          ? 'local_to_remote'
          : flow === 'receive'
            ? 'remote_to_local'
            : 'bidirectional');

      const result = await runHybridSync({
        flow,
        direction,
        scope: scopeMode,
        filter,
        local: LOCAL_CONFIG,
        remote: getCentralRemotePgConfig(),
        connectionProvider: resolveHybridSyncConnectionProvider(),
        remoteRestUrl: DB_SETTINGS.remoteRestUrl,
      });

      if (!result.success) {
        toast.error(result.message || 'Senkron başarısız.');
        return;
      }
      if (result.totalSynced > 0) {
        toast.success(result.message || 'Senkron tamamlandı.');
      } else {
        toast.info(result.message || 'Bekleyen kayıt yok.');
      }
      await refreshStats();
    } catch (e: unknown) {
      toast.error('Senkron hatası: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const card = darkMode
    ? 'border-gray-700 bg-gray-900/60 text-gray-100'
    : 'border-gray-200 bg-white text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const input = darkMode
    ? 'border-gray-600 bg-gray-800 text-gray-100'
    : 'border-gray-300 bg-white text-gray-900';

  if (!isHybrid) {
    return (
      <p className={`text-xs ${muted}`}>
        Şube veri gönder/al yalnızca <strong>Hybrid</strong> bağlantı modunda kullanılabilir.
      </p>
    );
  }

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${card}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
          <RefreshCw className="h-4 w-4 shrink-0" />
          Şube veri senkronu
        </div>
        <button
          type="button"
          disabled={statsLoading}
          onClick={() => void refreshStats()}
          className={`text-[10px] font-semibold underline-offset-2 hover:underline ${muted}`}
        >
          {statsLoading ? '…' : 'Yenile'}
        </button>
      </div>

      <div className={`grid gap-2 text-[10px] ${compact ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <div className={`rounded border px-2 py-1.5 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className={muted}>Yerel bekleyen</div>
          <div className="text-sm font-bold">{localPending}</div>
        </div>
        <div className={`rounded border px-2 py-1.5 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className={muted}>Uzak bekleyen</div>
          <div className="text-sm font-bold">{remotePending >= 0 ? remotePending : '—'}</div>
        </div>
        {!compact && (
          <div className={`rounded border px-2 py-1.5 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className={muted}>Son eşleme</div>
            <div className="text-[10px] font-semibold truncate">
              {lastSync ? new Date(lastSync).toLocaleString('tr-TR') : '—'}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className={`flex items-center gap-1 text-[9px] font-black uppercase ${muted}`}>
          <Store className="h-3 w-3" /> Şube
        </label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className={`w-full rounded border px-2 py-2 text-xs font-semibold ${input}`}
        >
          <option value="">Tüm şubeler (firma)</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className={`flex items-center gap-1 text-[9px] font-black uppercase ${muted}`}>
          <Users className="h-3 w-3" /> Kasiyer kapsamı
        </label>
        <select
          value={cashierScope}
          onChange={(e) => setCashierScope(e.target.value as CashierScope)}
          className={`w-full rounded border px-2 py-2 text-xs font-semibold ${input}`}
        >
          <option value="branch_all">Şube — tüm kasiyerler</option>
          <option value="mine_only">Yalnızca benim kayıtlarım</option>
          <option value="selected">Seçili kasiyer</option>
        </select>
        {cashierScope === 'selected' && (
          <select
            value={selectedCashierId}
            onChange={(e) => setSelectedCashierId(e.target.value)}
            className={`mt-1 w-full rounded border px-2 py-2 text-xs ${input}`}
          >
            <option value="">Kasiyer seçin</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.username}
              </option>
            ))}
          </select>
        )}
        {cashierScope === 'mine_only' && user && (
          <p className={`text-[9px] ${muted} flex items-center gap-1`}>
            <User className="h-3 w-3" />
            {user.full_name || user.username}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className={`text-[9px] font-black uppercase ${muted}`}>Kapsam</label>
        <select
          value={scopeMode}
          onChange={(e) => setScopeMode(e.target.value as HybridSyncScopeMode)}
          className={`w-full rounded border px-2 py-2 text-xs font-semibold ${input}`}
        >
          <option value="all">Tümü — tüm bekleyen kayıtlar</option>
          <option value="pending">Tek parti (max 50)</option>
        </select>
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-3'}`}>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runFlow('send')}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
          Gönder
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void runFlow('receive')}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2.5 text-[10px] font-black uppercase text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
          Al
        </button>
        {!compact && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void runFlow('both')}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2.5 text-[10px] font-black uppercase text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gönder + Al
          </button>
        )}
      </div>

      <p className={`text-[9px] leading-relaxed ${muted}`}>
        {DB_SETTINGS.connectionProvider === 'rest_api' ? (
          <>
            Yerel <strong>PostgreSQL</strong> ↔ uzak <strong>PostgREST API</strong> ({DB_SETTINGS.remoteRestUrl || 'kiracı URL'}).
            Satış/hareketler <code>sync_queue</code> üzerinden aktarılır; uzakta migration 048+049 ve PostgREST şema yenilemesi gerekir.
          </>
        ) : (
          <>
            Web ve masaüstünde çalışır. Satış/hareket değişiklikleri <code>sync_queue</code> kuyruğuna düşer;
            Gönder yerel→merkez, Al merkez→yerel aktarır. Migration 048+049 her iki PG&apos;de gerekli.
          </>
        )}
      </p>
    </div>
  );
}

/** Yönetim modülü tam ekran */
export function HybridSyncModule({ onBack }: { onBack?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
      <div className="border-b bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Şube Veri Senkronu</h1>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Geri
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Şube ve kasiyer bazında merkez ile veri gönder / al (hibrit mod).
        </p>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-2xl">
          <HybridSyncPanel />
        </div>
      </div>
    </div>
  );
}
