/**
 * ExRetailOS - Firma & Dönem Quick Setup Component
 * Hızlı firma oluşturma ve dönem açma
 */

import { useState } from 'react';
import { Building2, Calendar, Check, X, AlertCircle, Plus, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { toast } from 'sonner';

interface FirmaDonemQuickSetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function FirmaDonemQuickSetup({ onComplete, onCancel }: FirmaDonemQuickSetupProps) {
  const [step, setStep] = useState<'firma' | 'donem'>('firma');
  const [loading, setLoading] = useState(false);

  // Firma form
  const [firmaKodu, setFirmaKodu] = useState('FRM001');
  const [firmaAdi, setFirmaAdi] = useState('');
  const [vergiNo, setVergiNo] = useState('');
  const [createdFirmaId, setCreatedFirmaId] = useState<string | null>(null);

  // Dönem form
  const [donemAdi, setDonemAdi] = useState('2025 Dönemi');
  const [baslangicTarihi, setBaslangicTarihi] = useState('2025-01-01');
  const [bitisTarihi, setBitisTarihi] = useState('2025-12-31');

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0`;

  /**
   * Firma oluştur
   */
  const handleCreateFirma = async () => {
    if (!firmaAdi.trim()) {
      toast.error('Firma adı gerekli!');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/organization/firmalar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firma_kodu: firmaKodu,
          firma_adi: firmaAdi,
          vergi_no: vergiNo,
          ana_para_birimi: 'IQD',
          raporlama_para_birimi: 'IQD',
          dil_kodu: 'tr',
          varsayilan: true, // First firma is default
          aktif: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Firma oluşturulamadı');
      }

      const { firma } = await response.json();
      setCreatedFirmaId(firma.id);

      toast.success('✅ Firma oluşturuldu!', {
        description: `${firmaAdi} başarıyla kaydedildi`,
      });

      // Dönem adımına geç
      setStep('donem');

    } catch (error: any) {
      console.error('Error creating firma:', error);
      toast.error('❌ Firma oluşturulamadı!', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Dönem oluştur
   */
  const handleCreateDonem = async () => {
    if (!createdFirmaId) {
      toast.error('Önce firma oluşturulmalı!');
      return;
    }

    if (!donemAdi.trim()) {
      toast.error('Dönem adı gerekli!');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/donemler`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firma_id: createdFirmaId,
          donem_adi: donemAdi,
          baslangic_tarihi: baslangicTarihi,
          bitis_tarihi: bitisTarihi,
          durum: 'acik',
          kapali_aylar: [],
          created_at: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Dönem oluşturulamadı');
      }

      const { donem } = await response.json();

      toast.success('✅ Dönem oluşturuldu!', {
        description: `${donemAdi} açık ve kullanıma hazır`,
        duration: 3000,
      });

      // localStorage'a kaydet
      localStorage.setItem('exretail_selected_firma_id', createdFirmaId);
      localStorage.setItem('exretail_selected_donem_id', donem.id);

      // Tamamlandı
      setTimeout(() => {
        onComplete();
      }, 1000);

    } catch (error: any) {
      console.error('Error creating donem:', error);
      toast.error('❌ Dönem oluşturulamadı!', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a]/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e293b] border border-white/10 rounded-[32px] shadow-[0_32px_128px_-12px_rgba(0,0,0,0.8)] w-full max-w-lg overflow-hidden relative">
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 blur-[60px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {step === 'firma' ? 'Yeni Firma Kaydı' : 'Yeni Dönem Aktivasyonu'}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`h-1.5 w-1.5 rounded-full ${step === 'firma' ? 'bg-blue-500' : 'bg-slate-500'}`} />
                <span className={`h-1.5 w-1.5 rounded-full ${step === 'donem' ? 'bg-blue-500' : 'bg-slate-500'}`} />
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest ml-2">
                  {step === 'firma' ? 'Adım 1/2: Organizasyon' : 'Adım 2/2: Mali Dönem'}
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {step === 'firma' && (
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-5 bg-blue-600/5 border border-blue-500/10 rounded-2xl">
                <Building2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  Organizasyonel yapınızın ana birimini tanımlayın. Diğer tüm şube ve depolar bu firma altına bağlanacaktır.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                    Firma Kodu <span className="text-blue-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firmaKodu}
                    onChange={(e) => setFirmaKodu(e.target.value)}
                    className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-xs placeholder:text-slate-600 shadow-inner"
                    placeholder="FRM001"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                    Firma Tam Ünvanı <span className="text-blue-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={firmaAdi}
                    onChange={(e) => setFirmaAdi(e.target.value)}
                    className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-bold text-sm placeholder:text-slate-600 shadow-inner"
                    placeholder="ExRetailOS Mağazacılık A.Ş."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                    Vergi Numarası
                  </label>
                  <input
                    type="text"
                    value={vergiNo}
                    onChange={(e) => setVergiNo(e.target.value)}
                    className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-xs placeholder:text-slate-600 shadow-inner"
                    placeholder="1234567890"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-3.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all text-xs font-bold uppercase tracking-widest"
                >
                  İptal
                </button>
                <button
                  onClick={handleCreateFirma}
                  disabled={loading || !firmaAdi.trim()}
                  className="flex-[2] px-4 py-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      YÜKLENİYOR...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      FİRMA KAYDET VE DEVAM ET
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'donem' && (
            <div className="space-y-6">
              <div className="flex items-start gap-4 p-5 bg-blue-600/5 border border-blue-500/10 rounded-2xl">
                <Check className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  <strong className="text-white">{firmaAdi}</strong> başarıyla oluşturuldu. Şimdi mali yıl veya çalışma periyodunu belirleyin.
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                    Dönem Tanımı <span className="text-blue-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={donemAdi}
                    onChange={(e) => setDonemAdi(e.target.value)}
                    className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-bold text-sm placeholder:text-slate-600 shadow-inner"
                    placeholder="2025 Dönemi"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                      Başlangıç Tarihi
                    </label>
                    <input
                      type="date"
                      value={baslangicTarihi}
                      onChange={(e) => setBaslangicTarihi(e.target.value)}
                      className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-xs placeholder:text-slate-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                      Bitiş Tarihi
                    </label>
                    <input
                      type="date"
                      value={bitisTarihi}
                      onChange={(e) => setBitisTarihi(e.target.value)}
                      className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-5 py-3.5 text-white focus:outline-none focus:border-blue-500 transition-all font-mono text-xs placeholder:text-slate-600"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5 bg-slate-900/40 border border-white/5 rounded-2xl">
                <Calendar className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                  Dönem <span className="text-blue-400 font-bold">AKTİF</span> olarak açılacak ve tüm muhasebe girişlerine hazır olacaktır.
                </p>
              </div>

              <div className="pt-6 border-t border-white/5 flex gap-3">
                <button
                  onClick={() => setStep('firma')}
                  className="flex-1 px-4 py-3.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all text-xs font-bold uppercase tracking-widest"
                >
                  Geri
                </button>
                <button
                  onClick={handleCreateDonem}
                  disabled={loading || !donemAdi.trim()}
                  className="flex-[2] px-4 py-3.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      AKTİF EDİLİYOR...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      DÖNEMİ AÇ VE BAŞLAT
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
