// 📦 Receiving Center - Mal Kabul Merkezi
// Complete receiving workflow with barcode scanning

import { useState, useEffect } from 'react';
import {
  TrendingDown, Plus, Search, Filter, Calendar, Truck,
  Package, Check, X, Clock, AlertCircle, ChevronRight,
  Scan, Camera, FileText, User, Building, MapPin, Save,
  CheckCircle, XCircle, Loader2, Eye, BookOpen
} from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { ConditionalReceivingModal } from './ConditionalReceivingModal';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { formatCurrency, formatNumber, formatDateTime } from '../utils';

interface ReceivingCenterProps {
  darkMode: boolean;
  onBack: () => void;
}

interface Receiving {
  id: string;
  receipt_number: string;
  warehouse_id: string;
  receiving_type: string;
  supplier_name: string;
  status: string;
  received_date: string;
  total_quantity: number;
  total_value: number;
  total_items_count: number;
}

interface ReceivingItem {
  id?: string;
  product_id: string;
  product_code?: string;
  product_name?: string;
  barcode?: string;
  ordered_quantity: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  unit: string;
  unit_cost: number;
  lot_number?: string;
  expiry_date?: string;
  pallet_type?: any;
  putaway_location_id?: string;
}

export function ReceivingCenter({ darkMode, onBack }: ReceivingCenterProps) {
  const [view, setView] = useState<'list' | 'create' | 'execute'>('list');
  const [receivings, setReceivings] = useState<Receiving[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [currentReceiving, setCurrentReceiving] = useState<any>(null);
  const [receivingItems, setReceivingItems] = useState<ReceivingItem[]>([]);

  // Conditional Modal State
  const [showConditionModal, setShowConditionModal] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  useEffect(() => {
    if (view === 'list') {
      loadReceivings();
    }
  }, [view, statusFilter]);

  const loadReceivings = async () => {
    setIsLoading(true);
    try {
      const warehouseId = localStorage.getItem('wms_warehouse_id');
      const supabaseUrl = `https://${projectId}.supabase.co`;

      const url = new URL(`${supabaseUrl}/functions/v1/make-server-eae94dc0/wms/receiving/list`);
      url.searchParams.append('warehouse_id', warehouseId || '');
      if (statusFilter !== 'all') {
        url.searchParams.append('status', statusFilter);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setReceivings(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading receivings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createReceiving = async (data: any) => {
    try {
      const supabaseUrl = `https://${projectId}.supabase.co`;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/make-server-eae94dc0/wms/receiving/create`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCurrentReceiving(result.data);
          setView('execute');
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error creating receiving:', error);
      return false;
    }
  };

  const handleBarcodeScanned = (barcode: string) => {
    // Search for product by barcode
    // In real app, query products table
    console.log('Barcode scanned:', barcode);

    // Add item to receiving
    const newItem: ReceivingItem = {
      product_id: 'temp-' + Date.now(),
      barcode,
      product_name: 'Ürün Adı (Barcode: ' + barcode + ')',
      ordered_quantity: 0,
      received_quantity: 1,
      accepted_quantity: 1,
      rejected_quantity: 0,
      unit: 'Adet',
      unit_cost: 0,
    };

    setReceivingItems(prev => [...prev, newItem]);
  };

  const handleEditItem = (index: number) => {
    setEditingItemIndex(index);
    setShowConditionModal(true);
  };

  const handleSaveCondition = (updatedItem: ReceivingItem) => {
    if (editingItemIndex !== null) {
      const newItems = [...receivingItems];
      newItems[editingItemIndex] = updatedItem;
      setReceivingItems(newItems);
    }
    setShowConditionModal(false);
    setEditingItemIndex(null);
  };

  const getStatusBadge = (status: string) => {
    const configs: any = {
      pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', label: 'Bekliyor' },
      in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'İşlemde' },
      completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Tamamlandı' },
      cancelled: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'İptal' },
    };
    const config = configs[status] || configs.pending;
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  // LIST VIEW
  if (view === 'list') {
    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600"
          >
            ← Geri
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Mal Kabul Merkezi</h1>
              <p className="text-gray-500">Tüm mal kabul işlemlerinizi yönetin</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors border-2 border-transparent"
              >
                <Plus className="w-5 h-5" />
                Yeni Kabul
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Fiş no, tedarikçi ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                    }`}
                />
              </div>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                }`}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="pending">Bekliyor</option>
              <option value="in_progress">İşlemde</option>
              <option value="completed">Tamamlandı</option>
            </select>
          </div>
        </div>

        {/* Receivings List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : receivings.length === 0 ? (
          <div className={`${cardClass} border rounded-xl p-12 text-center`}>
            <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className={`text-xl font-semibold ${textClass} mb-2`}>
              Henüz mal kabul kaydı yok
            </h3>
            <p className="text-gray-500 mb-6">
              Yeni bir mal kabul oluşturarak başlayın
            </p>
            <button
              onClick={() => setView('create')}
              className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
            >
              İlk Kaydı Oluştur
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {receivings.map((receiving) => (
              <div
                key={receiving.id}
                className={`${cardClass} border rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer`}
                onClick={() => {
                  setCurrentReceiving(receiving);
                  setView('execute');
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className={`text-xl font-bold ${textClass}`}>
                        {receiving.receipt_number}
                      </h3>
                      {getStatusBadge(receiving.status)}
                    </div>
                    <p className="text-gray-500">
                      {receiving.supplier_name || 'Tedarikçi belirtilmemiş'}
                    </p>
                  </div>
                  <ChevronRight className="w-6 h-6 text-gray-400" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Tarih</p>
                    <p className={`font-semibold ${textClass}`}>
                      {formatDateTime(receiving.received_date).split(' ')[0]}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Kalem Sayısı</p>
                    <p className={`font-semibold ${textClass}`}>
                      {receiving.total_items_count || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Miktar</p>
                    <p className={`font-semibold ${textClass}`}>
                      {formatNumber(receiving.total_quantity || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Tutar</p>
                    <p className={`font-semibold ${textClass}`}>
                      {formatCurrency(receiving.total_value || 0)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // CREATE VIEW
  if (view === 'create') {
    return (
      <div className={`min-h-screen ${bgClass} p-6`}>
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setView('list')}
            className="mb-6 flex items-center gap-2 text-blue-500 hover:text-blue-600"
          >
            ← Geri
          </button>

          <div className={`${cardClass} border rounded-xl p-8`}>
            <h2 className={`text-2xl font-bold ${textClass} mb-6`}>
              Yeni Mal Kabul Oluştur
            </h2>

            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              createReceiving({
                warehouse_id: localStorage.getItem('wms_warehouse_id'),
                receiving_type: formData.get('receiving_type'),
                supplier_id: formData.get('supplier_id'),
                po_number: formData.get('po_number'),
                invoice_number: formData.get('invoice_number'),
                scheduled_date: formData.get('scheduled_date'),
              });
            }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                    Kabul Tipi *
                  </label>
                  <select
                    name="receiving_type"
                    required
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                      }`}
                  >
                    <option value="purchase_order">Satınalma Siparişi</option>
                    <option value="transfer_in">Transfer Girişi</option>
                    <option value="return_from_customer">Müşteri İadesi</option>
                    <option value="consignment">Konsinye</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                    Tedarikçi
                  </label>
                  <input
                    type="text"
                    name="supplier_id"
                    placeholder="Tedarikçi seçin..."
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                      }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                    Sipariş No
                  </label>
                  <input
                    type="text"
                    name="po_number"
                    placeholder="PO-12345"
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                      }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                    Fatura No
                  </label>
                  <input
                    type="text"
                    name="invoice_number"
                    placeholder="INV-12345"
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                      }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold ${textClass} mb-2`}>
                    Planlanan Tarih
                  </label>
                  <input
                    type="date"
                    name="scheduled_date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                      }`}
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Oluştur ve Devam Et
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // EXECUTE VIEW (Receiving Items)
  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => setView('list')}
          className="mb-6 flex items-center gap-2 text-blue-500 hover:text-blue-600"
        >
          ← Geri
        </button>

        {/* Header */}
        <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-2xl font-bold ${textClass} mb-2`}>
                {currentReceiving?.receipt_number}
              </h2>
              <p className="text-gray-500">
                Ürünleri tara ve kabul et
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                <Scan className="w-5 h-5" />
                Barkod Tara
              </button>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className={`${cardClass} border rounded-xl overflow-hidden`}>
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h3 className={`text-lg font-bold ${textClass}`}>
              Kabul Edilen Ürünler ({receivingItems.length})
            </h3>
          </div>

          {receivingItems.length === 0 ? (
            <div className="p-12 text-center">
              <Scan className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">
                Ürün eklemek için barkod tarayın
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Ürün
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Miktar
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Birim Maliyet
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                      Lot No
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {receivingItems.map((item, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4">
                        <div>
                          <p className={`font-semibold ${textClass}`}>
                            {item.product_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {item.barcode}
                          </p>
                          {item.expiry_date && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded ml-2">
                              SKT: {item.expiry_date}
                            </span>
                          )}
                          {item.rejected_quantity > 0 && (
                            <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded ml-2">
                              Red: {item.rejected_quantity} ({item.rejection_reason})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold">{item.accepted_quantity}</span>
                          <span className="text-xs text-gray-500">/ {item.ordered_quantity || item.received_quantity}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <input
                          type="number"
                          value={item.unit_cost}
                          onChange={(e) => {
                            const newItems = [...receivingItems];
                            newItems[index].unit_cost = parseFloat(e.target.value) || 0;
                            setReceivingItems(newItems);
                          }}
                          className="w-32 px-3 py-2 text-right rounded border bg-transparent"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-mono">{item.lot_number || '-'}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditItem(index)}
                            className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Detaylı Kabul (Şartlı/Kısmi)"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              setReceivingItems(receivingItems.filter((_, i) => i !== index));
                            }}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Sil"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        {receivingItems.length > 0 && (
          <div className="mt-6 flex gap-4">
            <button
              onClick={() => {
                setReceivingItems([]);
                setView('list');
              }}
              className="flex-1 px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              İptal
            </button>
            <button
              onClick={() => {
                // Complete receiving logic
                alert('Mal kabul tamamlandı!');
                setView('list');
              }}
              className="flex-1 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Kabul İşlemini Tamamla
            </button>
          </div>
        )}
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScanner
        darkMode={darkMode}
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
      />

      {/* Conditional Receiving Modal */}
      {editingItemIndex !== null && receivingItems[editingItemIndex] && (
        <ConditionalReceivingModal
          isOpen={showConditionModal}
          onClose={() => setShowConditionModal(false)}
          onSave={handleSaveCondition as any}
          item={receivingItems[editingItemIndex]}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}

