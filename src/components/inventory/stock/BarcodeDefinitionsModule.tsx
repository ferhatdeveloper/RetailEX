import React, { useState, useEffect } from 'react';
import { QrCode, Plus, Search, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { barcodeAPI, ProductBarcode, CreateBarcodeInput } from '../../../services/barcodeAPI';

export function BarcodeDefinitionsModule() {
    const { t } = useLanguage();
    const [barcodes, setBarcodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState<CreateBarcodeInput>({
        product_id: '',
        barcode: '',
        barcode_type: 'EAN13',
        is_primary: false,
    });

    useEffect(() => {
        loadBarcodes();
    }, []);

    const loadBarcodes = async () => {
        try {
            setLoading(true);
            const data = await barcodeAPI.getAll();
            setBarcodes(data);
        } catch (error) {
            console.error('Error loading barcodes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await barcodeAPI.create(formData);
            setShowModal(false);
            resetForm();
            loadBarcodes();
        } catch (error: any) {
            alert(error.message || 'Barkod eklenirken hata oluştu');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu barkodu silmek istediğinizden emin misiniz?')) return;
        try {
            await barcodeAPI.delete(id);
            loadBarcodes();
        } catch (error) {
            alert('Barkod silinirken hata oluştu');
        }
    };

    const resetForm = () => {
        setFormData({
            product_id: '',
            barcode: '',
            barcode_type: 'EAN13',
            is_primary: false,
        });
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <QrCode className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Barkod Tanımları</h1>
                            <p className="text-sm text-gray-500">Ürün barkod tanımlarını yönetin</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <Plus className="w-5 h-5" />
                        Yeni Barkod
                    </button>
                </div>
            </div>

            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Barkod veya ürün adı ile ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-500">Yükleniyor...</div>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barkod</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tip</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birincil</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {barcodes.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            <QrCode className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p className="text-lg font-medium">Henüz barkod yok</p>
                                        </td>
                                    </tr>
                                ) : (
                                    barcodes.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-6 py-4 font-mono text-sm">{item.barcode}</td>
                                            <td className="px-6 py-4 text-sm">{item.products?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">{item.barcode_type}</td>
                                            <td className="px-6 py-4 text-sm">
                                                {item.is_primary ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Evet</span>
                                                ) : (
                                                    <span className="text-gray-400">Hayır</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-600 hover:text-red-900"
                                                >
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

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h2 className="text-xl font-bold">Yeni Barkod</h2>
                            <button onClick={() => { setShowModal(false); resetForm(); }}>
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Barkod *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.barcode}
                                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Ürün ID *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.product_id}
                                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ürün UUID"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Barkod Tipi</label>
                                <select
                                    value={formData.barcode_type}
                                    onChange={(e) => setFormData({ ...formData, barcode_type: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="EAN13">EAN13</option>
                                    <option value="EAN8">EAN8</option>
                                    <option value="UPC">UPC</option>
                                    <option value="CODE128">CODE128</option>
                                </select>
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={formData.is_primary}
                                    onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <label className="ml-2 text-sm">Birincil Barkod</label>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); resetForm(); }}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    İptal
                                </button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                    Kaydet
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

