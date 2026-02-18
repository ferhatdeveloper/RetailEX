import React, { useState, useEffect } from 'react';
import { Warehouse, Plus, Search, Edit2, Trash2, Building2, X, MapPin, Phone, User } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { BaseModal } from '../../shared/BaseModal';
import { warehouseAPI, Warehouse as WarehouseType, CreateWarehouseInput } from '../../../services/warehouseAPI';

export function WarehouseDefinitionsModule() {
    const { t } = useLanguage();
    const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingWarehouse, setEditingWarehouse] = useState<WarehouseType | null>(null);
    const [formData, setFormData] = useState<CreateWarehouseInput>({
        code: '',
        name: '',
        description: '',
        address: '',
        city: '',
        phone: '',
        manager_name: '',
        is_active: true,
    });

    useEffect(() => {
        loadWarehouses();
    }, []);

    const loadWarehouses = async () => {
        try {
            setLoading(true);
            const data = await warehouseAPI.getAll();
            setWarehouses(data);
        } catch (error) {
            console.error('Error loading warehouses:', error);
            alert('Depolar yüklenirken hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            loadWarehouses();
            return;
        }
        try {
            const data = await warehouseAPI.search(searchQuery);
            setWarehouses(data);
        } catch (error) {
            console.error('Error searching:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingWarehouse) {
                await warehouseAPI.update(editingWarehouse.id, formData);
            } else {
                await warehouseAPI.create(formData);
            }
            setShowModal(false);
            resetForm();
            loadWarehouses();
        } catch (error: any) {
            console.error('Error saving warehouse:', error);
            alert(error.message || 'Depo kaydedilirken hata oluştu');
        }
    };

    const handleEdit = (warehouse: WarehouseType) => {
        setEditingWarehouse(warehouse);
        setFormData({
            code: warehouse.code,
            name: warehouse.name,
            description: warehouse.description || '',
            address: warehouse.address || '',
            city: warehouse.city || '',
            phone: warehouse.phone || '',
            manager_name: warehouse.manager_name || '',
            is_active: warehouse.is_active,
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Bu depoyu silmek istediğinizden emin misiniz?')) return;
        try {
            await warehouseAPI.delete(id);
            loadWarehouses();
        } catch (error) {
            console.error('Error deleting warehouse:', error);
            alert('Depo silinirken hata oluştu');
        }
    };

    const handleToggleActive = async (warehouse: WarehouseType) => {
        try {
            await warehouseAPI.toggleActive(warehouse.id);
            loadWarehouses();
        } catch (error) {
            console.error('Error toggling status:', error);
        }
    };

    const resetForm = () => {
        setFormData({
            code: '',
            name: '',
            description: '',
            address: '',
            city: '',
            phone: '',
            manager_name: '',
            is_active: true,
        });
        setEditingWarehouse(null);
    };

    const filteredWarehouses = warehouses.filter((w: WarehouseType) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.city && w.city.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Warehouse className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Depo Tanımları</h1>
                            <p className="text-sm text-gray-500">Depo bilgilerini yönetin</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            resetForm();
                            setShowModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        Yeni Depo
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Depo adı, kodu veya şehir ile ara..."
                            value={searchQuery}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                            onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
            </div>

            {/* Content */}
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kod</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Depo Adı</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Şehir</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Yetkili</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Durum</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredWarehouses.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            <Warehouse className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                            <p className="text-lg font-medium">Henüz depo yok</p>
                                            <p className="text-sm mt-1">Yeni depo eklemek için yukarıdaki butonu kullanın</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredWarehouses.map((warehouse: WarehouseType) => (
                                        <tr key={warehouse.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className="font-mono text-sm font-medium text-gray-900">{warehouse.code}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900">{warehouse.name}</div>
                                                {warehouse.description && (
                                                    <div className="text-sm text-gray-500">{warehouse.description}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {warehouse.city || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {warehouse.manager_name || '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button
                                                    onClick={() => handleToggleActive(warehouse)}
                                                    className={`px-2 py-1 text-xs font-medium rounded-full ${warehouse.is_active
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-gray-100 text-gray-800'
                                                        }`}
                                                >
                                                    {warehouse.is_active ? 'Aktif' : 'Pasif'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={() => handleEdit(warehouse)}
                                                    className="text-blue-600 hover:text-blue-900 mr-3"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(warehouse.id)}
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

            {/* Modal */}
            <BaseModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    // resetForm(); // Optional: reset on close or keep data
                }}
                title={editingWarehouse ? 'Depo Düzenle' : 'Yeni Depo'}
                maxWidth="max-w-2xl"
                footer={
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                setShowModal(false);
                                resetForm();
                            }}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm shadow-blue-200"
                        >
                            {editingWarehouse ? 'Güncelle' : 'Kaydet'}
                        </button>
                    </>
                }
            >
                <form id="warehouse-form" onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Depo Kodu *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.code}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, code: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="ANA-DEPO"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Depo Adı *
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="Ana Depo"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Açıklama
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFormData({ ...formData, description: e.target.value })}
                            rows={2}
                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                            placeholder="Depo açıklaması..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            <MapPin className="w-4 h-4 inline mr-1" />
                            Adres
                        </label>
                        <input
                            type="text"
                            value={formData.address}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, address: e.target.value })}
                            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            placeholder="Adres bilgisi"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Şehir
                            </label>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, city: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="İstanbul"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <Phone className="w-4 h-4 inline mr-1" />
                                Telefon
                            </label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="0212 XXX XX XX"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                <User className="w-4 h-4 inline mr-1" />
                                Yetkili
                            </label>
                            <input
                                type="text"
                                value={formData.manager_name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, manager_name: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder="Yetkili adı"
                            />
                        </div>
                    </div>

                    <div className="flex items-center pt-2">
                        <input
                            type="checkbox"
                            id="is_active"
                            checked={formData.is_active}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, is_active: e.target.checked })}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 cursor-pointer">
                            Aktif
                        </label>
                    </div>
                </form>
            </BaseModal>
        </div>
    );
}

