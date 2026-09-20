/**
 * ExRetailOS - Kasa İşlem Detay Modal
 *
 * Sol tarafta işlem detayı, sağ tarafta işlemler menüsü
 */

import { useState, type ReactNode } from 'react';
import {
  X,
  Eye,
  FileText,
  Banknote,
  User,
  Building,
  AlertTriangle,
  RefreshCw,
  Edit,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '../../../utils/formatNumber';
import { formatKasaCariLabel, type KasaIslemi } from '../../../services/api/kasa';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';

interface KasaIslemDetayModalProps {
  islem: KasaIslemi;
  onClose: () => void;
  onIslemClick?: (islem: string) => void;
  onEdit?: () => void;
  onRefresh?: () => void;
}

export function KasaIslemDetayModal({
  islem,
  onClose,
  onIslemClick,
  onEdit,
  onRefresh,
}: KasaIslemDetayModalProps) {
  const { tm } = useLanguage();
  const [selectedIslem, setSelectedIslem] = useState<string | null>(null);

  const handleIslemClick = (islemType: string) => {
    setSelectedIslem(islemType);

    switch (islemType) {
      case 'incele':
        toast.info(tm('view') || 'İncele', {
          description: islem.islem_no || islem.id || '',
        });
        break;
      case 'kayit_bilgisi':
        toast.message(tm('recordInfo') || 'Kayıt Bilgisi', {
          description: [
            `ID: ${islem.id || '-'}`,
            `Fiş: ${islem.islem_no || '-'}`,
            `Cari: ${formatKasaCariLabel(islem) || '-'}`,
            `Tarih: ${islem.islem_tarihi ? new Date(islem.islem_tarihi).toLocaleString('tr-TR') : '-'}`,
          ].join('\n'),
        });
        break;
      case 'guncelle':
        if (onEdit) onEdit();
        else toast.info(tm('edit') || 'Düzenle');
        break;
      case 'ondegerlere_don':
        setSelectedIslem(null);
        toast.success('Öndeğerlere dönüldü');
        break;
      case 'kayit_sayisi':
        onRefresh?.();
        toast.info(tm('refreshData') || 'Yenilendi');
        break;
      case 'hesap_ozeti':
      case 'hesap_ozeti_grafigi':
      case 'doviz_toplamlari':
      case 'ekstre':
        if (!islem.cari_hesap_id && !formatKasaCariLabel(islem)) {
          toast.warning('Bu işlemde cari hesap tanımlı değil');
        } else {
          toast.info(tm('cariHesapOzeti') || 'Cari Hesap Özeti', {
            description: formatKasaCariLabel(islem) || islem.cari_hesap_id,
          });
        }
        break;
      default:
        break;
    }

    onIslemClick?.(islemType);
  };

  const getIslemTipiLabel = (tip: string) => {
    const labels: Record<string, string> = {
      CH_TAHSILAT: tm('chCollection'),
      CH_ODEME: tm('chPayment'),
      KASA_GIRIS: tm('cashIn'),
      KASA_CIKIS: tm('cashOut'),
      GIDER_PUSULASI: tm('expenseVoucher'),
      SATIS_FATURASI: tm('cashSalesInvoice'),
      ALIS_FATURASI: tm('cashPurchaseInvoice'),
      HIZMET_FATURASI: tm('cashServiceInvoice'),
      ACILIS: tm('openingDebit'),
      KAPANIS: tm('openingCredit'),
      ACILIS_BORC: tm('openingDebit'),
      ACILIS_ALACAK: tm('openingCredit'),
    };
    return labels[tip] || tip;
  };

  const cariLabel = formatKasaCariLabel(islem);
  const isCh = islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'CH_ODEME';

  const menuBtn = (id: string, label: string, icon?: ReactNode) => (
    <button
      type="button"
      onClick={() => handleIslemClick(id)}
      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 rounded flex items-center gap-2 ${
        selectedIslem === id ? 'bg-purple-100 text-purple-700' : ''
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={`İşlem Detayı - ${islem.islem_no || ''}`}>
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Eye className="w-5 h-5" />
          İşlem Detayı - {islem.islem_no || 'Yeni'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-white hover:bg-white/10 p-1 rounded transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <PercentBodyModalScrollBody className="flex-1 p-4 space-y-4 border-r">
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

          {isCh && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Cari Hesap Bilgileri
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">Cari Hesap Kodu:</span>
                  <span className="ml-2 font-medium font-mono">{islem.cari_hesap_kodu || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-600">Unvan:</span>
                  <span className="ml-2 font-medium">{islem.cari_hesap_unvani || cariLabel || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">Ticari İşlem Grubu:</span>
                  <span className="ml-2 font-medium">{islem.ticari_islem_grubu || '-'}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-green-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              Para Birimi ve Tutar
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Döviz:</span>
                <span className="ml-2 font-medium">{islem.doviz_kodu || 'YEREL'}</span>
              </div>
              <div>
                <span className="text-gray-600">Tutar:</span>
                <span
                  className={`ml-2 font-bold text-lg ${
                    islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'KASA_GIRIS'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {formatCurrency(islem.tutar || 0)}{' '}
                  {islem.islem_tipi === 'CH_TAHSILAT' || islem.islem_tipi === 'KASA_GIRIS' ? '(B)' : '(A)'}
                </span>
              </div>
            </div>
          </div>

          {(islem.teminat_riskini_etkileyecek || islem.riski_etkileyecek) && (
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                Risk Yönetimi
              </h4>
            </div>
          )}

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

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Açıklamalar</h4>
            <div className="space-y-2 text-sm">
              {islem.islem_aciklamasi ? (
                <div>
                  <span className="text-gray-600">İşlem Açıklaması:</span>
                  <p className="mt-1 text-gray-900">{islem.islem_aciklamasi}</p>
                </div>
              ) : (
                <p className="text-gray-400">—</p>
              )}
            </div>
          </div>
        </PercentBodyModalScrollBody>

        <div className="w-56 shrink-0 bg-gray-50 flex flex-col min-h-0">
          <div className="p-3 border-b bg-purple-600 text-white shrink-0">
            <h4 className="font-semibold text-sm">İşlemler</h4>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {menuBtn('incele', 'İncele', <Eye className="w-4 h-4" />)}
            {menuBtn('kayit_bilgisi', 'Kayıt Bilgisi', <FileText className="w-4 h-4" />)}
            <div className="border-t my-1" />
            {menuBtn('hesap_ozeti', 'Hesap Özeti')}
            {menuBtn('hesap_ozeti_grafigi', 'Hesap Özeti Grafiği')}
            {menuBtn('doviz_toplamlari', 'Döviz Toplamları')}
            {menuBtn('ekstre', 'Ekstre')}
            <div className="border-t my-1" />
            {menuBtn('kayit_sayisi', 'Kayıt Sayısı', <RefreshCw className="w-4 h-4" />)}
            {menuBtn('guncelle', 'Güncelle', <Edit className="w-4 h-4" />)}
            {menuBtn('ondegerlere_don', 'Öndeğerlere Dön')}
          </div>
        </div>
      </div>
    </PercentBodyModal>
  );
}
