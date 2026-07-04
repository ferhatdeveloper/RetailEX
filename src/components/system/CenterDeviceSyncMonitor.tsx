import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { ERP_SETTINGS } from '../../services/postgres';
import {
  formatAckRelativeTime,
  formatTableBreakdownShort,
  getCenterDeviceSyncOverview,
  getRecentInboundAckSessions,
  summarizePriceChanges,
  type CenterDeviceOverviewRow,
  type DeviceSyncAckRow,
} from '../../services/deviceSyncAckService';
import { onlineStateBadgeClass } from '../../services/deviceOnlineStatusService';
import {
  deviceLabel,
  formatPriceDiffShort,
  getPriceDeliveryStatus,
  type PriceDeliveryStatusRow,
  type RegisteredDeviceRow,
} from '../../services/priceChangeSyncService';

type TabId = 'devices' | 'prices' | 'sessions';

type Props = {
  firmNr?: string;
  hours?: number;
  compact?: boolean;
  /** Varsayılan sekme — hibrit senkron ekranında cihazlar değil oturumlar öncelikli */
  defaultTab?: TabId;
  /** true: yalnızca başlık; kullanıcı genişletince içerik yüklenir */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
};

function OnlineBadge({ row }: { row: CenterDeviceOverviewRow }) {
  const { online } = row;
  const pulse = online.state === 'online' && online.source === 'websocket';
  return (
    <span
      title={
        online.source === 'websocket'
          ? `WebSocket — son sinyal: ${formatAckRelativeTime(online.lastSeenAt)}`
          : online.source === 'fallback'
            ? `WS yok; son aktivite (24s yedek): ${formatAckRelativeTime(online.lastSeenAt)}`
            : 'Cihaz kapalı veya sinyal yok'
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        onlineStateBadgeClass(online.state, online.source),
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full shrink-0',
          pulse ? 'bg-emerald-500 animate-pulse' : online.state === 'online' ? 'bg-amber-500' : 'bg-gray-400',
        )}
      />
      {online.label}
    </span>
  );
}
function RiskBadge({ level }: { level: CenterDeviceOverviewRow['riskLevel'] }) {
  if (level === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 border border-red-200 px-2 py-0.5 text-[10px] font-semibold">
        <AlertTriangle className="h-3 w-3" />
        Kritik
      </span>
    );
  }
  if (level === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
        <AlertTriangle className="h-3 w-3" />
        Dikkat
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold">
      <CheckCircle2 className="h-3 w-3" />
      OK
    </span>
  );
}

function DeviceAckBadge({
  device,
  acked,
}: {
  device: RegisteredDeviceRow;
  acked: boolean;
}) {
  const name = device.terminalName || device.storeName || device.deviceId.slice(0, 8);
  return (
    <span
      title={`${name} — ${acked ? 'fiyatı aldı' : 'henüz almadı'}`}
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border',
        acked
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-red-50 text-red-800 border-red-200',
      )}
    >
      {acked ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
      <span className="truncate max-w-[72px]">{name}</span>
    </span>
  );
}

function PriceChangeRow({ row }: { row: PriceDeliveryStatusRow }) {
  const { priceChange, ackedDeviceIds, missingDeviceIds, allDevices } = row;
  const hasMissing = missingDeviceIds.length > 0;
  const productLabel =
    priceChange.productCode || priceChange.productName || priceChange.recordId.slice(0, 8);

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 space-y-1.5',
        hasMissing ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{productLabel}</p>
          <p className="text-[11px] text-gray-700 leading-snug">
            {formatPriceDiffShort(priceChange.priceDiff)}
          </p>
          <p className="text-[10px] text-gray-500">
            {formatAckRelativeTime(priceChange.changedAt)}
          </p>
        </div>
        {hasMissing ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {allDevices.length === 0 ? (
          <span className="text-[10px] text-gray-600">Kayıtlı kasa yok</span>
        ) : (
          allDevices.map((device) => (
            <DeviceAckBadge
              key={device.deviceId}
              device={device}
              acked={ackedDeviceIds.includes(device.deviceId)}
            />
          ))
        )}
      </div>
      {hasMissing && allDevices.length > 0 ? (
        <p className="text-[10px] text-amber-900 leading-snug">
          Almadı: {missingDeviceIds.map((id) => deviceLabel(id, allDevices)).join(', ')} — yanlış
          fiyattan satış riski
        </p>
      ) : null}
    </div>
  );
}

