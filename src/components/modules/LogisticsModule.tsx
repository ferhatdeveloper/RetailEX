import React, { useCallback, useEffect, useState } from 'react';
import {
  Truck,
  Package,
  MapPin,
  RefreshCw,
  Search,
  Plus,
  ChevronRight,
  X,
} from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import {
  logisticsService,
  DELIVERY_STATUS_LABELS,
  nextStatuses,
  type DeliveryStatus,
  type LogisticsDelivery,
  type LogisticsDeliveryDetail,
  type LogisticsCourier,
  type LogisticsVehicle,
} from '../../services/logisticsService';
import { invoicesAPI } from '../../services/api/invoices';
import type { Invoice } from '../../core/types';

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'delivered':
      return 'bg-green-100 text-green-700';
    case 'in_transit':
    case 'loading':
      return 'bg-blue-100 text-blue-700';
    case 'picking':
    case 'packing':
    case 'planned':
      return 'bg-amber-100 text-amber-800';
    case 'cancelled':
    case 'returned':
      return 'bg-red-100 text-red-700';
    case 'partial':
    case 'absent':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function labelStatus(s: string): string {
  return DELIVERY_STATUS_LABELS[s as DeliveryStatus] || s;
}

export function LogisticsModule() {
  const [deliveries, setDeliveries] = useState<LogisticsDelivery[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogisticsDeliveryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [couriers, setCouriers] = useState<LogisticsCourier[]>([]);
  const [vehicles, setVehicles] = useState<LogisticsVehicle[]>([]);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, st, c, v] = await Promise.all([
        logisticsService.listDeliveries({
          status: statusFilter,
          search: search.trim() || undefined,
          limit: 300,
        }),
        logisticsService.getDeliveryStats(),
        logisticsService.listCouriers().catch(() => []),
        logisticsService.listVehicles().catch(() => []),
      ]);
      setDeliveries(list);
      setStats(st);
      setCouriers(c);
      setVehicles(v);
    } catch (e: any) {
      setError(e?.message || String(e) || 'Teslimat listesi yüklenemedi');
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const d = await logisticsService.getDelivery(id);
      setDetail(d);
    } catch (e: any) {
      setError(e?.message || 'Detay yüklenemedi');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const doTransition = async (to: DeliveryStatus) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const updated = await logisticsService.transitionStatus(selectedId, to);
      setDetail(updated);
      await loadList();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const doAssign = async (patch: { courier_id?: string | null; vehicle_id?: string | null }) => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const courier = patch.courier_id
        ? couriers.find((c) => c.id === patch.courier_id)
        : undefined;
      await logisticsService.assignCourierVehicle(selectedId, {
        ...patch,
        driver_name: courier?.full_name || detail?.driver_name || null,
      });
      await openDetail(selectedId);
      await loadList();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="bg-gradient-to-r from-lime-600 to-lime-700 text-white px-4 py-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4" />
            <h2 className="text-sm font-semibold">Teslimat Yönetimi</h2>
            <span className="text-lime-100 text-[10px]">• {stats.total || deliveries.length} kayıt</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadList()}
              className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 text-[10px] rounded"
              title="Yenile"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 px-2 py-1 bg-white text-lime-800 hover:bg-lime-50 text-[10px] rounded font-medium"
            >
              <Plus className="w-3 h-3" />
              Siparişten Oluştur
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded flex justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="bg-white border border-gray-300 rounded">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Özet</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200">
            <SummaryCell icon={<Package className="w-4 h-4 text-amber-600" />} label="Hazırlık" value={(stats.draft || 0) + (stats.planned || 0) + (stats.picking || 0) + (stats.packing || 0)} />
            <SummaryCell icon={<Truck className="w-4 h-4 text-blue-600" />} label="Yolda" value={(stats.in_transit || 0) + (stats.loading || 0)} />
            <SummaryCell icon={<MapPin className="w-4 h-4 text-green-600" />} label="Teslim" value={(stats.delivered || 0) + (stats.partial || 0)} />
            <SummaryCell icon={<Package className="w-4 h-4 text-red-600" />} label="İptal / İade" value={(stats.cancelled || 0) + (stats.returned || 0) + (stats.absent || 0)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadList();
              }}
              placeholder="Teslimat / sipariş / müşteri ara…"
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="all">Tüm durumlar</option>
            {Object.entries(DELIVERY_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadList()}
            className="text-xs px-3 py-1.5 bg-lime-600 text-white rounded hover:bg-lime-700"
          >
            Filtrele
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 min-h-0">
          <div className="lg:col-span-3 bg-white border border-gray-300 overflow-hidden">
            <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
              <h3 className="text-[11px] text-gray-700">Teslimat Listesi</h3>
            </div>
            <div className="overflow-auto max-h-[calc(100vh-280px)]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-[#E3F2FD]">
                  <tr className="border-b border-gray-300">
                    <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r">NO</th>
                    <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r">SİPARİŞ</th>
                    <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r">MÜŞTERİ</th>
                    <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r">TARİH</th>
                    <th className="px-2 py-1 text-center text-[10px] text-gray-700">DURUM</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">
                        Yükleniyor…
                      </td>
                    </tr>
                  )}
                  {!loading && deliveries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-gray-500">
                        Kayıt yok. Siparişten teslimat oluşturun.
                      </td>
                    </tr>
                  )}
                  {deliveries.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => void openDetail(d.id)}
                      className={`border-b border-gray-200 hover:bg-lime-50 cursor-pointer ${
                        selectedId === d.id ? 'bg-lime-50' : ''
                      }`}
                    >
                      <td className="px-2 py-1 font-mono text-[10px] border-r">{d.delivery_no}</td>
                      <td className="px-2 py-1 font-mono text-[10px] border-r">{d.sales_fiche_no || '—'}</td>
                      <td className="px-2 py-1 text-[10px] border-r truncate max-w-[140px]">
                        {d.customer_name || '—'}
                      </td>
                      <td className="px-2 py-1 text-[10px] border-r">
                        {String(d.delivery_date || '').slice(0, 10)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <span className={`px-1.5 py-0.5 text-[9px] rounded ${statusBadgeClass(String(d.status))}`}>
                          {labelStatus(String(d.status))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-gray-300 flex flex-col min-h-[240px]">
            <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5 flex items-center justify-between">
              <h3 className="text-[11px] text-gray-700">Detay</h3>
              {selectedId && (
                <button type="button" className="text-[10px] text-gray-500" onClick={() => { setSelectedId(null); setDetail(null); }}>
                  Kapat
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-3 text-xs space-y-3">
              {!selectedId && (
                <p className="text-gray-500 text-[11px]">Listeden bir teslimat seçin.</p>
              )}
              {selectedId && detailLoading && <p className="text-gray-500">Detay yükleniyor…</p>}
              {detail && !detailLoading && (
                <>
                  <div>
                    <div className="font-mono text-sm font-semibold text-gray-900">{detail.delivery_no}</div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      Sipariş: {detail.sales_fiche_no || '—'} · {detail.customer_name || '—'}
                    </div>
                    <div className="mt-1">
                      <span className={`px-2 py-0.5 text-[10px] rounded ${statusBadgeClass(String(detail.status))}`}>
                        {labelStatus(String(detail.status))}
                      </span>
                    </div>
                    {detail.address_text && (
                      <p className="mt-2 text-[11px] text-gray-700 whitespace-pre-wrap">{detail.address_text}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-gray-500">Kurye</span>
                      <select
                        className="w-full border border-gray-300 rounded px-1.5 py-1 text-[11px]"
                        value={detail.courier_id || ''}
                        disabled={busy}
                        onChange={(e) =>
                          void doAssign({ courier_id: e.target.value || null })
                        }
                      >
                        <option value="">—</option>
                        {couriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-gray-500">Araç</span>
                      <select
                        className="w-full border border-gray-300 rounded px-1.5 py-1 text-[11px]"
                        value={detail.vehicle_id || ''}
                        disabled={busy}
                        onChange={(e) =>
                          void doAssign({ vehicle_id: e.target.value || null })
                        }
                      >
                        <option value="">—</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.plate}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Durum geçişi</div>
                    <div className="flex flex-wrap gap-1">
                      {nextStatuses(String(detail.status)).map((st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={busy}
                          onClick={() => void doTransition(st)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] rounded border border-lime-300 bg-lime-50 text-lime-900 hover:bg-lime-100 disabled:opacity-50"
                        >
                          {labelStatus(st)}
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      ))}
                      {nextStatuses(String(detail.status)).length === 0 && (
                        <span className="text-[10px] text-gray-400">İleri geçiş yok</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-gray-500 mb-1">Satırlar ({detail.lines.length})</div>
                    <table className="w-full border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50 text-[9px] text-gray-600">
                          <th className="px-1 py-0.5 text-left">Ürün</th>
                          <th className="px-1 py-0.5 text-right">Plan</th>
                          <th className="px-1 py-0.5 text-right">Teslim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((ln) => (
                          <tr key={ln.id} className="border-t border-gray-100 text-[10px]">
                            <td className="px-1 py-0.5 truncate max-w-[120px]">{ln.product_name || ln.product_code || '—'}</td>
                            <td className="px-1 py-0.5 text-right">{ln.qty_planned}</td>
                            <td className="px-1 py-0.5 text-right">{ln.qty_delivered}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {detail.events.length > 0 && (
                    <div>
                      <div className="text-[10px] text-gray-500 mb-1">Geçmiş</div>
                      <ul className="space-y-1">
                        {detail.events.map((ev) => (
                          <li key={ev.id} className="text-[10px] text-gray-600 border-l-2 border-lime-300 pl-2">
                            <span className="font-medium">{labelStatus(ev.to_status)}</span>
                            {ev.note ? ` — ${ev.note}` : ''}
                            <span className="text-gray-400 ml-1">
                              {String(ev.created_at || '').replace('T', ' ').slice(0, 16)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateDeliveryFromOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false);
            await loadList();
            if (id) void openDetail(id);
          }}
        />
      )}
    </div>
  );
}

function SummaryCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-gray-600">{label}</span>
      </div>
      <div className="text-base text-gray-900">{value}</div>
    </div>
  );
}

function CreateDeliveryFromOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (deliveryId?: string) => void | Promise<void>;
}) {
  const [orders, setOrders] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const page = await invoicesAPI.getPaginated({
          page: 1,
          pageSize: 100,
          invoiceCategory: 'Siparis',
          search: search.trim() || undefined,
        });
        if (!cancelled) setOrders(page.data || []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Siparişler yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search]);

  const create = async (order: Invoice) => {
    if (!order.id) return;
    setBusyId(order.id);
    setErr(null);
    try {
      const res = await logisticsService.createDeliveryFromSales(order.id);
      if (!res.ok) {
        const msg =
          res.error === 'delivery_already_exists'
            ? 'Bu sipariş için zaten açık bir teslimat var'
            : res.error || 'Oluşturulamadı';
        setErr(msg);
        return;
      }
      await onCreated(res.delivery_id);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="list" ariaLabel="Siparişten teslimat oluştur">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-lime-600 to-lime-700 text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <h3 className="text-sm font-semibold">Siparişten Teslimat</h3>
        </div>
        <button type="button" onClick={onClose} className="p-1 hover:bg-white/20 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="shrink-0 px-4 py-2 border-b border-gray-200">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sipariş no / müşteri ara…"
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded"
          />
        </div>
        {err && <p className="mt-2 text-[11px] text-red-600">{err}</p>}
      </div>
      <PercentBodyModalScrollBody className="p-0">
        {loading ? (
          <p className="p-4 text-xs text-gray-500">Siparişler yükleniyor…</p>
        ) : orders.length === 0 ? (
          <p className="p-4 text-xs text-gray-500">Satış siparişi bulunamadı.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b text-[10px] text-gray-600">
                <th className="px-3 py-2 text-left">Sipariş</th>
                <th className="px-3 py-2 text-left">Müşteri</th>
                <th className="px-3 py-2 text-left">Tarih</th>
                <th className="px-3 py-2 text-right">Tutar</th>
                <th className="px-3 py-2 text-center">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id || o.invoice_no} className="border-b border-gray-100 hover:bg-gray-50 text-xs">
                  <td className="px-3 py-2 font-mono text-[11px]">{o.invoice_no}</td>
                  <td className="px-3 py-2">{o.customer_name || '—'}</td>
                  <td className="px-3 py-2 text-[11px]">{String(o.invoice_date || '').slice(0, 10)}</td>
                  <td className="px-3 py-2 text-right">
                    {Number(o.total_amount ?? o.total ?? 0).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={!o.id || busyId === o.id}
                      onClick={() => void create(o)}
                      className="px-2 py-1 text-[10px] rounded bg-lime-600 text-white hover:bg-lime-700 disabled:opacity-50"
                    >
                      {busyId === o.id ? '…' : 'Teslimat Oluştur'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PercentBodyModalScrollBody>
      <div className="shrink-0 px-4 py-2 border-t border-gray-200 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
        >
          Kapat
        </button>
      </div>
    </PercentBodyModal>
  );
}

export default LogisticsModule;
