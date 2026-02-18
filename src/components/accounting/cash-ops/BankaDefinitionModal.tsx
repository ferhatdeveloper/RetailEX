/**
 * ExRetailOS - Banka Tanım Modal
 * Yeni banka hesabı ekleme ve düzenleme
 * Flat design matching 'Ödeme Al' style
 */

import React, { useState } from 'react';
import { X, Save, Landmark, Info } from 'lucide-react';
import { createBanka, updateBanka, type Banka } from '../../../services/api/banka';
import { toast } from 'sonner';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';

interface BankaDefinitionModalProps {
    banka?: Banka | null;
    onClose: () => void;
    onSuccess: () => void;
}

import { useLanguage } from '../../../contexts/LanguageContext';

export function BankaDefinitionModal({ banka, onClose, onSuccess }: BankaDefinitionModalProps) {
    const { t, tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<Partial<Banka>>(
        banka || {
            firma_id: selectedFirm?.id || selectedFirm?.nr.toString() || '',
            banka_kodu: '',
            banka_adi: '',
            sube_adi: '',
            hesap_no: '',
            iban: '',
            id_doviz_kodu: 'IQD',
            bakiye: 0,
            aktif: true,
        }
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.banka_kodu || !formData.banka_adi) {
            toast.error(tm('fillRequiredFields'));
            return;
        }

        setLoading(true);
        try {
            if (banka?.id) {
                await updateBanka(banka.id, formData);
                toast.success(tm('success'));
            } else {
                await createBanka(formData);
                toast.success(tm('success'));
            }
            onSuccess();
        } catch (error: any) {
            console.error('[BankaDefinitionModal] Save error:', error);
            toast.error(t.error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-900 w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header - Flat Blue Style */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex items-center justify-between border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Landmark className="w-5 h-5" />
                        <h3 className="text-lg font-semibold">{banka ? tm('editBankAccount') : tm('newBankAccount')}</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('code')}</label>
                                <input
                                    required
                                    value={formData.banka_kodu}
                                    onChange={(e) => setFormData({ ...formData, banka_kodu: e.target.value.toUpperCase() })}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                    placeholder="AKBANK-01"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('bankBankName')}</label>
                                <input
                                    required
                                    value={formData.banka_adi}
                                    onChange={(e) => setFormData({ ...formData, banka_adi: e.target.value })}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                    placeholder="Akbank T.A.Ş."
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('branchName')}</label>
                                <input
                                    value={formData.sube_adi}
                                    onChange={(e) => setFormData({ ...formData, sube_adi: e.target.value })}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                    placeholder="Merkez Şubesi"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('accountNo')}</label>
                                <input
                                    value={formData.hesap_no}
                                    onChange={(e) => setFormData({ ...formData, hesap_no: e.target.value })}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('iban')}</label>
                            <input
                                value={formData.iban}
                                onChange={(e) => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
                                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded font-mono text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                placeholder="TR00 0000 0000 ..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('currency')}</label>
                                <select
                                    value={formData.id_doviz_kodu}
                                    onChange={(e) => setFormData({ ...formData, id_doviz_kodu: e.target.value })}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                >
                                    <option value="IQD">IQD</option>
                                    <option value="USD">USD</option>
                                    <option value="EUR">EUR</option>
                                    <option value="TRY">TRY</option>
                                </select>
                            </div>
                            {!banka && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{tm('openingBalance')}</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.bakiye}
                                        onChange={(e) => setFormData({ ...formData, bakiye: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-100 dark:border-blue-800/30 flex gap-2.5">
                            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-700 dark:text-blue-300 leading-normal">
                                {tm('bankManagementDesc')}
                            </p>
                        </div>
                    </div>

                    {/* Footer - Flat Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[2] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {loading ? tm('analyzing') : tm('saveAccount')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
