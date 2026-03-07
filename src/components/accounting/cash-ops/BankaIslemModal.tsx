/**
 * ExRetailOS - Banka İşlem Modal
 * Banka Giriş, Banka Çıkış, Havale/EFT formları
 * Flat design matching 'Ödeme Al' style
 */

import React, { useState, useEffect } from 'react';
import { X, Calendar, Search, Save, Landmark, RefreshCw } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { createBankaIslemi, type Banka, type BankaIslemi } from '../../../services/api/banka';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';

interface BankaIslemModalProps {
    banka: Banka;
    islemTipi: 'CH_TAHSILAT' | 'CH_ODEME' | 'BANKA_GIRIS' | 'BANKA_CIKIS' | 'HAVALE' | 'EFT' | 'VIRMAN';
    onClose: () => void;
    onSuccess: () => void;
}

interface CariHesap {
    id: string;
    kod: string;
    unvan: string;
}

import { useLanguage } from '../../../contexts/LanguageContext';

export function BankaIslemModal({
    banka,
    islemTipi,
    onClose,
    onSuccess,
}: BankaIslemModalProps) {
    const { t, tm } = useLanguage();
    const { selectedFirm, selectedPeriod } = useFirmaDonem();

    // State
    const [loading, setLoading] = useState(false);
    const [cariHesaplar, setCariHesaplar] = useState<CariHesap[]>([]);
    const [showCariDropdown, setShowCariDropdown] = useState(false);
    const [cariSearch, setCariSearch] = useState('');

    // Form state
    const [formData, setFormData] = useState<Partial<BankaIslemi>>({
        firma_id: selectedFirm?.id || selectedFirm?.nr.toString() || '',
        banka_id: banka.id,
        islem_tarihi: new Date().toISOString().split('T')[0],
        islem_tipi: islemTipi,
        tutar: 0,
        islem_no: '',
        islem_aciklamasi: '',
    });

    useEffect(() => {
        if (selectedFirm && (islemTipi === 'CH_TAHSILAT' || islemTipi === 'CH_ODEME' || islemTipi === 'HAVALE' || islemTipi === 'EFT')) {
            loadCariHesaplar();
        }
    }, [selectedFirm, islemTipi]);

    const loadCariHesaplar = async () => {
        try {
            const data = await fetchCurrentAccounts(selectedFirm?.id || selectedFirm?.nr.toString() || '');
            setCariHesaplar(data.map((acc: any) => ({
                id: acc.id,
                kod: acc.kod,
                unvan: acc.unvan,
            })));
        } catch (error) {
            console.error('[BankaIslemModal] Cari hesaplar yüklenemedi:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.tutar || formData.tutar <= 0) {
            toast.error(tm('enterValue'));
            return;
        }

        setLoading(true);
        try {
            await createBankaIslemi(formData as BankaIslemi);
            toast.success(tm('success'));
            onSuccess();
        } catch (error: any) {
            toast.error(error.message || t.error);
        } finally {
            setLoading(false);
        }
    };

    const handleCariSelect = (cari: CariHesap) => {
        setFormData({
            ...formData,
            islem_aciklamasi: `${getModalTitle()}: ${cari.kod} - ${cari.unvan}`,
        });
        setShowCariDropdown(false);
        setCariSearch(cari.kod);
    };

    const filteredCariHesaplar = cariHesaplar.filter(c =>
        c.kod.toLowerCase().includes(cariSearch.toLowerCase()) ||
        c.unvan.toLowerCase().includes(cariSearch.toLowerCase())
    );

    const getModalTitle = () => {
        const titles: Record<string, string> = {
            'CH_TAHSILAT': tm('collection'),
            'CH_ODEME': t.payment,
            'BANKA_GIRIS': tm('bankEntry'),
            'BANKA_CIKIS': tm('bankExit'),
            'HAVALE': tm('transfer'),
            'EFT': tm('eft')
        };
        return titles[islemTipi] || tm('bankMovements');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 font-sans">
            <div className="bg-white dark:bg-gray-900 w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
                {/* Header - Flat Blue */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex items-center justify-between border-b dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <Landmark className="w-5 h-5" />
                        <h3 className="text-lg font-bold">{getModalTitle()}</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{tm('bankAccount').toUpperCase()}</label>
                            <div className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded text-sm font-semibold truncate">
                                {banka.banka_adi}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{tm('date').toUpperCase()}</label>
                            <div className="relative">
                                <input
                                    type="date"
                                    value={formData.islem_tarihi}
                                    onChange={(e) => setFormData({ ...formData, islem_tarihi: e.target.value })}
                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{tm('transactionNo').toUpperCase()}</label>
                        <input
                            value={formData.islem_no}
                            onChange={(e) => setFormData({ ...formData, islem_no: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="FT-0001"
                        />
                    </div>

                    {/* Cari Selection (Conditional for transfers) */}
                    {(islemTipi === 'CH_TAHSILAT' || islemTipi === 'CH_ODEME' || islemTipi === 'HAVALE' || islemTipi === 'EFT') && (
                        <div className="space-y-1.5 relative">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{tm('relatedCariAccount').toUpperCase()}</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    value={cariSearch}
                                    onChange={(e) => { setCariSearch(e.target.value); setShowCariDropdown(true); }}
                                    onFocus={() => setShowCariDropdown(true)}
                                    placeholder={tm('searchCariPlaceholder')}
                                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {showCariDropdown && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-2xl z-10 max-h-48 overflow-auto rounded animate-in fade-in slide-in-from-top-2">
                                    {filteredCariHesaplar.map(cari => (
                                        <button key={cari.id} type="button" onClick={() => handleCariSelect(cari)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-blue-600 hover:text-white border-b last:border-0 dark:border-gray-700 transition-colors">
                                            <div className="font-bold">{cari.kod}</div>
                                            <div className="text-[10px] opacity-70 italic">{cari.unvan}</div>
                                        </button>
                                    ))}
                                    {filteredCariHesaplar.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">{tm('matchedCariNotFound')}</div>}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t.amount.toUpperCase()} ({banka.id_doviz_kodu})</label>
                        <input
                            type="number"
                            step="0.01"
                            value={formData.tutar || ''}
                            onChange={(e) => setFormData({ ...formData, tutar: parseFloat(e.target.value) || 0 })}
                            className="w-full px-4 py-4 bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-600 dark:border-blue-800 text-3xl font-black text-blue-700 dark:text-blue-300 outline-none rounded text-center focus:ring-4 focus:ring-blue-600/10"
                            placeholder="0.00"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t.description.toUpperCase()}</label>
                        <textarea
                            value={formData.islem_aciklamasi}
                            onChange={(e) => setFormData({ ...formData, islem_aciklamasi: e.target.value })}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                            placeholder={tm('transactionDetailsPlaceholder')}
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 pt-4 border-t dark:border-gray-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 font-bold rounded hover:bg-gray-200 transition-all active:scale-95"
                        >
                            {t.cancel.toUpperCase()}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[2] px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            {loading ? tm('analyzing').toUpperCase() : tm('saveTransaction').toUpperCase()}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


