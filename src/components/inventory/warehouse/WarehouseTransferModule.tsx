import React, { useState, useEffect } from 'react';
import { Boxes, Plus, Search, Trash2, Edit2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { warehouseTransferAPI, WarehouseTransfer } from '../../../services/warehouseTransferAPI';
import { WarehouseTransferForm } from './WarehouseTransferForm';
import { Button } from '../../ui/button';

export function WarehouseTransferModule() {
    const { t } = useLanguage();
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
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu transferi silmek istediğinizden emin misiniz?')) return;
        try {
            await warehouseTransferAPI.delete(id);
            loadTransfers();
        } catch (error) {
            alert('Silme hatası');
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                            <Boxes className="w-6 h-6 text-teal-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Depo Transfer Fişleri</h1>
                            <p className="text-sm text-gray-500">Depolar arası transfer işlemleri</p>
                        </div>
                    </div>
                    <Button
                        onClick={() => {
                            setSelectedTransfer(undefined);
                            setShowForm(true);
                        }}
                        className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Yeni Transfer
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">Yükleniyor...</div>
                ) : (
                    <div className="bg-white rounded-lg shadow-sm border">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transfer No</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kaynak</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hedef</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {transfers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <Boxes className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p>Henüz transfer fişi yok</p>
                                        </td>
                                    </tr>
                                ) : (
                                    transfers.map((t: WarehouseTransfer) => (
                                        <tr key={t.id}>
                                            <td className="px-6 py-4 font-mono text-sm">{t.transfer_no}</td>
                                            <td className="px-6 py-4 text-sm">{new Date(t.transfer_date).toLocaleDateString('tr-TR')}</td>
                                            <td className="px-6 py-4 text-sm">{(t as any).from_warehouse?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">{(t as any).to_warehouse?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">{t.status}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedTransfer(t);
                                                            setShowForm(true);
                                                        }}
                                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(t.id)}
                                                        className="p-1 text-red-600 hover:bg-red-50 rounded"
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
                )}
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

