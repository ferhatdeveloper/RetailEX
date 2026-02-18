import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Package, Warehouse, Search } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { warehouseTransferAPI, WarehouseTransfer, WarehouseTransferItem } from '../../../services/warehouseTransferAPI';
import { warehouseAPI, Warehouse as WarehouseType } from '../../../services/warehouseAPI';
import { productAPI } from '../../../services/api/products';
import { MasterDataSelectionModal } from '../../shared/MasterDataSelectionModal';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { toast } from 'sonner';

interface WarehouseTransferFormProps {
    transfer?: WarehouseTransfer; // If provided, we are in edit mode
    onClose: () => void;
    onSave: () => void;
}

interface TransferItemState {
    id?: string;
    product_id: string;
    product_name: string;
    product_code: string;
    quantity: number;
    notes?: string;
}

export function WarehouseTransferForm({ transfer, onClose, onSave }: WarehouseTransferFormProps) {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    // Selection Modals State
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [showDestModal, setShowDestModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);

    const [formData, setFormData] = useState({
        transfer_no: transfer?.transfer_no || `TRF-${Date.now().toString().slice(-6)}`,
        from_warehouse_id: transfer?.from_warehouse_id || '',
        from_warehouse_name: (transfer as any)?.from_warehouse?.name || '',
        to_warehouse_id: transfer?.to_warehouse_id || '',
        to_warehouse_name: (transfer as any)?.to_warehouse?.name || '',
        transfer_date: transfer?.transfer_date ? new Date(transfer.transfer_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        status: transfer?.status || 'pending',
        notes: transfer?.notes || ''
    });

    const [items, setItems] = useState<TransferItemState[]>([]);

    useEffect(() => {
        loadMasterData();
        if (transfer) {
            loadTransferItems();
        }
    }, [transfer]);

    const loadMasterData = async () => {
        try {
            const [wData, pData] = await Promise.all([
                warehouseAPI.getActive(),
                productAPI.getAll()
            ]);
            setWarehouses(wData);
            setProducts(pData);
        } catch (error) {
            console.error('Error loading master data:', error);
            toast.error('Veriler yüklenirken hata oluştu');
        }
    };

    const loadTransferItems = async () => {
        if (!transfer) return;
        try {
            const data = await warehouseTransferAPI.getById(transfer.id);
            if (data && (data as any).warehouse_transfer_items) {
                const mappedItems = (data as any).warehouse_transfer_items.map((item: any) => ({
                    id: item.id,
                    product_id: item.product_id,
                    product_name: item.products?.name || 'Bilinmeyen Ürün',
                    product_code: item.products?.code || '',
                    quantity: item.quantity,
                    notes: item.notes
                }));
                setItems(mappedItems);
            }
        } catch (error) {
            console.error('Error loading transfer items:', error);
        }
    };

    const handleAddItem = (product: any) => {
        const existingItem = items.find((i: TransferItemState) => i.product_id === product.id);
        if (existingItem) {
            setItems(items.map((i: TransferItemState) =>
                i.product_id === product.id
                    ? { ...i, quantity: i.quantity + 1 }
                    : i
            ));
        } else {
            setItems([...items, {
                product_id: product.id,
                product_name: product.name,
                product_code: product.code || '',
                quantity: 1
            }]);
        }
        setShowProductModal(false);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_: TransferItemState, i: number) => i !== index));
    };

    const handleQuantityChange = (index: number, val: number) => {
        const newItems = [...items];
        newItems[index].quantity = Math.max(0.1, val);
        setItems(newItems);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.from_warehouse_id || !formData.to_warehouse_id) {
            toast.error('Lütfen kaynak ve hedef depoları seçin');
            return;
        }

        if (formData.from_warehouse_id === formData.to_warehouse_id) {
            toast.error('Kaynak ve hedef depo aynı olamaz');
            return;
        }

        if (items.length === 0) {
            toast.error('Lütfen en az bir ürün ekleyin');
            return;
        }

        try {
            setLoading(true);
            const payloadTransfer = {
                transfer_no: formData.transfer_no,
                from_warehouse_id: formData.from_warehouse_id,
                to_warehouse_id: formData.to_warehouse_id,
                transfer_date: formData.transfer_date,
                status: formData.status,
                notes: formData.notes
            };

            const payloadItems = items.map((item: TransferItemState) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                notes: item.notes
            }));

            if (transfer) {
                await warehouseTransferAPI.update(transfer.id, payloadTransfer, payloadItems);
                toast.success('Transfer başarıyla güncellendi');
            } else {
                await warehouseTransferAPI.create(payloadTransfer, payloadItems);
                toast.success('Transfer başarıyla oluşturuldu');
            }
            onSave();
            onClose();
        } catch (error: any) {
            console.error('Error saving transfer:', error);
            toast.error('Kaydetme hatası: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between bg-teal-600 text-white">
                    <div className="flex items-center gap-3">
                        <Warehouse className="w-6 h-6" />
                        <h2 className="text-xl font-bold">
                            {transfer ? 'Transfer Fişini Düzenle' : 'Yeni Depo Transferi'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-6">
                    {/* Header Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Transfer No</label>
                            <Input
                                value={formData.transfer_no}
                                onChange={e => setFormData({ ...formData, transfer_no: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Tarih</label>
                            <Input
                                type="date"
                                value={formData.transfer_date}
                                onChange={e => setFormData({ ...formData, transfer_date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Durum</label>
                            <select
                                className="w-full h-10 px-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-teal-500 outline-none"
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="pending">Beklemede</option>
                                <option value="completed">Tamamlandı</option>
                                <option value="cancelled">İptal Edildi</option>
                            </select>
                        </div>
                    </div>

                    {/* Warehouses */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Search className="w-4 h-4 text-teal-600" />
                                Kaynak Depo
                            </label>
                            <div
                                onClick={() => setShowSourceModal(true)}
                                className="h-10 px-3 flex items-center border border-gray-300 rounded-md cursor-pointer hover:border-teal-500 transition-colors bg-gray-50 hover:bg-white overflow-hidden text-ellipsis whitespace-nowrap"
                            >
                                {formData.from_warehouse_name || 'Kaynak depo seçin...'}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Search className="w-4 h-4 text-teal-600" />
                                Hedef Depo
                            </label>
                            <div
                                onClick={() => setShowDestModal(true)}
                                className="h-10 px-3 flex items-center border border-gray-300 rounded-md cursor-pointer hover:border-teal-500 transition-colors bg-gray-50 hover:bg-white overflow-hidden text-ellipsis whitespace-nowrap"
                            >
                                {formData.to_warehouse_name || 'Hedef depo seçin...'}
                            </div>
                        </div>
                    </div>

                    {/* Products Table */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Package className="w-5 h-5 text-teal-600" />
                                Ürünler
                            </h3>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowProductModal(true)}
                                className="flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Ürün Ekle
                            </Button>
                        </div>

                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full border-collapse">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Ürün</th>
                                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase w-32">Miktar</th>
                                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Not</th>
                                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase w-20">Sil</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {items.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">
                                                Henüz ürün eklenmedi
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item: TransferItemState, index: number) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                                                    <div className="text-xs text-gray-500">{item.product_code}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        type="number"
                                                        step="0.1"
                                                        value={item.quantity}
                                                        onChange={e => handleQuantityChange(index, parseFloat(e.target.value))}
                                                        className="text-center"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <Input
                                                        value={item.notes || ''}
                                                        onChange={e => {
                                                            const newItems = [...items];
                                                            newItems[index].notes = e.target.value;
                                                            setItems(newItems);
                                                        }}
                                                        placeholder="Kısa not..."
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveItem(index)}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Genel Açıklama</label>
                        <Textarea
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Transfer hakkında ek bilgiler..."
                            rows={3}
                        />
                    </div>
                </form>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                        İptal
                    </Button>
                    <Button
                        type="submit"
                        onClick={handleSubmit}
                        className="bg-teal-600 hover:bg-teal-700 text-white gap-2"
                        disabled={loading}
                    >
                        {loading ? 'Kaydediliyor...' : <><Save className="w-4 h-4" /> Kaydet</>}
                    </Button>
                </div>
            </div>

            {/* Selection Modals */}
            {showSourceModal && (
                <MasterDataSelectionModal
                    title="Kaynak Depo Seçin"
                    items={warehouses.map((w: WarehouseType) => ({ id: w.id, code: w.code, name: w.name }))}
                    currentValue={formData.from_warehouse_id}
                    onSelect={(item: any) => {
                        setFormData({ ...formData, from_warehouse_id: item.id, from_warehouse_name: item.name });
                        setShowSourceModal(false);
                    }}
                    onClose={() => setShowSourceModal(false)}
                />
            )}

            {showDestModal && (
                <MasterDataSelectionModal
                    title="Hedef Depo Seçin"
                    items={warehouses.map((w: WarehouseType) => ({ id: w.id, code: w.code, name: w.name }))}
                    currentValue={formData.to_warehouse_id}
                    onSelect={(item: any) => {
                        setFormData({ ...formData, to_warehouse_id: item.id, to_warehouse_name: item.name });
                        setShowDestModal(false);
                    }}
                    onClose={() => setShowDestModal(false)}
                />
            )}

            {showProductModal && (
                <MasterDataSelectionModal
                    title="Ürün Seçin"
                    items={products.map((p: any) => ({ id: p.id, code: p.code || p.barcode, name: p.name, description: p.category }))}
                    currentValue=""
                    onSelect={handleAddItem}
                    onClose={() => setShowProductModal(false)}
                />
            )}
        </div>
    );
}

