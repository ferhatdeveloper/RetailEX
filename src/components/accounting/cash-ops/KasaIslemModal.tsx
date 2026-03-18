/**
 * ExRetailOS - Kasa İşlem Modal
 * CH Tahsilat, CH Ödeme, Kasa Giriş, Kasa Çıkış formları
 * Flat design matching 'Ödeme Al' style
 */

import { useState, useEffect } from 'react';
import { X, Calendar, Search, Save, Wallet } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import { createKasaIslemi, fetchKasalar, type Kasa, type KasaIslemi } from '../../../services/api/kasa';
import { fetchBankalar, type Banka } from '../../../services/api/banka';
import { fetchCurrentAccounts } from '../../../services/api/currentAccounts';
import { formatCurrency, formatNumber, parseNumber } from '../../../utils/formatNumber';

interface KasaIslemModalProps {
  kasa: Kasa;
  islemTipi: 'CH_TAHSILAT' | 'CH_ODEME' | 'KASA_GIRIS' | 'KASA_CIKIS' | 'BANKA_YATIRILAN' | 'BANKADAN_CEKILEN' | 'VIRMAN' | 'GIDER_PUSULASI' | 'VERILEN_SERBEST_MESLEK' | 'ALINAN_SERBEST_MESLEK' | 'MUSTAHSIL_MAKBUZU' | 'ACILIS_BORC' | 'ACILIS_ALACAK' | 'KUR_FARKI_BORC' | 'KUR_FARKI_ALACAK';
  onClose: () => void;
  onSuccess: () => void;
}

interface CariHesap {
  id: string;
  kod: string;
  unvan: string;
  bakiye?: number;
}

