import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { PalletSelector, PalletType } from './PalletSelector';
import { ExpiryAndBatchInput } from './ExpiryAndBatchInput';

interface ReceivingItem {
    id?: string;
    product_id: string;
    product_name?: string;
    ordered_quantity: number;
    received_quantity: number;
    accepted_quantity: number;
    rejected_quantity: number;
    rejection_reason?: string;
    expiry_date?: string;
    lot_number?: string;
    pallet_type?: PalletType;
    unit: string;
    unit_cost: number;
    [key: string]: any;
}

interface ConditionalReceivingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: ReceivingItem) => void;
    item: ReceivingItem;
    darkMode?: boolean;
}

export const ConditionalReceivingModal: React.FC<ConditionalReceivingModalProps> = ({
    isOpen,
    onClose,
    onSave,
    item,
    darkMode = false
}) => {
    const [formData, setFormData] = useState<ReceivingItem>(item);
    const [rejectionReason, setRejectionReason] = useState(item.rejection_reason || '');

    useEffect(() => {
        setFormData(item);
        setRejectionReason(item.rejection_reason || '');
    }, [item, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        // Basic validation
        if (formData.rejected_quantity > 0 && !rejectionReason) {
            alert('Lütfen red nedenini belirtin.');
            return;
        }
        onSave({ ...formData, rejection_reason: rejectionReason });
        onClose();
    };

    const bgClass = darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900';
    const inputClass = `w-full px-3 py-2 border rounded-md ${darkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 overflow-y-auto">
            <div className={`${bgClass} rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]`}>

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Package className="text-blue-500" />
                            Şartlı Mal Kabul Detayı
                        </h2>
                        <p className="text-sm opacity-75">{item.product_name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-8">

                    {/* 1. Miktar ve Şartlı Kabul */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <CheckCircle size={20} className="text-green-500" />
                            Miktar Kontrolü
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium mb-1 opacity-75">Sipariş Edilen</label>
                                <div className={`text-2xl font-bold px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700`}>
                                    {item.ordered_quantity}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Kabul Edilen</label>
                                <input
                                    type="number"
                                    value={formData.accepted_quantity}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setFormData(prev => ({ ...prev, accepted_quantity: val, received_quantity: val + prev.rejected_quantity }));
                                    }}
                                    className={`${inputClass} text-2xl font-bold text-green-600`}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 text-red-500">Reddedilen / Hasarlı</label>
                                <input
                                    type="number"
                                    value={formData.rejected_quantity}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        setFormData(prev => ({ ...prev, rejected_quantity: val, received_quantity: prev.accepted_quantity + val }));
                                    }}
                                    className={`${inputClass} text-2xl font-bold text-red-600`}
                                />
                            </div>
                        </div>

                        {formData.rejected_quantity > 0 && (
                            <div className="mt-4 animate-fadeIn">
                                <label className="block text-sm font-medium mb-1 text-red-500">Red Nedeni *</label>
                                <select
                                    value={rejectionReason}
                                    onChange={e => setRejectionReason(e.target.value)}
                                    className={`${inputClass} border-red-300 ring-1 ring-red-200`}
                                >
                                    <option value="">Seçiniz...</option>
                                    <option value="damaged">Hasarlı Ürün</option>
                                    <option value="expired">SKT Sorunu</option>
                                    <option value="quality">Kalite Yetersiz</option>
                                    <option value="wrong_item">Yanlış Ürün</option>
                                    <option value="other">Diğer</option>
                                </select>
                            </div>
                        )}
                    </section>

                    <hr className="dark:border-gray-700" />

                    {/* 2. Lot ve SKT */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <AlertTriangle size={20} className="text-amber-500" />
                            Lot ve SKT Bilgileri
                        </h3>
                        <ExpiryAndBatchInput
                            batchNo={formData.lot_number || ''}
                            onChangeBatch={val => setFormData(prev => ({ ...prev, lot_number: val }))}
                            expiryDate={formData.expiry_date || ''}
                            onChangeExpiry={val => setFormData(prev => ({ ...prev, expiry_date: val }))}
                            className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg"
                        />
                    </section>

                    <hr className="dark:border-gray-700" />

                    {/* 3. Palet Seçimi */}
                    <section>
                        <h3 className="text-lg font-semibold mb-4">Palet Tipi Seçimi</h3>
                        <PalletSelector
                            selectedType={formData.pallet_type}
                            onSelect={type => setFormData(prev => ({ ...prev, pallet_type: type }))}
                        />
                    </section>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors"
                    >
                        İptal
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-lg transition-all"
                    >
                        Kaydet
                    </button>
                </div>
            </div>
        </div>
    );
};

