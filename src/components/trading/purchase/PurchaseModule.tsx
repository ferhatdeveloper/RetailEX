import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Search, Eye, Check, X, Clock, Package, ShoppingBag, Trash2 } from 'lucide-react';
import { PurchaseOrderCreatePage } from './PurchaseOrderCreatePage';
import type { Product } from '../../../App';
import { purchaseOrderAPI, PurchaseOrder } from '../../../services/purchaseOrderAPI';
import { toast } from 'sonner';

interface PurchaseModuleProps {
  products: Product[];
}

import { useLanguage } from '../../../contexts/LanguageContext';

export function PurchaseModule({ products }: PurchaseModuleProps) {
  const { tm } = useLanguage();
  const [showNewOrderPage, setShowNewOrderPage] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'received'>('all');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await purchaseOrderAPI.getAll();
      setOrders(data);
    } catch (error) {
      console.error('Error loading orders:', error);
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await purchaseOrderAPI.updateStatus(id, status);
      toast.success(tm('orderStatusUpdated') || 'Sipariş durumu güncellendi');
      loadOrders();
    } catch (error) {
      toast.error(tm('statusUpdateFailed') || 'Durum güncellenemedi');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tm('deleteOrderConfirm') || 'Bu siparişi silmek istediğinizden emin misiniz?')) return;
    try {
      await purchaseOrderAPI.delete(id);
      toast.success(tm('orderDeleted') || 'Sipariş silindi');
      loadOrders();
    } catch (error) {
      toast.error(tm('orderDeleteFailed') || 'Sipariş silinemedi');
    }
  };

  const filteredOrders = orders.filter((order: PurchaseOrder) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch =
      order.order_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order as any).supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: tm('pending'), color: 'bg-yellow-100 text-yellow-700' };
      case 'approved':
        return { label: tm('approved'), color: 'bg-blue-100 text-blue-700' };
      case 'received':
        return { label: tm('received'), color: 'bg-green-100 text-green-700' };
      case 'cancelled':
        return { label: tm('cancelled'), color: 'bg-red-100 text-red-700' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-700' };
    }
  };

  // Yeni Sipariş Sayfası açıksa, onu göster
  if (showNewOrderPage) {
    return (
      <PurchaseOrderCreatePage
        products={products}
        onBack={() => setShowNewOrderPage(false)}
        onSuccess={() => {
          setShowNewOrderPage(false);
          loadOrders();
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            <h2 className="text-sm">{tm('purchasing')}</h2>
          </div>
          <button
            onClick={() => setShowNewOrderPage(true)}
            className="flex items-center gap-1 px-2 py-1 bg-white text-purple-700 hover:bg-purple-50 transition-colors text-[10px]"
          >
            <Plus className="w-3 h-3" />
            {tm('createNewOrder')}
          </button>
        </div>
      </div>

      {/* Filters & Search - Kompakt */}
      <div className="bg-white border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 w-3 h-3" />
            <input
              type="text"
              placeholder={tm('searchOrder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-600">{tm('status')}:</span>
            <div className="flex gap-1">
              {[
                { value: 'all', label: tm('all') },
                { value: 'pending', label: tm('pending') },
                { value: 'approved', label: tm('approved') },
                { value: 'received', label: tm('received') }
              ].map(status => (
                <button
                  key={status.value}
                  onClick={() => setStatusFilter(status.value as any)}
                  className={`px-2 py-0.5 rounded text-[9px] transition-colors ${statusFilter === status.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">{tm('orderSummary')}</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-yellow-600" />
                <span className="text-[10px] text-gray-600">{tm('pendingOrder')}</span>
              </div>
              <div className="text-base text-gray-900">{orders.filter((o: PurchaseOrder) => o.status === 'pending').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] text-gray-600">{tm('approvedCount')}</span>
              </div>
              <div className="text-base text-gray-900">{orders.filter((o: PurchaseOrder) => o.status === 'approved').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">{tm('received')}</span>
              </div>
              <div className="text-base text-gray-900">{orders.filter((o: PurchaseOrder) => o.status === 'received').length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingBag className="w-4 h-4 text-purple-600" />
                <span className="text-[10px] text-gray-600">{tm('totalAmount')}</span>
              </div>
              <div className="text-base text-purple-600">
                {orders.reduce((sum: number, o: PurchaseOrder) => sum + (o.total_amount || 0), 0).toLocaleString()} IQD
              </div>
            </div>
          </div>
        </div>

        {/* Tablo - Minimal */}
        <div className="bg-white border border-gray-300">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('orderNo')}</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('supplier')}</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('orderDate')}</th>
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">{tm('deliveryDate')}</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">{tm('totalAmount')}</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">{tm('status')}</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">{tm('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-4 text-[10px]">{tm('loading')}</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-4 text-[10px]">{tm('noDataFound')}</td></tr>
              ) : filteredOrders.map((order: PurchaseOrder) => {
                const statusBadge = getStatusBadge(order.status);
                return (
                  <tr key={order.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-2 py-0.5 text-[10px] font-mono border-r border-gray-200">{order.order_no}</td>
                    <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{(order as any).supplier?.name || '-'}</td>
                    <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">
                      {new Date(order.order_date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">
                      {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('tr-TR') : '-'}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[10px] text-blue-600 border-r border-gray-200">{(order.total_amount || 0).toLocaleString()} IQD</td>
                    <td className="px-2 py-0.5 text-center border-r border-gray-200">
                      <span className={`px-2 py-0.5 rounded text-[9px] ${statusBadge.color}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="px-2 py-0.5 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button className="p-0.5 text-blue-600 hover:bg-blue-50 rounded" title={tm('view')}>
                          <Eye className="w-3 h-3" />
                        </button>
                        {order.status === 'pending' && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'approved')}
                            className="p-0.5 text-green-600 hover:bg-green-50 rounded"
                            title={tm('approve')}
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        {['pending', 'approved'].includes(order.status) && (
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                            className="p-0.5 text-orange-600 hover:bg-orange-50 rounded"
                            title={tm('cancel')}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="p-0.5 text-red-600 hover:bg-red-50 rounded"
                          title={tm('delete')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

