/**
 * ExRetailOS - Lot & Serial Number Management
 * 
 * Comprehensive lot/serial tracking:
 * - Lot-based inventory
 * - Serial number tracking
 * - Expiry date management
 * - FEFO (First Expire First Out)
 * - Batch tracking
 * - Product traceability
 * 
 * @created 2024-12-24
 */

import { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Barcode,
  Hash,
  Clock,
  TrendingDown,
  Download,
  Eye,
  Edit,
  Trash2,
  Filter
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { fetchLots, createLot, updateLot, deleteLot, recordLotMovement, fetchExpiringSoonLots } from '../../../services/api/lots';

// ===== TYPES =====

interface LotSerial {
  id: string;
  firma_id: string;
  tracking_type: 'LOT' | 'SERIAL'; // Lot or Serial tracking
  
  // Product info
  product_id: string;
  product_code: string;
  product_name: string;
  
  // Lot/Serial info
  lot_no?: string; // Lot number
  serial_no?: string; // Serial number
  batch_no?: string; // Batch number
  
  // Dates
  production_date?: string;
  expiry_date?: string; // SKT - Son Kullanma Tarihi
  receipt_date: string;
  
  // Quantity (for lots)
  initial_quantity: number;
  current_quantity: number;
  reserved_quantity: number; // Reserved for orders
  available_quantity: number; // Available = current - reserved
  
  // Location
  warehouse_id: string;
  warehouse_name: string;
  shelf_location?: string; // Raf konumu
  
  // Status
  status: 'ACTIVE' | 'RESERVED' | 'EXPIRED' | 'DAMAGED' | 'RETURNED' | 'SOLD';
  
  // Cost
  unit_cost: number; // Birim maliyet
  
  // Additional info
  supplier_id?: string;
  supplier_name?: string;
  purchase_invoice_no?: string;
  notes?: string;
  
  created_at: string;
  updated_at: string;
}

interface LotMovement {
  id: string;
  lot_serial_id: string;
  lot_no?: string;
  serial_no?: string;
  movement_type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN';
  quantity: number;
  from_warehouse?: string;
  to_warehouse?: string;
  document_no: string;
  document_type: string;
  notes: string;
  created_by: string;
  created_at: string;
}

type LotStatus = LotSerial['status'];

// ===== COMPONENT =====

export function LotSerialManagement() {
  const { t } = useLanguage();
  const { selectedFirma } = useFirmaDonem();

  // State
  const [lots, setLots] = useState<LotSerial[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'LOT' | 'SERIAL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<LotStatus | 'ALL'>('ALL');
  const [filterExpiry, setFilterExpiry] = useState<'ALL' | 'EXPIRING_SOON' | 'EXPIRED'>('ALL');
  const [view, setView] = useState<'list' | 'movements' | 'expiry'>('list');
  const [selectedLot, setSelectedLot] = useState<LotSerial | null>(null);

  // Fetch lots on component mount
  useEffect(() => {
    if (selectedFirma) {
      fetchLots(selectedFirma.id)
        .then(data => setLots(data))
        .catch(error => toast.error('Lotlar yüklenirken hata oluştu'));
    }
  }, [selectedFirma]);

  // Calculate expiry status
  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return 'none';
    
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring_soon';
    if (diffDays <= 90) return 'warning';
    return 'normal';
  };

  // Filter lots
  const filteredLots = lots.filter(lot => {
    const matchesSearch = 
      lot.lot_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.serial_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.product_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.product_name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === 'ALL' || lot.tracking_type === filterType;
    const matchesStatus = filterStatus === 'ALL' || lot.status === filterStatus;

    let matchesExpiry = true;
    if (filterExpiry === 'EXPIRING_SOON') {
      const status = getExpiryStatus(lot.expiry_date);
      matchesExpiry = status === 'expiring_soon' || status === 'warning';
    } else if (filterExpiry === 'EXPIRED') {
      matchesExpiry = getExpiryStatus(lot.expiry_date) === 'expired';
    }

    return matchesSearch && matchesType && matchesStatus && matchesExpiry;
  });

  // Calculate summaries
  const summary = {
    totalLots: lots.filter(l => l.tracking_type === 'LOT').length,
    totalSerials: lots.filter(l => l.tracking_type === 'SERIAL').length,
    expiringLots: lots.filter(l => {
      const status = getExpiryStatus(l.expiry_date);
      return status === 'expiring_soon' || status === 'warning';
    }).length,
    expiredLots: lots.filter(l => getExpiryStatus(l.expiry_date) === 'expired').length
  };

  // Status color helper
  const getStatusColor = (status: LotStatus) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-700 border-green-300';
      case 'RESERVED': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'EXPIRED': return 'bg-red-100 text-red-700 border-red-300';
      case 'DAMAGED': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'RETURNED': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'SOLD': return 'bg-gray-100 text-gray-700 border-gray-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Expiry color helper
  const getExpiryColor = (expiryDate?: string) => {
    const status = getExpiryStatus(expiryDate);
    switch (status) {
      case 'expired': return 'text-red-600';
      case 'expiring_soon': return 'text-orange-600';
      case 'warning': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-semibold">Lot & Seri Numarası Takibi</h2>
              <p className="text-sm text-emerald-100 mt-0.5">
                SKT takibi, parti yönetimi ve ürün izlenebilirliği
              </p>
            </div>
          </div>
          <button
            onClick={() => toast.info('Lot/Seri ekleme formu açılacak')}
            className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Yeni Kayıt
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-emerald-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Lot</p>
              <p className="text-2xl font-semibold text-emerald-600 mt-1">{summary.totalLots}</p>
            </div>
            <Hash className="w-10 h-10 text-emerald-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Seri Numaralı</p>
              <p className="text-2xl font-semibold text-blue-600 mt-1">{summary.totalSerials}</p>
            </div>
            <Barcode className="w-10 h-10 text-blue-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">SKT Yaklaşan</p>
              <p className="text-2xl font-semibold text-orange-600 mt-1">{summary.expiringLots}</p>
            </div>
            <Clock className="w-10 h-10 text-orange-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border-2 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Süresi Geçen</p>
              <p className="text-2xl font-semibold text-red-600 mt-1">{summary.expiredLots}</p>
            </div>
            <AlertTriangle className="w-10 h-10 text-red-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Lot/Seri no, ürün kodu veya adı ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Tüm Tipler</option>
            <option value="LOT">Lot Takipli</option>
            <option value="SERIAL">Seri Takipli</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="RESERVED">Rezerve</option>
            <option value="EXPIRED">Süresi Geçmiş</option>
            <option value="DAMAGED">Hasarlı</option>
          </select>

          <select
            value={filterExpiry}
            onChange={(e) => setFilterExpiry(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ALL">Tüm SKT Durumları</option>
            <option value="EXPIRING_SOON">SKT Yaklaşan</option>
            <option value="EXPIRED">Süresi Geçen</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Tip</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Lot/Seri No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ürün</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">SKT</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Miktar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Konum</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Durum</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLots.map(lot => {
                const expiryStatus = getExpiryStatus(lot.expiry_date);
                
                return (
                  <tr key={lot.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        lot.tracking_type === 'LOT' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {lot.tracking_type === 'LOT' ? (
                          <><Hash className="w-3 h-3 mr-1" />LOT</>
                        ) : (
                          <><Barcode className="w-3 h-3 mr-1" />SERİ</>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono font-medium text-sm">
                        {lot.lot_no || lot.serial_no}
                      </div>
                      {lot.batch_no && (
                        <div className="text-xs text-gray-500">Batch: {lot.batch_no}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-sm">{lot.product_name}</div>
                        <div className="text-xs text-gray-500">{lot.product_code}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {lot.expiry_date ? (
                        <div className={`flex items-center gap-2 ${getExpiryColor(lot.expiry_date)}`}>
                          <Calendar className="w-4 h-4" />
                          <div>
                            <div className="text-sm font-medium">
                              {new Date(lot.expiry_date).toLocaleDateString('tr-TR')}
                            </div>
                            {expiryStatus === 'expired' && (
                              <div className="text-xs flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Süresi geçmiş!
                              </div>
                            )}
                            {expiryStatus === 'expiring_soon' && (
                              <div className="text-xs flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                30 gün içinde!
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-semibold text-gray-900">{lot.available_quantity}</div>
                      <div className="text-xs text-gray-500">
                        Toplam: {lot.current_quantity}
                        {lot.reserved_quantity > 0 && ` (Rezerve: ${lot.reserved_quantity})`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{lot.warehouse_name}</div>
                      {lot.shelf_location && (
                        <div className="text-xs text-gray-500">Raf: {lot.shelf_location}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded border text-xs font-medium ${getStatusColor(lot.status)}`}>
                        {lot.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedLot(lot)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Detay"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredLots.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Kayıt bulunamadı</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