export function KasaIslemModal({
  kasa,
  islemTipi,
  onClose,
  onSuccess,
}: KasaIslemModalProps) {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const { t } = useLanguage();

  // State
  const [loading, setLoading] = useState(false);

  // Form state
  // Determine sign based on type
  // CIKIS/ODEME/YATIRILAN(Bankaya) = -1 OUT
  // GIRIS/TAHSILAT/CEKILEN(Bankadan) = 1 IN
  // VIRMAN = -1 (Source), +1 (Target - handled backend or second insert)

  const [formData, setFormData] = useState<Partial<KasaIslemi>>({
    firma_id: selectedFirma?.id || '',
    donem_id: selectedDonem?.id || '',
    kasa_id: kasa.id,
    islem_tarihi: new Date().toISOString().split('T')[0],
    islem_saati: new Date().toTimeString().slice(0, 5),
    duzenlenme_tarihi: new Date().toISOString().split('T')[0],
    islem_tipi: islemTipi,
    doviz_kodu: kasa.id_doviz_kodu || 'USD',
    tutar: 0,
    dovizli_tutar: 0,
    // Defaults
    tax_rate: 0,
    withholding_tax_rate: 0
  });

  // Amount Formatting Logic
  const [displayAmount, setDisplayAmount] = useState('');

  // Sync display amount when formData.tutar changes (initial load or external change)
  useEffect(() => {
    if (formData.tutar !== undefined && formData.tutar !== parseNumber(displayAmount)) {
      // Only update if significantly different to avoid cursor jumping if we were to format on type
      // For initial load:
      if (displayAmount === '') {
        setDisplayAmount(formData.tutar === 0 ? '' : formatNumber(formData.tutar));
      }
    }
  }, [formData.tutar]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow digits, dots, commas
    if (/^[0-9.,]*$/.test(val)) {
      setDisplayAmount(val);
      const parsed = parseNumber(val);
      setFormData(prev => ({ ...prev, tutar: parsed }));
    }
  };

  const handleAmountBlur = () => {
    if (formData.tutar) {
      setDisplayAmount(formatNumber(formData.tutar));
    }
  };

  const handleAmountFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const [cariHesaplar, setCariHesaplar] = useState<CariHesap[]>([]);
  const [bankalar, setBankalar] = useState<Banka[]>([]);
  const [digerKasalar, setDigerKasalar] = useState<Kasa[]>([]);
  const [showCariDropdown, setShowCariDropdown] = useState(false);
  const [cariSearch, setCariSearch] = useState('');
  const [selectedCariBakiye, setSelectedCariBakiye] = useState<number | null>(null);



  useEffect(() => {
    if (selectedFirma && (islemTipi === 'CH_TAHSILAT' || islemTipi === 'CH_ODEME' || islemTipi === 'VERILEN_SERBEST_MESLEK' || islemTipi === 'ALINAN_SERBEST_MESLEK' || islemTipi === 'MUSTAHSIL_MAKBUZU')) {
      loadCariHesaplar();
    }
    if (selectedFirma && (islemTipi === 'BANKA_YATIRILAN' || islemTipi === 'BANKADAN_CEKILEN')) {
      loadBankalar();
    }
    if (selectedFirma && islemTipi === 'VIRMAN') {
      loadDigerKasalar();
    }
  }, [selectedFirma, islemTipi]);

  const loadCariHesaplar = async () => {
    try {
      const data = await fetchCurrentAccounts(selectedFirma?.id || '');
      setCariHesaplar(data.map((acc: any) => ({
        id: acc.id,
        kod: acc.kod,
        unvan: acc.unvan,
        bakiye: acc.bakiye,
      })));
    } catch (error) {
      console.error('[KasaIslemModal] Cari hesaplar yüklenemedi:', error);
    }
  };

  const loadBankalar = async () => {
    try {
      const data = await fetchBankalar({ aktif: true });
      setBankalar(data);
    } catch (error) {
      console.error('[KasaIslemModal] Bankalar yüklenemedi:', error);
    }
  };

  const loadDigerKasalar = async () => {
    try {
      const data = await fetchKasalar({ aktif: true, firm_nr: selectedFirma?.firm_nr });
      // Filter out current kasa
      setDigerKasalar(data.filter(k => k.id !== kasa.id));
    } catch (error) {
      console.error('[KasaIslemModal] Diğer kasalar yüklenemedi:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.tutar || formData.tutar <= 0) {
      toast.error(t['pleaseEnterAmount']);
      return;
    }

    if ((islemTipi === 'CH_TAHSILAT' || islemTipi === 'CH_ODEME') && !formData.cari_hesap_id) {
      toast.error(t['pleaseSelectCurrentAccount']);
      return;
    }

    setLoading(true);
    try {
      console.log('[KasaIslemModal] Submitting formData:', formData);
      if (!formData.kasa_id) {
        throw new Error(t['missingKasaId']);
      }
      await createKasaIslemi(formData as KasaIslemi);
      toast.success(t['operationSavedSuccessfully']);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || t['operationSaveFailed']);
    } finally {
      setLoading(false);
    }
  };

  const handleCariSelect = (cari: CariHesap) => {
    setFormData({
      ...formData,
      cari_hesap_id: cari.id,
      cari_hesap_kodu: cari.kod,
      cari_hesap_unvani: cari.unvan,
    });
    setSelectedCariBakiye(cari.bakiye ?? 0);
    setShowCariDropdown(false);
    setCariSearch(cari.unvan || cari.kod);
  };

  const filteredCariHesaplar = cariHesaplar.filter(c => {
    const query = cariSearch.toLowerCase();
    const codeMatch = (c.kod || '').toLowerCase().includes(query);
    const nameMatch = (c.unvan || '').toLowerCase().includes(query);
    return codeMatch || nameMatch;
  });

  const getModalTitle = () => {
    const titles: Record<string, string> = {
      'CH_TAHSILAT': t['chCollection'],
      'CH_ODEME': t['chPayment'],
      'KASA_GIRIS': t['cashIn'],
      'KASA_CIKIS': t['cashOut'],
      'BANKA_YATIRILAN': t['bankDeposit'],
      'BANKADAN_CEKILEN': t['bankWithdrawal'],
      'VIRMAN': t['cashTransfer'],
      'GIDER_PUSULASI': t['expenseVoucher'],
      'VERILEN_SERBEST_MESLEK': t['selfEmployedReceiptGiven'],
      'ALINAN_SERBEST_MESLEK': t['selfEmployedReceiptReceived'],
      'MUSTAHSIL_MAKBUZU': t['farmersReceipt'],
      'ACILIS_BORC': t['openingDebit'],
      'ACILIS_ALACAK': t['openingCredit'],
      'KUR_FARKI_BORC': t['exchangeDifferenceDebit'],
      'KUR_FARKI_ALACAK': t['exchangeDifferenceCredit'],
    };
    return titles[islemTipi] || t['cashOperation'];
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header - Flat Blue */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex items-center justify-between border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5" />
            <h3 className="text-lg font-semibold">{getModalTitle()}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Main Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['cashRegister']}</label>
              <input readOnly value={`${kasa.kasa_kodu} - ${kasa.kasa_adi}`} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['dateLabel']}</label>
              <div className="relative">
                <input type="date" value={formData.islem_tarihi} onChange={(e) => setFormData({ ...formData, islem_tarihi: e.target.value })} className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Cari Selection (Conditional) */}
          {(islemTipi === 'CH_TAHSILAT' || islemTipi === 'CH_ODEME' || islemTipi === 'VERILEN_SERBEST_MESLEK' || islemTipi === 'ALINAN_SERBEST_MESLEK' || islemTipi === 'MUSTAHSIL_MAKBUZU') && (
            <div className="space-y-1.5 relative">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['currentAccountPersonel']}</label>
              {/* ... existing search input ... */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={formData.cari_hesap_id ? (formData.cari_hesap_unvani || '') : cariSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCariSearch(val);
                    setShowCariDropdown(true);
                    if (formData.cari_hesap_id) {
                      setFormData(prev => ({ ...prev, cari_hesap_id: undefined, cari_hesap_unvani: undefined, cari_hesap_kodu: undefined }));
                      setSelectedCariBakiye(null);
                    }
                  }}
                  onFocus={() => setShowCariDropdown(true)}
                  placeholder={t['searchCurrentAccountPlaceholder']}
                  className={`w-full pl-9 pr-10 py-2.5 bg-white dark:bg-gray-800 border ${formData.cari_hesap_id ? 'border-blue-500 ring-1 ring-blue-500 font-bold text-blue-700' : 'border-gray-300 dark:border-gray-700'} rounded text-sm outline-none transition-all`}
                />
                {/* ... existing clear button and dropdown ... */}
                {formData.cari_hesap_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, cari_hesap_id: undefined, cari_hesap_unvani: undefined, cari_hesap_kodu: undefined }));
                      setSelectedCariBakiye(null);
                      setCariSearch('');
                      setShowCariDropdown(true);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showCariDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 shadow-xl z-10 max-h-48 overflow-auto rounded">
                  {filteredCariHesaplar.map(cari => (
                    <button key={cari.id} type="button" onClick={() => handleCariSelect(cari)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b last:border-0 dark:border-gray-700 flex justify-between items-center group">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-bold uppercase tracking-tighter opacity-70">
                          ID: {cari.kod}
                        </div>
                        <div className="font-bold text-gray-800 dark:text-gray-200 truncate">
                          {cari.unvan || <span className="text-red-400 font-normal">Ünvan belirtilmemiş</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-black ${(cari.bakiye || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(cari.bakiye || 0)}
                        </div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Bakiye</div>
                      </div>
                    </button>
                  ))}
                  {filteredCariHesaplar.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">Cari bulunamadı</div>}
                </div>
              )}
              {selectedCariBakiye !== null && formData.cari_hesap_id && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedCariBakiye >= 0 ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t['currentBalance']}</span>
                  </div>
                  <div className={`text-lg font-black ${selectedCariBakiye >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(selectedCariBakiye)} <span className="text-xs font-normal opacity-70">IQD</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Virman: Target Register Selection */}
          {islemTipi === 'VIRMAN' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['targetKasa']}</label>
              <select
                value={formData.target_register_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, target_register_id: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="">{t['select']}...</option>
                {digerKasalar.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.kasa_kodu} - {k.kasa_adi} ({formatCurrency(k.bakiye)} {k.id_doviz_kodu})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Bank Selection */}
          {(islemTipi === 'BANKA_YATIRILAN' || islemTipi === 'BANKADAN_CEKILEN') && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['bankAccount']}</label>
              <select
                value={formData.bank_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, bank_id: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="">{t['select']}...</option>
                {bankalar.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.banka_kodu} - {b.banka_adi} / {b.sube_adi} ({b.hesap_no}) - {formatCurrency(b.bakiye)} {b.id_doviz_kodu}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Expense Card Selection */}
          {islemTipi === 'GIDER_PUSULASI' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['expenseCodeDescription']}</label>
              <input
                type="text"
                value={formData.expense_card_id || ''} // Using expense_card_id field for text code for now if no lookup
                onChange={(e) => setFormData(prev => ({ ...prev, expense_card_id: e.target.value }))}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
                placeholder={t['expenseCodePlaceholder']}
              />
            </div>
          )}

          {/* Tax Information for SMM / Mustahsil */}
          {(islemTipi === 'VERILEN_SERBEST_MESLEK' || islemTipi === 'ALINAN_SERBEST_MESLEK' || islemTipi === 'MUSTAHSIL_MAKBUZU') && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t dark:border-gray-700">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['withholdingTaxRate']}</label>
                <input
                  type="number"
                  value={formData.withholding_tax_rate || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, withholding_tax_rate: parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['taxRateLabel']}</label>
                <input
                  type="number"
                  value={formData.tax_rate || 0}
                  onChange={(e) => setFormData(prev => ({ ...prev, tax_rate: parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="18" // or 20
                />
              </div>
            </div>
          )}

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['operationAmount']} ({formData.doviz_kodu})</label>
              <input
                type="text"
                inputMode="decimal"
                value={displayAmount}
                onChange={handleAmountChange}
                onBlur={handleAmountBlur}
                onFocus={handleAmountFocus}
                className="w-full px-4 py-3 bg-blue-50 dark:bg-blue-900/10 border-2 border-blue-200 dark:border-blue-800 text-xl font-bold text-blue-700 dark:text-blue-300 outline-none rounded focus:border-blue-500"
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['currency']}</label>
              <select
                value={formData.doviz_kodu}
                onChange={(e) => setFormData({ ...formData, doviz_kodu: e.target.value })}
                className="w-full px-3 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="IQD">IQD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['documentNo']}</label>
              <input
                type="text"
                value={formData.islem_no || ''}
                onChange={(e) => setFormData({ ...formData, islem_no: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                placeholder={t['placeholderDocumentNo']}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['specialCode']}</label>
              <input
                type="text"
                value={formData.ozel_kod || ''}
                onChange={(e) => setFormData({ ...formData, ozel_kod: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                placeholder={t['placeholderSpecialCode']}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t['description']}</label>
            <textarea
              value={formData.islem_aciklamasi || ''}
              onChange={(e) => setFormData({ ...formData, islem_aciklamasi: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
              rows={2}
              placeholder={t['placeholderDescription']}
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 pt-4 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {t['giveUp']}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-[2] px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {loading ? t['saving'] : t['saveOperation']}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RefreshCw({ className }: { className: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
  );
}
