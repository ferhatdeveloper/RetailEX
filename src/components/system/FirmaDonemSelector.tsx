/**
 * ExRetailOS - Firma & Dönem Selector
 * 
 * Login öncesi firma ve dönem seçimi için flat tek ekran tasarım
 */

import { useState, useEffect } from 'react';
import { Building2, Calendar, Check, AlertCircle } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

interface Firma {
  id: string;
  firma_kodu: string;
  firma_adi: string;
  ana_para_birimi?: string;
  aktif?: boolean;
  default?: boolean;
}

interface Donem {
  id: string;
  firma_id: string;
  donem_adi: string;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  durum: 'acik' | 'kapali';
}

interface FirmaDonemSelectorProps {
  onComplete: () => void;
}

export function FirmaDonemSelector({ onComplete }: FirmaDonemSelectorProps) {
  const [firmalar, setFirmalar] = useState<Firma[]>([]);
  const [donemler, setDonemler] = useState<Donem[]>([]);
  const [selectedFirma, setSelectedFirma] = useState<Firma | null>(null);
  const [selectedDonem, setSelectedDonem] = useState<Donem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDonemler, setLoadingDonemler] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-eae94dc0`;

  // Load firmalar on mount
  useEffect(() => {
    loadFirmalar();
  }, []);

  // Load dönemler when firma selected
  useEffect(() => {
    if (selectedFirma) {
      loadDonemler(selectedFirma.id);
    } else {
      setDonemler([]);
      setSelectedDonem(null);
    }
  }, [selectedFirma]);

  const loadFirmalar = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${baseUrl}/organization/firmalar`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Firmalar yüklenemedi. Lütfen SETUP_DATABASE.md dosyasındaki SQL migration\'ı çalıştırın.');
      }

      const { firmalar: data } = await response.json();
      setFirmalar(data || []);

      // Auto-select default or first firma
      if (data && data.length > 0) {
        const defaultFirma = data.find((f: Firma) => f.default && f.aktif);
        setSelectedFirma(defaultFirma || data[0]);
      } else {
        setError('Sistemde firma bulunamadı. Lütfen SQL migration\'ı çalıştırın.');
      }
    } catch (err: any) {
      console.error('Error loading firmalar:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDonemler = async (firmaId: string) => {
    try {
      setLoadingDonemler(true);
      setError(null);

      const response = await fetch(
        `${baseUrl}/organization/donemler?firma_id=${firmaId}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Dönemler yüklenemedi');
      }

      const { donemler: data } = await response.json();
      setDonemler(data || []);

      // Auto-select default or open period
      if (data && data.length > 0) {
        const defaultDonem = data.find((d: Donem) => (d as any).default && d.durum === 'acik');
        const openDonem = data.find((d: Donem) => d.durum === 'acik');
        setSelectedDonem(defaultDonem || openDonem || data[0]);
      } else {
        setSelectedDonem(null);
      }
    } catch (err: any) {
      console.error('Error loading donemler:', err);
      setError(err.message);
    } finally {
      setLoadingDonemler(false);
    }
  };

  const handleFirmaSelect = (firma: Firma) => {
    setSelectedFirma(firma);
  };

  const handleDonemSelect = (donem: Donem) => {
    setSelectedDonem(donem);
  };

  const handleConfirm = () => {
    if (selectedFirma && selectedDonem) {
      // Save to localStorage
      localStorage.setItem('exretail_selected_firma_id', selectedFirma.id);
      localStorage.setItem('exretail_selected_donem_id', selectedDonem.id);
      localStorage.setItem('exretail_firma_donem_configured', 'true');

      // Notify completion - with safety check
      if (onComplete && typeof onComplete === 'function') {
        onComplete();
      } else {
        console.error('onComplete callback is not a function:', onComplete);
        // Fallback: reload page
        window.location.reload();
      }
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full mx-4">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600">Veriler yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Database Hatası</h2>
            <p className="text-gray-600 text-center text-sm">{error}</p>
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg w-full">
              <p className="text-sm text-yellow-800 font-medium mb-2">ğŸ“‹ Çözüm:</p>
              <ol className="text-xs text-yellow-700 space-y-1 list-decimal list-inside">
                <li>Supabase Dashboard'u açın</li>
                <li>SQL Editor'e gidin</li>
                <li>SETUP_DATABASE.md'deki SQL'i çalıştırın</li>
                <li>Sayfayı yenileyin (F5)</li>
              </ol>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-white" />
            <div>
              <h2 className="text-2xl font-bold text-white">Firma & Dönem Seçimi</h2>
              <p className="text-blue-100 text-sm mt-1">Çalışmak istediğiniz firma ve dönemi seçin</p>
            </div>
          </div>
        </div>

        {/* Content - Flat Side by Side Layout */}
        <div className="p-8">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Firma Selection */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Firma</h3>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {firmalar.map((firma) => (
                  <button
                    key={firma.id}
                    onClick={() => handleFirmaSelect(firma)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selectedFirma?.id === firma.id
                      ? 'border-blue-600 bg-blue-50 shadow-md'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedFirma?.id === firma.id ? 'bg-blue-600' : 'bg-gray-200'
                          }`}>
                          <Building2 className={`w-5 h-5 ${selectedFirma?.id === firma.id ? 'text-white' : 'text-gray-600'
                            }`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900 text-sm">{firma.firma_adi}</h3>
                            {firma.default && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                Varsayılan
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {firma.firma_kodu} • {firma.ana_para_birimi || 'IQD'}
                          </p>
                        </div>
                      </div>
                      {selectedFirma?.id === firma.id && (
                        <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Donem Selection */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Dönem</h3>
              </div>

              {loadingDonemler ? (
                <div className="flex items-center justify-center h-[400px]">
                  <div className="text-center">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-gray-500">Dönemler yükleniyor...</p>
                  </div>
                </div>
              ) : !selectedFirma ? (
                <div className="flex items-center justify-center h-[400px]">
                  <div className="text-center">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Önce firma seçin</p>
                  </div>
                </div>
              ) : donemler.length === 0 ? (
                <div className="flex items-center justify-center h-[400px]">
                  <div className="text-center">
                    <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600">Bu firma için dönem bulunamadı</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                  {donemler.map((donem) => (
                    <button
                      key={donem.id}
                      onClick={() => handleDonemSelect(donem)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${selectedDonem?.id === donem.id
                        ? 'border-blue-600 bg-blue-50 shadow-md'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedDonem?.id === donem.id ? 'bg-blue-600' : 'bg-gray-200'
                            }`}>
                            <Calendar className={`w-5 h-5 ${selectedDonem?.id === donem.id ? 'text-white' : 'text-gray-600'
                              }`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900 text-sm">{donem.donem_adi}</h3>
                              <span className={`px-2 py-0.5 text-xs rounded ${donem.durum === 'acik'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                                }`}>
                                {donem.durum === 'acik' ? 'Açık' : 'Kapalı'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(donem.baslangic_tarihi).toLocaleDateString('tr-TR')} - {' '}
                              {new Date(donem.bitis_tarihi).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                        </div>
                        {selectedDonem?.id === donem.id && (
                          <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedFirma && selectedDonem ? (
              <span className="text-green-600 font-medium">
                ✓ {selectedFirma.firma_adi} • {selectedDonem.donem_adi}
              </span>
            ) : (
              <span>Firma ve dönem seçin</span>
            )}
          </div>

          <button
            onClick={handleConfirm}
            disabled={!selectedFirma || !selectedDonem}
            className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            Devam Et
          </button>
        </div>
      </div>
    </div>
  );
}