function DeviceOverviewCard({
  row,
  expanded,
  onToggle,
}: {
  row: CenterDeviceOverviewRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { device, lastInbound, pendingPriceChanges, riskLevel } = row;
  const title = device.terminalName || device.deviceId.slice(0, 10);
  const subtitle = [device.storeName, device.computerName || device.hostname]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        riskLevel === 'critical'
          ? 'border-red-200 bg-red-50/30'
          : riskLevel === 'warning'
            ? 'border-amber-200 bg-amber-50/30'
            : 'border-gray-200 bg-white',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-black/[0.02]"
      >
        <div className="mt-0.5 shrink-0 text-gray-500">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-violet-600 shrink-0" />
            <span className="text-sm font-semibold text-gray-900">{title}</span>
            <OnlineBadge row={row} />
            <RiskBadge level={riskLevel} />
          </div>
          {subtitle ? <p className="text-[11px] text-gray-600 mt-0.5 truncate">{subtitle}</p> : null}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <div>
              <span className="text-gray-500 block">Son alım</span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {formatAckRelativeTime(lastInbound?.ackAt)}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Kayıt</span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {lastInbound?.recordCount ?? 0}
                {lastInbound
                  ? ` (+${lastInbound.insertedCount}/~${lastInbound.updatedCount})`
                  : ''}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Fiyatlı ürün</span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {lastInbound?.productsWithPrice ?? 0}
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Bekleyen fiyat</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  pendingPriceChanges > 0 ? 'text-red-700' : 'text-emerald-700',
                )}
              >
                {pendingPriceChanges}
              </span>
            </div>
          </div>
        </div>
      </button>
      {expanded && lastInbound ? (
        <div className="border-t border-gray-200/80 px-3 py-2 space-y-2 bg-white/70 text-[11px]">
          <p>
            <span className="text-gray-500">Tablolar: </span>
            {formatTableBreakdownShort(lastInbound.tableBreakdown)}
          </p>
          <p>
            <span className="text-gray-500">Fiyat diff: </span>
            {summarizePriceChanges(lastInbound.priceChanges, 5)}
          </p>
          <p className="text-gray-600">
            Fiyat ack: {lastInbound.priceAckCount} · Bekleyen (oturum):{' '}
            {lastInbound.pendingPriceCount} · Sürüm: {lastInbound.appVersion || device.appVersion || '—'}
          </p>
          {lastInbound.message ? (
            <p className="text-amber-800 font-medium">{lastInbound.message}</p>
          ) : null}
        </div>
      ) : expanded && !lastInbound ? (
        <div className="border-t px-3 py-2 text-[11px] text-amber-800 bg-amber-50/50">
          Bu cihazdan henüz merkeze alım bildirimi gelmedi.
        </div>
      ) : null}
    </div>
  );
}

function SessionRow({ session }: { session: DeviceSyncAckRow }) {
  const title = session.terminalName || session.deviceId.slice(0, 10);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <span className="text-[10px] text-gray-500 shrink-0">
          {formatAckRelativeTime(session.ackAt)}
        </span>
      </div>
      <p className="text-[11px] text-gray-700">
        {session.recordCount} kayıt · {session.productsWithPrice} fiyatlı ürün ·{' '}
        {session.priceChangeCount} fiyat değişimi · {session.priceAckCount} ack
      </p>
      <p className="text-[10px] text-gray-600">{formatTableBreakdownShort(session.tableBreakdown)}</p>
      {session.priceChanges.length > 0 ? (
        <p className="text-[10px] text-violet-900">{summarizePriceChanges(session.priceChanges, 2)}</p>
      ) : null}
      {session.pendingPriceCount > 0 ? (
        <p className="text-[10px] text-red-700 font-medium">
          Oturum sonrası bekleyen fiyat: {session.pendingPriceCount}
        </p>
      ) : null}
    </div>
  );
}

