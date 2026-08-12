import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Package, CheckCircle, Clock, Plus, Trash2, Edit2 } from 'lucide-react';
import { warehouseTransferAPI, WarehouseTransfer } from '../../../services/warehouseTransferAPI';
import { WarehouseTransferForm } from './WarehouseTransferForm';
import { Button } from '../../ui/button';
import { toast } from 'sonner';

export function StoreTransferModule() {
  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<WarehouseTransfer | undefined>(undefined);

  useEffect(() => {
    loadTransfers();
  }, []);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      const data = await warehouseTransferAPI.getAll();
      setTransfers(data);
    } catch (error) {
      console.error('Error loading transfers:', error);
      toast.error('Transferler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu transferi silmek istediğinizden emin misiniz?')) return;
    try {
      await warehouseTransferAPI.delete(id);
      toast.success('Transfer silindi');
      loadTransfers();
    } catch (error) {
      console.error('Error deleting transfer:', error);
      toast.error('Silme hatası');
    }
  };

  const stats = {
    total: transfers.length,
    completed: transfers.filter(t => t.status === 'completed').length,
    pending: transfers.filter(t => t.status === 'pending').length
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-8 h-8 text-blue-600" />
            Mağazalar Arası Transfer
          </h1>
          <p className="text-gray-500 text-sm mt-1">Şubeleriniz arasındaki stok hareketlerini yönetin</p>
        </div>
        <Button
          onClick={() => {
            setSelectedTransfer(undefined);
            setShowForm(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Yeni Transfer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 shadow-sm">
          <Package className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm font-medium text-blue-700 uppercase tracking-wider">Toplam Transfer</p>
          <p className="text-3xl font-bold text-blue-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 shadow-sm">
          <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm font-medium text-green-700 uppercase tracking-wider">Tamamlanan</p>
          <p className="text-3xl font-bold text-green-900 mt-1">{stats.completed}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 shadow-sm">
          <Clock className="w-8 h-8 text-yellow-600 mb-2" />
          <p className="text-sm font-medium text-yellow-700 uppercase tracking-wider">Bekleyen</p>
          <p className="text-3xl font-bold text-yellow-900 mt-1">{stats.pending}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 tracking-tight">Transfer Listesi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transfer No</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Kaynak</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Hedef</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Durum</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarih</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <span>Yükleniyor...</span>
                    </div>
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Henüz transfer kaydı bulunmuyor</p>
                  </td>
                </tr>
              ) : (
                transfers.map(transfer => (
                  <tr key={transfer.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-mono text-sm text-gray-900 font-medium">
                      {transfer.transfer_no}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(transfer as any).from_warehouse?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(transfer as any).to_warehouse?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${transfer.status === 'completed' ? 'bg-green-100 text-green-700' :
                        transfer.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                        {transfer.status === 'completed' ? 'Tamamlandı' :
                          transfer.status === 'pending' ? 'Bekliyor' : 'İptal'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(transfer.transfer_date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setSelectedTransfer(transfer);
                            setShowForm(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Düzenle"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(transfer.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <WarehouseTransferForm
          transfer={selectedTransfer}
          onClose={() => setShowForm(false)}
          onSave={loadTransfers}
        />
      )}
    </div>
  );
}

