import { useCallback, useEffect, useState } from 'react';
import { ShoppingCart, Plus, TrendingUp, Clock, Truck, RefreshCw } from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { SalesOrderCreatePage } from './SalesOrderCreatePage';
import type { Customer, Product } from '../../../App';
import { useLanguage } from '../../../contexts/LanguageContext';
import { invoicesAPI } from '../../../services/api/invoices';
import type { Invoice } from '../../../core/types';
import { logisticsService } from '../../../services/logisticsService';

interface SalesOrderModuleProps {
  customers: Customer[];
  products: Product[];
}

type OrderRow = {
  id: string;
  invoice_no: string;
  customer: string;
  date: string;
  items: number;
  total: number;
  status: string;
  raw: Invoice;
};

export function SalesOrderModule({ customers, products }: SalesOrderModuleProps) {
  const { t, tm } = useLanguage();
  const [showNewOrderPage, setShowNewOrderPage] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await invoicesAPI.getPaginated({
        page: 1,
        pageSize: 200,
        invoiceCategory: 'Siparis',
      });
      const rows: OrderRow[] = (page.data || []).map((inv) => ({
        id: String(inv.id || ''),
        invoice_no: inv.invoice_no || '—',
        customer: inv.customer_name || '—',
        date: String(inv.invoice_date || '').slice(0, 10),
        items: Array.isArray(inv.items) ? inv.items.length : 0,
        total: Number(inv.total_amount ?? inv.total ?? 0),
        status: inv.status || '—',
        raw: inv,
      }));
      setOrders(rows);
    } catch (e: any) {
      setError(e?.message || String(e) || 'Siparişler yüklenemedi');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const createDelivery = async (row: OrderRow) => {
    if (!row.id) return;
    setBusyId(row.id);
    setInfo(null);
    setError(null);
    try {
      const res = await logisticsService.createDeliveryFromSales(row.id);
      if (!res.ok) {
        setError(
          res.error === 'delivery_already_exists'
            ? `${row.invoice_no}: zaten açık teslimat var`
            : res.error || 'Teslimat oluşturulamadı'
        );
        return;
      }
      setInfo(`Teslimat oluşturuldu: ${res.delivery_no}`);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  };

  const getStatusColor = (status: string) => {
    const s = status.toLocaleLowerCase('tr-TR');
    if (s.includes('onay') || s.includes('pending')) return 'bg-yellow-100 text-yellow-700';
    if (s.includes('hazır') || s.includes('approved') || s.includes('completed')) return 'bg-blue-100 text-blue-700';
    if (s.includes('iptal') || s.includes('cancel')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const columnHelper = createColumnHelper<OrderRow>();

  if (showNewOrderPage) {
    return (
      <SalesOrderCreatePage
        customers={customers}
        products={products}
        onBack={() => setShowNewOrderPage(false)}
        onSuccess={() => {
          setShowNewOrderPage(false);
          void loadOrders();
        }}
      />
    );
  }

  const pendingCount = orders.filter((o) => {
    const s = o.status.toLocaleLowerCase('tr-TR');
    return s.includes('pending') || s.includes('onay') || s.includes('draft');
  }).length;

  return (
    <div className="h-full flex flex-col">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            <h2 className="text-sm font-semibold">{t.menu?.salesOrder || tm('salesOrders') || 'Satış Siparişleri'}</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {orders.length} sipariş</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="flex items-center gap-1 px-2 py-1 bg-white/15 hover:bg-white/25 text-[10px]"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
            <button
              onClick={() => setShowNewOrderPage(true)}
              className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
            >
              <Plus className="w-3 h-3" />
              <span>Yeni Sipariş</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && (
          <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded">{error}</div>
        )}
        {info && (
          <div className="mb-2 text-xs text-green-800 bg-green-50 border border-green-200 px-3 py-2 rounded">{info}</div>
        )}

        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Sipariş Özeti</h3>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">Toplam Sipariş</span>
              </div>
              <div className="text-base text-gray-900">{loading ? '…' : orders.length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Toplam Tutar</span>
              </div>
              <div className="text-base text-gray-900">
                {orders.reduce((s, o) => s + o.total, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">Bekleyen</span>
              </div>
              <div className="text-base text-gray-900">{pendingCount}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200">
          <DevExDataGrid
            data={orders}
            columns={[
              columnHelper.accessor('invoice_no', {
                header: 'SİPARİŞ NO',
                cell: (info) => info.getValue(),
                size: 140,
              }),
              columnHelper.accessor('customer', {
                header: 'MÜŞTERİ',
                cell: (info) => info.getValue(),
                size: 200,
              }),
              columnHelper.accessor('date', {
                header: 'TARİH',
                cell: (info) => info.getValue(),
                size: 120,
              }),
              columnHelper.accessor('items', {
                header: 'ÜRÜN',
                cell: (info) => info.getValue(),
                size: 80,
              }),
              columnHelper.accessor('total', {
                header: 'TUTAR',
                cell: (info) =>
                  `${Number(info.getValue() || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
                size: 140,
              }),
              columnHelper.accessor('status', {
                header: 'DURUM',
                cell: (info) => (
                  <span className={`px-2 py-1 text-xs rounded ${getStatusColor(info.getValue())}`}>
                    {info.getValue()}
                  </span>
                ),
                size: 120,
                enableColumnFilter: true,
              }),
              columnHelper.display({
                id: 'actions',
                header: 'TESLİMAT',
                size: 140,
                cell: ({ row }) => (
                  <button
                    type="button"
                    disabled={!row.original.id || busyId === row.original.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void createDelivery(row.original);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-lime-600 text-white hover:bg-lime-700 disabled:opacity-50"
                  >
                    <Truck className="w-3 h-3" />
                    {busyId === row.original.id ? '…' : 'Oluştur'}
                  </button>
                ),
              }),
            ]}
            pageSize={10}
            enableSelection={true}
          />
          {loading && (
            <div className="px-3 py-2 text-[11px] text-gray-500 border-t">Siparişler yükleniyor…</div>
          )}
        </div>
      </div>
    </div>
  );
}
