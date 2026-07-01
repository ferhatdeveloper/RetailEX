import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '../ui/utils';
import { ERP_SETTINGS } from '../../services/postgres';
import {
  deviceLabel,
  formatPriceDiffShort,
  getPriceDeliveryStatus,
  type PriceDeliveryStatusRow,
  type RegisteredDeviceRow,
} from '../../services/priceChangeSyncService';

type Props = {
  firmNr?: string;
  hours?: number;
  limit?: number;
  compact?: boolean;
};

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
      {acked ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" />
      ) : (
        <XCircle className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate max-w-[72px]">{name}</span>
    </span>
  );
}

function PriceChangeRow({ row }: { row: PriceDeliveryStatusRow }) {
  const { priceChange, ackedDeviceIds, missingDeviceIds, allDevices } = row;
  const hasMissing = missingDeviceIds.length > 0;
  const productLabel =
    priceChange.productCode || priceChange.productName || priceChange.recordId.slice(0, 8);
  const diffText = formatPriceDiffShort(priceChange.priceDiff);

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
          <p className="text-[11px] text-gray-700 leading-snug">{diffText}</p>
        </div>
        {hasMissing ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {allDevices.length === 0 ? (
          <span className="text-[10px] text-gray-600">Kayıtlı kasa cihazı yok</span>
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
          Almadı:{' '}
          {missingDeviceIds.map((id) => deviceLabel(id, allDevices)).join(', ')}
          {' — '}
          yanlış fiyattan satış riski
        </p>
      ) : null}
    </div>
  );
}

export function DevicePriceDeliveryPanel({
  firmNr,
  hours = 168,
  limit = 15,
  compact = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PriceDeliveryStatusRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPriceDeliveryStatus({
        firmNr: firmNr ?? ERP_SETTINGS.firmNr,
        hours,
        limit,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [firmNr, hours, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const missingCount = rows.filter((r) => r.missingDeviceIds.length > 0).length;

  return (
    <div
      className={cn(
        'rounded-lg border border-violet-200 bg-violet-50/50 space-y-2',
        compact ? 'p-2' : 'p-3',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">
            Fiyat teslimat durumu
          </p>
          <p className="text-[10px] text-violet-800 mt-0.5">
            Merkezde değişen fiyat — hangi cihaz aldı / almadı
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded p-1 text-violet-700 hover:bg-violet-100 disabled:opacity-50"
          title="Yenile"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-700">{error}</p>
      ) : loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-gray-600 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Fiyat değişimleri yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-600 py-1">
          Son {hours} saatte fiyat değişimi kaydı yok (084 migration gerekli).
        </p>
      ) : (
        <>
          {missingCount > 0 ? (
            <p className="text-[11px] font-medium text-amber-900">
              {missingCount} üründe en az bir cihaz fiyatı henüz almadı
            </p>
          ) : (
            <p className="text-[11px] font-medium text-emerald-800">
              Tüm kayıtlı cihazlar son fiyat değişimlerini aldı
            </p>
          )}
          <div className={cn('space-y-2', compact ? 'max-h-48' : 'max-h-64', 'overflow-y-auto')}>
            {rows.map((row) => (
              <PriceChangeRow key={row.priceChange.id} row={row} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
