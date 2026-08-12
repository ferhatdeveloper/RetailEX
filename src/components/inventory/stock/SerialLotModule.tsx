import React, { useState, useEffect } from 'react';
import { Tag, Plus, Search, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { serialLotAPI, SerialLotNumber, CreateSerialLotInput } from '../../../services/serialLotAPI';

export function SerialLotModule() {
    const { t } = useLanguage();
    const [items, setItems] = useState<SerialLotNumber[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'serial' | 'lot'>('serial');
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState<CreateSerialLotInput>({
        product_id: '',
        type: 'serial',
        number: '',
        quantity: 1,
        expiry_date: '',
        warehouse_id: '',
        status: 'available',
    });

    useEffect(() => {
        loadItems();
    }, []);

    const loadItems = async () => {
        try {
            setLoading(true);
            const data = await serialLotAPI.getAll();
            setItems(data);
        } catch (error) {
            console.error('Error loading items:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await serialLotAPI.create({ ...formData, type: activeTab });
            setShowModal(false);
            resetForm();
            loadItems();
        } catch (error: any) {
            alert(error.message || 'Kayıt eklenirken hata oluştu');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu kaydı silmek istediğinizden emin misiniz?')) return;
        try {
            await serialLotAPI.delete(id);
            loadItems();
        } catch (error) {
            alert('Kayıt silinirken hata oluştu');
        }
    };

    const resetForm = () => {
        setFormData({
            product_id: '',
            type: activeTab,
            number: '',
            quantity: 1,
            expiry_date: '',
            warehouse_id: '',
            status: 'available',
        });
    };

    const filteredItems = items.filter(item => item.type === activeTab);

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Tag className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Seri/Parti Tanımları</h1>
                            <p className="text-sm text-gray-500">Ürün seri ve parti numaralarını yönetin</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                        <Plus className="w-5 h-5" />
                        Yeni Tanım
                    </button>
                </div>
            </div>

            <div className="bg-white border-b border-gray-200 px-6">
                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveTab('serial')}
                        className={`px-4 py-3 border-b-2 font-medium ${activeTab === 'serial' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'
                            }`}
                    >
                        Seri Numaraları
                    </button>
                    <button
                        onClick={() => setActiveTab('lot')}
                        className={`px-4 py-3 border-b-2 font-medium ${activeTab === 'lot' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'
                            }`}
                    >
                        Parti Numaraları
                    </button>
                </div>
            </div>

            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                    type="text"
                    placeholder={`${activeTab === 'serial' ? 'Seri' : 'Parti'} numarası ile ara...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
            </div>

            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">Yükleniyor...</div>
                ) : (
                    <div className="bg-white rounded-lg shadow-sm border">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                        {activeTab === 'serial' ? 'Seri No' : 'Parti No'}
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Miktar</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p>Henüz {activeTab === 'serial' ? 'seri' : 'parti'} numarası yok</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map((item) => (
                                        <tr key={item.id}>
                                            <td className="px-6 py-4 font-mono text-sm">{item.number}</td>
                                            <td className="px-6 py-4 text-sm">{(item as any).products?.name || '-'}</td>
                                            <td className="px-6 py-4 text-sm">{item.quantity || '-'}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900">
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
                            <h2 className="text-xl font-bold">Yeni {activeTab === 'serial' ? 'Seri' : 'Parti'} Numarası</h2>
                            <button onClick={() => { setShowModal(false); resetForm(); }}><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Numara *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.number}
                                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Ürün ID *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.product_id}
                                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            {activeTab === 'lot' && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">Miktar</label>
                                    <input
                                        type="number"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-4">
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 border rounded-lg">İptal</button>
                                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg">Kaydet</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

