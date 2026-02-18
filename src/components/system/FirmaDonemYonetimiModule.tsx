import { useState } from 'react';
import { Calendar, Building2, Database, RefreshCw, CheckCircle, XCircle, AlertCircle, Plus, Settings } from 'lucide-react';

interface Firma {
  firma_id: number;
  firma_kodu: string;
  firma_unvani: string;
  vergi_no: string;
  merkez_mi: boolean;
  aktif_mi: boolean;
  magaza_sayisi: number;
}

interface CalismaYili {
  yil_id: number;
  firma_id: number;
  calisma_yili: number;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  aktif_mi: boolean;
  kapali_mi: boolean;
  devredildi_mi: boolean;
}

interface Donem {
  donem_id: number;
  yil_id: number;
  donem_no: number;
  donem_adi: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  aktif_mi: boolean;
  kapali_mi: boolean;
}

export function FirmaDonemYonetimiModule() {
  const [firmalar] = useState<Firma[]>([
    { firma_id: 1, firma_kodu: 'FRM001', firma_unvani: 'ExRetailOS AŞ', vergi_no: '1234567890', merkez_mi: true, aktif_mi: true, magaza_sayisi: 4 }
  ]);

  const [calismaYillari] = useState<CalismaYili[]>([
    { yil_id: 1, firma_id: 1, calisma_yili: 2024, baslangic_tarihi: '2024-01-01', bitis_tarihi: '2024-12-31', aktif_mi: true, kapali_mi: false, devredildi_mi: false },
    { yil_id: 2, firma_id: 1, calisma_yili: 2025, baslangic_tarihi: '2025-01-01', bitis_tarihi: '2025-12-31', aktif_mi: false, kapali_mi: false, devredildi_mi: false }
  ]);

  const [donemler] = useState<Donem[]>([
    { donem_id: 1, yil_id: 1, donem_no: 1, donem_adi: 'Ocak 2024', baslangic_tarihi: '2024-01-01', bitis_tarihi: '2024-01-31', aktif_mi: false, kapali_mi: true },
    { donem_id: 2, yil_id: 1, donem_no: 2, donem_adi: 'Şubat 2024', baslangic_tarihi: '2024-02-01', bitis_tarihi: '2024-02-29', aktif_mi: false, kapali_mi: true },
    { donem_id: 12, yil_id: 1, donem_no: 12, donem_adi: 'Aralık 2024', baslangic_tarihi: '2024-12-01', bitis_tarihi: '2024-12-31', aktif_mi: true, kapali_mi: false }
  ]);

  const [selectedFirma, setSelectedFirma] = useState<number>(1);
  const [showYeniYilModal, setShowYeniYilModal] = useState(false);
  const [showDevirModal, setShowDevirModal] = useState(false);

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-blue-50 overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-medium text-gray-900">Firma & Dönem Yönetimi</h1>
              <p className="text-xs text-gray-500">Çalışma yılları ve dönem kontrolleri</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 flex items-center gap-1.5"
                    onClick={() => setShowYeniYilModal(true)}>
              <Plus className="w-3.5 h-3.5" />
              Yeni Yıl Aç
            </button>
            <button className="px-3 py-1.5 bg-orange-600 text-white text-xs rounded-lg hover:bg-orange-700 flex items-center gap-1.5"
                    onClick={() => setShowDevirModal(true)}>
              <RefreshCw className="w-3.5 h-3.5" />
              Yıl Devri
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Firma Seçimi */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            Firma Seçimi
          </h2>
          <select 
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            value={selectedFirma}
            onChange={(e) => setSelectedFirma(Number(e.target.value))}
          >
            {firmalar.map(firma => (
              <option key={firma.firma_id} value={firma.firma_id}>
                {firma.firma_kodu} - {firma.firma_unvani} {firma.merkez_mi && '(Merkez)'}
              </option>
            ))}
          </select>
        </div>

        {/* Çalışma Yılları */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" />
            Çalışma Yılları
          </h2>
          <div className="space-y-2">
            {calismaYillari.filter(y => y.firma_id === selectedFirma).map(yil => (
              <div key={yil.yil_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${yil.aktif_mi ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{yil.calisma_yili}</span>
                      {yil.aktif_mi && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Aktif</span>
                      )}
                      {yil.kapali_mi && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">Kapalı</span>
                      )}
                      {yil.devredildi_mi && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Devredildi</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{yil.baslangic_tarihi} - {yil.bitis_tarihi}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!yil.aktif_mi && !yil.kapali_mi && (
                    <button className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">
                      Aktif Yap
                    </button>
                  )}
                  {yil.aktif_mi && !yil.devredildi_mi && (
                    <button className="px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700">
                      Dönemi Kapat
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dönemler */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600" />
            Dönemler (2024)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {donemler.map(donem => (
              <div key={donem.donem_id} className={`p-3 rounded-lg border-2 ${
                donem.aktif_mi ? 'border-green-500 bg-green-50' :
                donem.kapali_mi ? 'border-gray-300 bg-gray-50' :
                'border-blue-300 bg-blue-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">{donem.donem_adi}</span>
                  {donem.aktif_mi && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {donem.kapali_mi && <XCircle className="w-4 h-4 text-gray-400" />}
                </div>
                <p className="text-xs text-gray-600">{donem.baslangic_tarihi}</p>
                <p className="text-xs text-gray-600">{donem.bitis_tarihi}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bilgilendirme */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-blue-900 mb-1">Dönem Yönetimi Hakkında</h3>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Her firma için ayrı çalışma yılları tanımlanabilir</li>
                <li>• Aktif çalışma yılı yalnızca bir tanedir</li>
                <li>• Yeni yıl açmak için mevcut yıl kapatılmalıdır</li>
                <li>• Yıl devri işlemi tüm verileri yeni yıla aktarır</li>
                <li>• Her yılın 12 dönemi (ay) otomatik oluşturulur</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Yeni Yıl Modal */}
      {showYeniYilModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Yeni Çalışma Yılı Aç</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Yıl</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" defaultValue={2026} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Başlangıç Tarihi</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" defaultValue="2026-01-01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Bitiş Tarihi</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" defaultValue="2026-12-31" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button className="flex-1 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
                Yıl Aç
              </button>
              <button className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                      onClick={() => setShowYeniYilModal(false)}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Yıl Devri Modal */}
      {showDevirModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Yeni Yıla Devir</h2>
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-xs text-orange-800">
                  <strong>Dikkat:</strong> Bu işlem geri alınamaz. Tüm veriler yeni yıla devredilecek ve mevcut yıl kapatılacaktır.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Eski Yıl</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option>2024</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Yeni Yıl</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option>2025</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Devir Tipi</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                  <option>Tam Devir</option>
                  <option>Sadece Stok Devir</option>
                  <option>Sadece Cari Devir</option>
                  <option>Sadece Kasa Devir</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button className="flex-1 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700">
                Devir Başlat
              </button>
              <button className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                      onClick={() => setShowDevirModal(false)}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