export function CenterDeviceSyncMonitor({
  firmNr,
  hours = 168,
  compact = false,
  defaultTab = compact ? 'sessions' : 'devices',
  collapsible = false,
  defaultCollapsed = false,
}: Props) {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<CenterDeviceOverviewRow[]>([]);
  const [priceRows, setPriceRows] = useState<PriceDeliveryStatusRow[]>([]);
  const [sessions, setSessions] = useState<DeviceSyncAckRow[]>([]);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const firm = firmNr ?? ERP_SETTINGS.firmNr;
      const [overview, prices, inboundSessions] = await Promise.all([
        getCenterDeviceSyncOverview({ firmNr: firm, hours }),
        getPriceDeliveryStatus({ firmNr: firm, hours, limit: 20 }),
        getRecentInboundAckSessions({ firmNr: firm, hours, limit: 25 }),
      ]);
      setDevices(overview);
      setPriceRows(prices);
      setSessions(inboundSessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDevices([]);
      setPriceRows([]);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [firmNr, hours]);

  useEffect(() => {
    if (collapsible && collapsed) return;
    void load();
  }, [load, collapsible, collapsed]);

  const stats = useMemo(() => {
    const total = devices.length;
    const atRisk = devices.filter((d) => d.riskLevel !== 'ok').length;
    const wsOnline = devices.filter(
      (d) => d.online.state === 'online' && d.online.source === 'websocket',
    ).length;
    const fallbackOnline = devices.filter(
      (d) => d.online.state === 'online' && d.online.source === 'fallback',
    ).length;
    const offline = devices.filter((d) => d.online.state === 'offline').length;
    const pendingPrices = devices.reduce((s, d) => s + d.pendingPriceChanges, 0);
    const missingProducts = priceRows.filter((r) => r.missingDeviceIds.length > 0).length;
    return {
      total,
      atRisk,
      wsOnline,
      fallbackOnline,
      offline,
      pendingPrices,
      missingProducts,
    };
  }, [devices, priceRows]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'devices', label: 'Cihazlar', count: devices.length },
    { id: 'prices', label: 'Fiyat teslimat', count: stats.missingProducts || undefined },
    { id: 'sessions', label: 'Alım oturumları', count: sessions.length },
  ];

  return (
    <div
      className={cn(
        'rounded-lg border border-violet-200 bg-gradient-to-b from-violet-50/80 to-white space-y-3',
        compact ? 'p-2' : 'p-3',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-900 flex items-center gap-1.5">
            {collapsible ? (
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="inline-flex items-center gap-1 hover:text-violet-700"
              >
                {collapsed ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <Monitor className="h-3.5 w-3.5" />
                Merkez cihaz senkron izleme
              </button>
            ) : (
              <>
                <Monitor className="h-3.5 w-3.5" />
                Merkez cihaz senkron izleme
              </>
            )}
          </p>
          <p className="text-[10px] text-violet-800 mt-0.5 leading-snug">
            WS canlı · 24s yedek aktivite · fiyat teslimat · otomatik ack
          </p>
        </div>
        {!collapsed ? (
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 rounded p-1 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            title="Yenile"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <p className="text-[10px] text-violet-700">
          Cihaz ve fiyat izleme için genişletin (varsayılan sekme: alım oturumları).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded-md border border-gray-200 bg-white px-2 py-1.5">
              <p className="text-[10px] text-gray-500">Kayıtlı cihaz</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">{stats.total}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-2 py-1.5">
              <p className="text-[10px] text-emerald-800">Canlı (WS)</p>
              <p className="text-lg font-bold text-emerald-900 tabular-nums">{stats.wsOnline}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5">
              <p className="text-[10px] text-amber-800">Yedek (24s)</p>
              <p className="text-lg font-bold text-amber-950 tabular-nums">{stats.fallbackOnline}</p>
            </div>
            <div className="rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5">
              <p className="text-[10px] text-gray-600">Kapalı</p>
              <p className="text-lg font-bold text-gray-800 tabular-nums">{stats.offline}</p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/50 px-2 py-1.5">
              <p className="text-[10px] text-red-800">Bekleyen fiyat</p>
              <p className="text-lg font-bold text-red-900 tabular-nums">{stats.pendingPrices}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-violet-100 pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                  tab === t.id
                    ? 'bg-violet-600 text-white'
                    : 'text-violet-800 hover:bg-violet-100',
                )}
              >
                {t.label}
                {t.count != null && t.count > 0 ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>

          {error ? (
            <p className="text-xs text-red-700">{error}</p>
          ) : loading && devices.length === 0 && priceRows.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-gray-600 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Merkez verileri yükleniyor…
            </div>
          ) : (
            <div className={cn('overflow-y-auto space-y-2', compact ? 'max-h-56' : 'max-h-72')}>
              {tab === 'devices' && (
                <>
                  {devices.length === 0 ? (
                    <p className="text-xs text-gray-600">
                      Onaylı kasa cihazı bulunamadı (085 migration + terminal kaydı gerekli).
                    </p>
                  ) : (
                    devices.map((row) => (
                      <DeviceOverviewCard
                        key={row.device.deviceId}
                        row={row}
                        expanded={expandedDevice === row.device.deviceId}
                        onToggle={() =>
                          setExpandedDevice((prev) =>
                            prev === row.device.deviceId ? null : row.device.deviceId,
                          )
                        }
                      />
                    ))
                  )}
                </>
              )}

              {tab === 'prices' && (
                <>
                  {priceRows.length === 0 ? (
                    <p className="text-xs text-gray-600">Son {hours} saatte fiyat değişimi yok.</p>
                  ) : (
                    priceRows.map((row) => <PriceChangeRow key={row.priceChange.id} row={row} />)
                  )}
                </>
              )}

              {tab === 'sessions' && (
                <>
                  {sessions.length === 0 ? (
                    <p className="text-xs text-gray-600">
                      Henüz merkeze alım oturumu bildirimi gelmedi. Cihaz senkron aldığında otomatik
                      kaydedilir.
                    </p>
                  ) : (
                    sessions.map((s) => <SessionRow key={s.id} session={s} />)
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** @deprecated CenterDeviceSyncMonitor kullanın */
export { CenterDeviceSyncMonitor as DevicePriceDeliveryPanel };
