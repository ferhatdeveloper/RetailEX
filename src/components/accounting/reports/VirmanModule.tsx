import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Plus, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { virmanAPI, VirmanOperation } from '../../../services/virmanAPI';

export function VirmanModule() {
    const { t } = useLanguage();
    const [virmans, setVirmans] = useState<VirmanOperation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadVirmans();
    }, []);

    const loadVirmans = async () => {
        try {
            setLoading(true);
            const data = await virmanAPI.getAll();
            setVirmans(data);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu virmanı silmek istediğinizden emin misiniz?')) return;
        try {
            await virmanAPI.delete(id);
            loadVirmans();
        } catch (error) {
            alert('Silme hatası');
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <ArrowRightLeft className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Virman Fişleri</h1>
                            <p className="text-sm text-gray-500">Depolar arası virman işlemleri</p>
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Virman No</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tarih</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kaynak</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hedef</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {virmans.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p>Henüz virman fişi yok</p>
                                        </td>
                                    </tr>
                                ) : (
                                    virmans.map((v) => (
                                        <tr key={v.id}>
                                            <td className="px-6 py-4 font-mono text-sm">{v.virman_no}</td>
                                            <td className="px-6 py-4 text-sm">{new Date(v.operation_date).toLocaleDateString('tr-TR')}</td>
                                            <td className="px-6 py-4 text-sm">{(v as any).from_warehouse?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">{(v as any).to_warehouse?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs">{v.status}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleDelete(v.id)} className="text-red-600">
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

