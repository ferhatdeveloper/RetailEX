/**
 * ExRetailOS - Kasa İşlem Detay Modal
 * 
 * Sağ tık menüsünden açılan detay modal'ı
 * Sol tarafta işlem detayı, sağ tarafta işlemler menüsü
 * 
 * @created 2025-01-02
 */

import { useState } from 'react';
import { X, Eye, FileText, TrendingUp, TrendingDown, DollarSign, Calendar, User, Building, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatNumber';
import { type KasaIslemi } from '../../../services/api/kasa';

// ===== TYPES =====

interface KasaIslemDetayModalProps {
  islem: KasaIslemi;
  onClose: () => void;
  onIslemClick?: (islem: string) => void;
}

// ===== COMPONENT =====

export function KasaIslemDetayModal({
  islem,
  onClose,
  onIslemClick,
}: KasaIslemDetayModalProps) {
  const [selectedIslem, setSelectedIslem] = useState<string | null>(null);

  const handleIslemClick = (islemType: string) => {
    setSelectedIslem(islemType);
    if (onIslemClick) {
      onIslemClick(islemType);
    }
  };

  const getIslemTipiLabel = (tip: string) => {
    const labels: Record<string, string> = {
      'CH_TAHSILAT': 'CH Tahsilat',
      'CH_ODEME': 'CH Ödeme',
      'KASA_GIRIS': 'Kasa Giriş',
      'KASA_CIKIS': 'Kasa Çıkış',
      'ACILIS': 'Açılış',
      'KAPANIS': 'Kapanış',
    };
    return labels[tip] || tip;
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-6xl max-h-[95vh] flex shadow-2xl">
        {/* Sol Taraf - İşlem Detayı */}
        <div className="flex-1 flex flex-col border-r">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Eye className="w-5 h-5" />
              İşlem Detayı - {islem.islem_no || 'Yeni'}
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/10 p-1 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* İşlem Bilgileri */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                İşlem Bilgileri
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">İşlem No:</span>
                  <span className="ml-2 font-medium">{islem.islem_no || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">İşlem Türü:</span>
                  <span className="ml-2 font-medium">{getIslemTipiLabel(islem.islem_tipi)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Tarih:</span>
                  <span className="ml-2 font-medium">
                    {islem.islem_tarihi ? new Date(islem.islem_tarihi).toLocaleDateString('tr-TR') : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Saat:</span>
                  <span className="ml-2 font-medium">{islem.islem_saati || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Makbuz No:</span>
                  <span className="ml-2 font-medium">{islem.makbuz_no || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Durum:</span>
                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                    {islem.durumu || 'Gerçek'}
                  </span>
                </div>
              </div>
            </div>

            {/* Cari Hesap Bilgileri (CH işlemleri için) */}
            {(islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'CH_ODEME') && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Cari Hesap Bilgileri
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Cari Hesap Kodu:</span>
                    <span className="ml-2 font-medium">{islem.cari_hesap_kodu || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Unvan:</span>
                    <span className="ml-2 font-medium">{islem.cari_hesap_unvani || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Ticari İşlem Grubu:</span>
                    <span className="ml-2 font-medium">{islem.ticari_islem_grubu || '-'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Para Birimi ve Tutar */}
            <div className="bg-green-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Para Birimi ve Tutar
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Kullanılacak Para Birimi:</span>
                  <span className="ml-2 font-medium">
                    {islem.kullanilacak_para_birimi === 'YEREL' ? 'Yerel Para Birimi' :
                      islem.kullanilacak_para_birimi === 'ISLEM_DOVIZI' ? 'İşlem Dövizi' :
                        islem.kullanilacak_para_birimi || 'Yerel Para Birimi'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Döviz:</span>
                  <span className="ml-2 font-medium">{islem.doviz_kodu || 'USD'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Tutar:</span>
                  <span className={`ml-2 font-bold text-lg ${islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'KASA_GIRIS'
                      ? 'text-green-600'
                      : 'text-red-600'
                    }`}>
                    {formatCurrency(islem.tutar || 0)} {islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'KASA_GIRIS' ? '(B)' : '(A)'}
                  </span>
                </div>
                {islem.dovizli_tutar && (
                  <div>
                    <span className="text-gray-600">Dövizli Tutar:</span>
                    <span className="ml-2 font-medium">
                      {islem.doviz_kodu} {formatCurrency(islem.dovizli_tutar)}
                    </span>
                  </div>
                )}
                {islem.nakit_indirimli && (
                  <div>
                    <span className="text-gray-600">Nakit (İndirimli):</span>
                    <span className="ml-2 font-medium">{formatCurrency(islem.nakit_indirimli)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Risk Yönetimi */}
            {(islem.teminat_riskini_etkileyecek || islem.riski_etkileyecek) && (
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  Risk Yönetimi
                </h4>
                <div className="space-y-2 text-sm">
                  {islem.teminat_riskini_etkileyecek && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                        Teminat Riskini Etkileyecek
                      </span>
                    </div>
                  )}
                  {islem.riski_etkileyecek && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                        Riski Etkileyecek
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* İşyeri ve Yetki */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Building className="w-4 h-4" />
                İşyeri ve Yetki
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">İşyeri:</span>
                  <span className="ml-2 font-medium">{islem.isyeri_adi || islem.isyeri_kodu || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Satış Elemanı:</span>
                  <span className="ml-2 font-medium">{islem.satis_elemani_kodu || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Özel Kod:</span>
                  <span className="ml-2 font-medium">{islem.ozel_kod || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Yetki Kodu:</span>
                  <span className="ml-2 font-medium">{islem.yetki_kodu || '-'}</span>
                </div>
              </div>
            </div>

            {/* Açıklamalar */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">Açıklamalar</h4>
              <div className="space-y-2 text-sm">
                {islem.islem_aciklamasi && (
                  <div>
                    <span className="text-gray-600">İşlem Açıklaması:</span>
                    <p className="mt-1 text-gray-900">{islem.islem_aciklamasi}</p>
                  </div>
                )}
                {islem.kasa_aciklamasi && (
                  <div>
                    <span className="text-gray-600">Kasa Açıklaması:</span>
                    <p className="mt-1 text-gray-900">{islem.kasa_aciklamasi}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Muhasebe Bilgisi */}
            {islem.muhasebe_fis_no && (
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h4 className="font-semibold text-gray-900 mb-3">Muhasebe Entegrasyonu</h4>
                <div className="text-sm">
                  <span className="text-gray-600">Muhasebe Fiş No:</span>
                  <span className="ml-2 font-medium">{islem.muhasebe_fis_no}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sağ Taraf - İşlemler Menüsü */}
        <div className="w-64 bg-gray-50 border-l flex flex-col">
          <div className="p-4 border-b bg-purple-600 text-white">
            <h4 className="font-semibold">İşlemler</h4>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <button
              onClick={() => handleIslemClick('incele')}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded flex items-center gap-2 ${selectedIslem === 'incele' ? 'bg-purple-100 text-purple-700' : ''
                }`}
            >
              <Eye className="w-4 h-4" />
              İncele
            </button>
            <button
              onClick={() => handleIslemClick('kayit_bilgisi')}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded flex items-center gap-2 ${selectedIslem === 'kayit_bilgisi' ? 'bg-purple-100 text-purple-700' : ''
                }`}
            >
              <FileText className="w-4 h-4" />
              Kayıt Bilgisi
            </button>
            <div className="border-t my-1" />
            <button
              onClick={() => handleIslemClick('hesap_ozeti')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Hesap Özeti
            </button>
            <button
              onClick={() => handleIslemClick('hesap_ozeti_grafigi')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Hesap Özeti Grafiği
            </button>
            <button
              onClick={() => handleIslemClick('doviz_toplamlari')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Döviz Toplamları
            </button>
            <button
              onClick={() => handleIslemClick('ekstre')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Ekstre
            </button>
            <div className="border-t my-1" />
            <button
              onClick={() => handleIslemClick('kayit_sayisi')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Kayıt Sayısı
            </button>
            <button
              onClick={() => handleIslemClick('guncelle')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Güncelle
            </button>
            <button
              onClick={() => handleIslemClick('ondegerlere_don')}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded"
            >
              Öndeğerlere Dön
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}




