import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { stockCountAPI, StockCount } from '../../../services/stockCountAPI';

export function StockCountModule() {
    const { t } = useLanguage();
    const [counts, setCounts] = useState<StockCount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCounts();
    }, []);

    const loadCounts = async () => {
        try {
            setLoading(true);
            const data = await stockCountAPI.getAll();
            setCounts(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu sayımı silmek istediğinizden emin misiniz?')) return;
        try {
            await stockCountAPI.delete(id);
            loadCounts();
        } catch (error) {
            alert('Silme hatası');
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                            <ClipboardList className="w-6 h-6 text-pink-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Sayım Fişleri</h1>
                            <p className="text-sm text-gray-500">Stok sayım işlemleri</p>
                        </div>
                    </div>
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sayım No</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Depo</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {counts.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p>Henüz sayım fişi yok</p>
                                        </td>
                                    </tr>
                                ) : (
                                    counts.map((c) => (
                                        <tr key={c.id}>
                                            <td className="px-6 py-4 font-mono text-sm">{c.count_no}</td>
                                            <td className="px-6 py-4 text-sm">{new Date(c.count_date).toLocaleDateString('tr-TR')}</td>
                                            <td className="px-6 py-4 text-sm">{(c as any).warehouses?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="px-2 py-1 bg-pink-100 text-pink-800 rounded-full text-xs">{c.status}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleDelete(c.id)} className="text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

