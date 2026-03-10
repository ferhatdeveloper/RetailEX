import { useState } from 'react';
import { ShoppingCart, Plus, TrendingUp, Clock } from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { SalesOrderCreatePage } from './SalesOrderCreatePage';
import type { Customer, Product } from '../../../App';
import { useLanguage } from '../../../contexts/LanguageContext';

interface SalesOrderModuleProps {
  customers: Customer[];
  products: Product[];
}

export function SalesOrderModule({ customers, products }: SalesOrderModuleProps) {
  const { t, tm } = useLanguage();
  const [showNewOrderPage, setShowNewOrderPage] = useState(false);

  const salesOrders = [
    { id: 'SO-2025001', customer: 'Mehmet Yılmaz', date: '2025-12-04', deliveryDate: '2025-12-06', items: 5, total: 450.50, status: 'Hazırlanıyor' },
    { id: 'SO-2025002', customer: 'Ayşe Demir', date: '2025-12-04', deliveryDate: '2025-12-07', items: 8, total: 680.00, status: 'Onay Bekliyor' },
    { id: 'SO-2025003', customer: 'Ali Kaya', date: '2025-12-03', deliveryDate: '2025-12-05', items: 3, total: 215.75, status: 'Kargoda' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Hazırlanıyor': return 'bg-blue-100 text-blue-700';
      case 'Onay Bekliyor': return 'bg-yellow-100 text-yellow-700';
      case 'Kargoda': return 'bg-green-100 text-green-700';
      case 'Teslim Edildi': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const columnHelper = createColumnHelper<any>();

  // Yeni Sipariş Sayfası açıksa, onu göster
  if (showNewOrderPage) {
    return (
      <SalesOrderCreatePage
        customers={customers}
        products={products}
        onBack={() => setShowNewOrderPage(false)}
        onSuccess={() => {
          setShowNewOrderPage(false);
          // Burada listeyi yenileyebilirsiniz
        }}
      />
    );
  }

  // Liste görünümü
  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            <h2 className="text-sm font-semibold">{t.menu?.salesOrders || tm('salesOrders') || 'Satış Siparişleri'}</h2>
            <span className="text-blue-100 text-[10px] ml-2">• {salesOrders.length} sipariş</span>
          </div>
          <button
            onClick={() => setShowNewOrderPage(true)}
            className="flex items-center gap-1 px-2 py-1 bg-white text-blue-700 hover:bg-blue-50 transition-colors text-[10px]"
          >
            <Plus className="w-3 h-3" />
            <span>Yeni Sipariş</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet - Kart yerine */}
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
              <div className="text-base text-gray-900">{salesOrders.length}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-green-600" />
                <span className="text-[10px] text-gray-600">Toplam Tutar</span>
              </div>
              <div className="text-base text-gray-900">{salesOrders.reduce((s, o) => s + o.total, 0).toFixed(2)}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-[10px] text-gray-600">Bekleyen</span>
              </div>
              <div className="text-base text-gray-900">{salesOrders.filter(o => o.status === 'Onay Bekliyor').length}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200">
          <DevExDataGrid
            data={salesOrders}
            columns={[
              columnHelper.accessor('id', {
                header: 'SİPARİŞ NO',
                cell: info => info.getValue(),
                size: 140,
              }),
              columnHelper.accessor('customer', {
                header: 'MÜŞTERİ',
                cell: info => info.getValue(),
                size: 200
              }),
              columnHelper.accessor('date', {
                header: 'TARİH',
                cell: info => info.getValue(),
                size: 120
              }),
              columnHelper.accessor('deliveryDate', {
                header: 'TESLİMAT',
                cell: info => info.getValue(),
                size: 130
              }),
              columnHelper.accessor('items', {
                header: 'ÜRÜN SAYISI',
                cell: info => info.getValue(),
                size: 130
              }),
              columnHelper.accessor('total', {
                header: 'TUTAR',
                cell: info => `${info.getValue()?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
                size: 140
              }),
              columnHelper.accessor('status', {
                header: 'DURUM',
                cell: info => (
                  <span className={`px-2 py-1 text-xs rounded ${getStatusColor(info.getValue())}`}>
                    {info.getValue()}
                  </span>
                ),
                size: 140,
                enableColumnFilter: true,
                filterFn: 'custom'
              }),
            ]}
            pageSize={10}
            enableSelection={true}
          />
        </div>
      </div>
    </div>
  );
}

