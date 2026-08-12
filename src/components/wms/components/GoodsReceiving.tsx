// Goods Receiving Module - Enterprise WMS

import { useState, useEffect } from 'react';
import {
  TrendingDown, Plus, Search, Filter, Calendar, Truck, User,
  Package, CheckCircle, XCircle, AlertCircle, ArrowLeft, Save,
  Printer, QrCode, Barcode, Camera, Edit, Trash2, Eye
} from 'lucide-react';
import type { GoodsReceiving as GoodsReceivingType, ReceivingItem } from '../types';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '../utils';

interface GoodsReceivingProps {
  darkMode: boolean;
  onNavigate: (page: string) => void;
}

export default function GoodsReceiving({ darkMode, onNavigate }: GoodsReceivingProps) {
  const [receivings, setReceivings] = useState<GoodsReceivingType[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedReceiving, setSelectedReceiving] = useState<GoodsReceivingType | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadReceivings();
  }, []);

  const loadReceivings = async () => {
    // TODO: Load from API
    const mockData: GoodsReceivingType[] = [
      {
        id: '1',
        receiptNumber: 'GR-2024-00123',
        warehouseId: '1',
        supplierId: 'SUP-001',
        supplierName: 'Tech Supplies Co.',
        purchaseOrderNumber: 'PO-2024-00456',
        invoiceNumber: 'INV-2024-00789',
        receivedDate: new Date().toISOString(),
        receivedBy: 'Ahmed Ali',
        items: [
          {
            id: '1',
            receivingId: '1',
            productId: 'PRD-001',
            productCode: 'LAPTOP-001',
            productName: 'Dell XPS 15 Laptop',
            orderedQuantity: 50,
            receivedQuantity: 50,
            acceptedQuantity: 48,
            rejectedQuantity: 2,
            unit: 'Adet',
            lotNumber: 'LOT-2024-001',
            manufacturingDate: '2024-01-10',
            expiryDate: '2026-01-10',
            costPrice: 2500000,
            totalValue: 120000000,
            qcStatus: 'passed',
            assignedBinCode: 'A01-R02-03-B'
          }
        ],
        totalQuantity: 50,
        totalValue: 120000000,
        status: 'completed',
        qcStatus: 'passed',
        vehicleNumber: '34 ABC 123',
        driverName: 'Mohammed Hassan',
        driverPhone: '+964 770 123 4567',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    setReceivings(mockData);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setSelectedReceiving(null);
  };

  const handleSave = () => {
    // TODO: Implement save logic
    setIsCreating(false);
    loadReceivings();
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      pending: { label: 'Bekliyor', color: 'yellow' },
      in_progress: { label: 'İşlemde', color: 'blue' },
      qc_check: { label: 'Kalite Kontrolü', color: 'purple' },
      completed: { label: 'Tamamlandı', color: 'green' },
      rejected: { label: 'Reddedildi', color: 'red' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const colorClass = darkMode
      ? `bg-${config.color}-900/30 text-${config.color}-400`
      : `bg-${config.color}-100 text-${config.color}-700`;

    return (
      <span className={`px-2 py-1 rounded text-xs ${colorClass}`}>
        {config.label}
      </span>
    );
  };

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-green-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';

  if (isCreating) {
    return <CreateReceiving darkMode={darkMode} onCancel={() => setIsCreating(false)} onSave={handleSave} />;
  }

  return (
    <div className={`min-h-screen ${bgClass}`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b shadow-sm sticky top-0 z-40`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => onNavigate('dashboard')}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <ArrowLeft className={`w-5 h-5 ${textClass}`} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className={`text-xl ${textClass}`}>Mal Kabul</h1>
                  <p className={`text-xs ${textMutedClass}`}>Gelen mal kayıtları ve kalite kontrol</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg"
            >
              <Plus className="w-5 h-5" />
              <span>Yeni Mal Kabul</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="p-6">
        <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${textMutedClass}`} />
              <input
                type="text"
                placeholder="İrsaliye no, satıcı adı veya ürün ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-gray-100' 
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-green-500`}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="pending">Bekliyor</option>
              <option value="in_progress">İşlemde</option>
              <option value="qc_check">Kalite Kontrolü</option>
              <option value="completed">Tamamlandı</option>
              <option value="rejected">Reddedildi</option>
            </select>

            <button className={`p-2 rounded-lg border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'}`}>
              <Filter className={`w-5 h-5 ${textClass}`} />
            </button>
          </div>
        </div>

        {/* Receivings List */}
        <div className="space-y-4">
          {receivings.map((receiving) => (
            <div
              key={receiving.id}
              className={`${cardClass} border rounded-xl p-6 hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-lg ${textClass}`}>{receiving.receiptNumber}</h3>
                    {getStatusBadge(receiving.status)}
                    {receiving.qcStatus && (
                      <span className={`px-2 py-1 rounded text-xs ${
                        receiving.qcStatus === 'passed' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        QC: {receiving.qcStatus === 'passed' ? 'Geçti' : 'Kaldı'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className={textMutedClass}>Satıcı</p>
                      <p className={textClass}>{receiving.supplierName}</p>
                    </div>
                    <div>
                      <p className={textMutedClass}>Sipariş No</p>
                      <p className={textClass}>{receiving.purchaseOrderNumber || '-'}</p>
                    </div>
                    <div>
                      <p className={textMutedClass}>Tarih</p>
                      <p className={textClass}>{formatDate(receiving.receivedDate)}</p>
                    </div>
                    <div>
                      <p className={textMutedClass}>Teslim Alan</p>
                      <p className={textClass}>{receiving.receivedBy}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                    <Eye className={`w-5 h-5 ${textClass}`} />
                  </button>
                  <button className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                    <Printer className={`w-5 h-5 ${textClass}`} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-center">
                  <p className={`text-sm ${textMutedClass} mb-1`}>Toplam Miktar</p>
                  <p className={`text-lg ${textClass}`}>{formatNumber(receiving.totalQuantity)}</p>
                </div>
                <div className="text-center">
                  <p className={`text-sm ${textMutedClass} mb-1`}>Kalem Sayısı</p>
                  <p className={`text-lg ${textClass}`}>{receiving.items.length}</p>
                </div>
                <div className="text-center">
                  <p className={`text-sm ${textMutedClass} mb-1`}>Toplam Değer</p>
                  <p className={`text-lg ${textClass}`}>{formatCurrency(receiving.totalValue)}</p>
                </div>
              </div>

              {receiving.vehicleNumber && (
                <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center gap-4 text-sm`}>
                  <div className="flex items-center gap-2">
                    <Truck className={`w-4 h-4 ${textMutedClass}`} />
                    <span className={textMutedClass}>Araç: <span className={textClass}>{receiving.vehicleNumber}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className={`w-4 h-4 ${textMutedClass}`} />
                    <span className={textMutedClass}>Sürücü: <span className={textClass}>{receiving.driverName}</span></span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {receivings.length === 0 && (
            <div className={`${cardClass} border rounded-xl p-12 text-center`}>
              <TrendingDown className={`w-16 h-16 ${textMutedClass} mx-auto mb-4`} />
              <h3 className={`text-lg ${textClass} mb-2`}>Henüz mal kabul kaydı yok</h3>
              <p className={`${textMutedClass} mb-6`}>İlk mal kabul kaydınızı oluşturun</p>
              <button
                onClick={handleCreateNew}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all"
              >
                Yeni Mal Kabul Oluştur
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Create Receiving Component
function CreateReceiving({ 
  darkMode, 
  onCancel, 
  onSave 
}: { 
  darkMode: boolean; 
  onCancel: () => void; 
  onSave: () => void; 
}) {
  const [formData, setFormData] = useState({
    supplierName: '',
    purchaseOrderNumber: '',
    invoiceNumber: '',
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    notes: ''
  });

  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-green-50'} p-6`}>
      <div className="max-w-4xl mx-auto">
        <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-xl ${textClass}`}>Yeni Mal Kabul Kaydı</h2>
            <button onClick={onCancel} className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
              <ArrowLeft className={`w-5 h-5 ${textClass}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm ${textMutedClass} mb-2`}>Satıcı Adı *</label>
              <input
                type="text"
                value={formData.supplierName}
                onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
                placeholder="Satıcı adını girin"
              />
            </div>

            <div>
              <label className={`block text-sm ${textMutedClass} mb-2`}>Sipariş No</label>
              <input
                type="text"
                value={formData.purchaseOrderNumber}
                onChange={(e) => setFormData({ ...formData, purchaseOrderNumber: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
                placeholder="PO-2024-00001"
              />
            </div>

            <div>
              <label className={`block text-sm ${textMutedClass} mb-2`}>Fatura No</label>
              <input
                type="text"
                value={formData.invoiceNumber}
                onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
                placeholder="INV-2024-00001"
              />
            </div>

            <div>
              <label className={`block text-sm ${textMutedClass} mb-2`}>Araç Plakası</label>
              <input
                type="text"
                value={formData.vehicleNumber}
                onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
                placeholder="34 ABC 123"
              />
            </div>

            <div>
              <label className={`block text-sm ${textMutedClass} mb-2`}>Sürücü Adı</label>
              <input
                type="text"
                value={formData.driverName}
                onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
                placeholder="Sürücü adı"
              />
            </div>

            <div>
              <label className={`block text-sm ${textMutedClass} mb-2`}>Sürücü Telefon</label>
              <input
                type="tel"
                value={formData.driverPhone}
                onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
                placeholder="+964 770 123 4567"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className={`block text-sm ${textMutedClass} mb-2`}>Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-green-500`}
              placeholder="Ek notlar..."
            />
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={onSave}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg transition-all"
            >
              <Save className="w-5 h-5" />
              <span>Kaydet</span>
            </button>
            <button
              onClick={onCancel}
              className={`px-6 py-2 rounded-lg border ${
                darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

