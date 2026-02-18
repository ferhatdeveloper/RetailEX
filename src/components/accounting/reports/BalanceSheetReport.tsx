/**
 * ExRetailOS - Bilanço (Balance Sheet)
 * 
 * Varlık ve Kaynaklar tablosu - Logo muhasebe formatında
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import { Scale, Download, Printer, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { FinancialReportsService, type BalanceSheetData, formatMoney, formatPercent } from '../../../services/financialReportsService';
import { toast } from 'sonner';

export function BalanceSheetReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [bitisTarihi, setBitisTarihi] = useState('');
  
  /**
   * Raporu yükle
   */
  const loadReport = async () => {
    if (!selectedFirma || !selectedDonem) {
      toast.error('❌ Firma ve dönem seçilmeli!');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await FinancialReportsService.generateBalanceSheet({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        bitis_tarihi: bitisTarihi || undefined
      });
      
      setData(result);
      
      if (result.dengeli) {
        toast.success('✅ Bilanço hazırlandı!', {
          description: `Aktif = Pasif: ${formatMoney(result.toplam_aktif)} IQD`
        });
      } else {
        toast.warning('⚠️ Bilanço dengesiz!', {
          description: `Fark: ${formatMoney(Math.abs(result.fark))} IQD`
        });
      }
      
    } catch (error: any) {
      console.error('[BalanceSheet] Load error:', error);
      toast.error('❌ Rapor yüklenemedi!', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * İlk yükleme
   */
  useEffect(() => {
    if (selectedFirma && selectedDonem) {
      if (selectedDonem.bitis_tarihi) {
        setBitisTarihi(selectedDonem.bitis_tarihi);
      }
      
      loadReport();
    }
  }, [selectedFirma, selectedDonem]);
  
  /**
   * Print
   */
  const handlePrint = () => {
    window.print();
  };
  
  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl">Bilanço</h2>
            <p className="text-sm text-gray-500">
              {selectedFirma?.firma_adi} - {selectedDonem?.donem_adi}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
          
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Yazdır
          </button>
          
          <button
            onClick={() => toast.info('ğŸ“Š Excel export yakında...')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Bilanço Tarihi</label>
            <input
              type="date"
              value={bitisTarihi}
              onChange={(e) => setBitisTarihi(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={loadReport}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Raporu Hazırla
            </button>
          </div>
        </div>
      </div>
      
      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-700 mb-1">Toplam Aktif</div>
            <div className="text-2xl text-blue-900">{formatMoney(data.toplam_aktif)} IQD</div>
          </div>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-sm text-red-700 mb-1">Toplam Pasif</div>
            <div className="text-2xl text-red-900">{formatMoney(data.toplam_pasif)} IQD</div>
          </div>
          
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-sm text-purple-700 mb-1">Özkaynaklar</div>
            <div className="text-2xl text-purple-900">{formatMoney(data.ozkaynaklar.toplam)} IQD</div>
            <div className="text-xs text-purple-600 mt-1">
              {data.toplam_pasif > 0 ? formatPercent((data.ozkaynaklar.toplam / data.toplam_pasif) * 100) : '0%'}
            </div>
          </div>
          
          <div className={`rounded-lg border p-4 ${
            data.dengeli ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              {data.dengeli ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              <div className={`text-sm ${data.dengeli ? 'text-green-700' : 'text-red-700'}`}>
                Durum
              </div>
            </div>
            <div className={`text-lg ${data.dengeli ? 'text-green-900' : 'text-red-900'}`}>
              {data.dengeli ? 'Dengeli ✓' : `Fark: ${formatMoney(Math.abs(data.fark))} IQD`}
            </div>
          </div>
        </div>
      )}
      
      {/* Balance Sheet Table - Two Column Layout */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Bilanço hesaplanıyor...</span>
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-gray-500">
            <Scale className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Bilanço henüz hazırlanmadı</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* AKTİF (Sol Taraf) */}
            <div className="border-r border-gray-200">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3">
                <h3 className="font-semibold">AKTİF (Varlıklar)</h3>
              </div>
              
              <div className="divide-y divide-gray-200">
                {/* Dönen Varlıklar */}
                <div className="p-4 bg-blue-50">
                  <div className="flex justify-between font-semibold text-blue-900">
                    <span>DÖNEN VARLIKLAR</span>
                    <span>{formatMoney(data.donen_varliklar.toplam)} IQD</span>
                  </div>
                </div>
                
                {data.donen_varliklar.kasa > 0 && (
                  <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                    <span className="text-sm">
                      <span className="text-gray-500 font-mono text-xs mr-2">100</span>
                      Kasa
                    </span>
                    <span className="text-sm">{formatMoney(data.donen_varliklar.kasa)}</span>
                  </div>
                )}
                
                {data.donen_varliklar.bankalar > 0 && (
                  <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                    <span className="text-sm">
                      <span className="text-gray-500 font-mono text-xs mr-2">102</span>
                      Bankalar
                    </span>
                    <span className="text-sm">{formatMoney(data.donen_varliklar.bankalar)}</span>
                  </div>
                )}
                
                {data.donen_varliklar.alicilar > 0 && (
                  <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                    <span className="text-sm">
                      <span className="text-gray-500 font-mono text-xs mr-2">120</span>
                      Alıcılar
                    </span>
                    <span className="text-sm">{formatMoney(data.donen_varliklar.alicilar)}</span>
                  </div>
                )}
                
                {data.donen_varliklar.stoklar > 0 && (
                  <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                    <span className="text-sm">
                      <span className="text-gray-500 font-mono text-xs mr-2">153</span>
                      Ticari Mallar
                    </span>
                    <span className="text-sm">{formatMoney(data.donen_varliklar.stoklar)}</span>
                  </div>
                )}
                
                {/* Duran Varlıklar */}
                {data.duran_varliklar.toplam > 0 && (
                  <>
                    <div className="p-4 bg-blue-50">
                      <div className="flex justify-between font-semibold text-blue-900">
                        <span>DURAN VARLIKLAR</span>
                        <span>{formatMoney(data.duran_varliklar.toplam)} IQD</span>
                      </div>
                    </div>
                    
                    {data.duran_varliklar.demirbaslar > 0 && (
                      <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-500 font-mono text-xs mr-2">253</span>
                          Demirbaşlar
                        </span>
                        <span className="text-sm">{formatMoney(data.duran_varliklar.demirbaslar)}</span>
                      </div>
                    )}
                    
                    {data.duran_varliklar.tasitlar > 0 && (
                      <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-500 font-mono text-xs mr-2">255</span>
                          Taşıtlar
                        </span>
                        <span className="text-sm">{formatMoney(data.duran_varliklar.tasitlar)}</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Toplam Aktif */}
                <div className="p-4 bg-gradient-to-r from-blue-700 to-blue-800 text-white">
                  <div className="flex justify-between font-bold">
                    <span>TOPLAM AKTİF</span>
                    <span>{formatMoney(data.toplam_aktif)} IQD</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* PASİF (Sağ Taraf) */}
            <div>
              <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-3">
                <h3 className="font-semibold">PASİF (Kaynaklar)</h3>
              </div>
              
              <div className="divide-y divide-gray-200">
                {/* Kısa Vadeli Borçlar */}
                {data.kisa_vadeli_borclar.toplam > 0 && (
                  <>
                    <div className="p-4 bg-red-50">
                      <div className="flex justify-between font-semibold text-red-900">
                        <span>KISA VADELİ BORÇLAR</span>
                        <span>{formatMoney(data.kisa_vadeli_borclar.toplam)} IQD</span>
                      </div>
                    </div>
                    
                    {data.kisa_vadeli_borclar.banka_kredileri > 0 && (
                      <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-500 font-mono text-xs mr-2">300</span>
                          Banka Kredileri
                        </span>
                        <span className="text-sm">{formatMoney(data.kisa_vadeli_borclar.banka_kredileri)}</span>
                      </div>
                    )}
                    
                    {data.kisa_vadeli_borclar.saticilar > 0 && (
                      <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-500 font-mono text-xs mr-2">320</span>
                          Satıcılar
                        </span>
                        <span className="text-sm">{formatMoney(data.kisa_vadeli_borclar.saticilar)}</span>
                      </div>
                    )}
                    
                    {data.kisa_vadeli_borclar.odenecek_vergiler > 0 && (
                      <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-500 font-mono text-xs mr-2">360</span>
                          Ödenecek Vergiler
                        </span>
                        <span className="text-sm">{formatMoney(data.kisa_vadeli_borclar.odenecek_vergiler)}</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Uzun Vadeli Borçlar */}
                {data.uzun_vadeli_borclar.toplam > 0 && (
                  <>
                    <div className="p-4 bg-red-50">
                      <div className="flex justify-between font-semibold text-red-900">
                        <span>UZUN VADELİ BORÇLAR</span>
                        <span>{formatMoney(data.uzun_vadeli_borclar.toplam)} IQD</span>
                      </div>
                    </div>
                    
                    {data.uzun_vadeli_borclar.banka_kredileri > 0 && (
                      <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                        <span className="text-sm">
                          <span className="text-gray-500 font-mono text-xs mr-2">400</span>
                          Banka Kredileri
                        </span>
                        <span className="text-sm">{formatMoney(data.uzun_vadeli_borclar.banka_kredileri)}</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Özkaynaklar */}
                <div className="p-4 bg-purple-50">
                  <div className="flex justify-between font-semibold text-purple-900">
                    <span>ÖZKAYNAKLAR</span>
                    <span>{formatMoney(data.ozkaynaklar.toplam)} IQD</span>
                  </div>
                </div>
                
                <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                  <span className="text-sm">
                    <span className="text-gray-500 font-mono text-xs mr-2">500</span>
                    Sermaye
                  </span>
                  <span className="text-sm">{formatMoney(data.ozkaynaklar.sermaye)}</span>
                </div>
                
                {data.ozkaynaklar.gecmis_yil_karlari !== 0 && (
                  <div className="px-4 py-2 pl-8 flex justify-between hover:bg-gray-50">
                    <span className="text-sm">
                      <span className="text-gray-500 font-mono text-xs mr-2">570</span>
                      Geçmiş Yıl Karları
                    </span>
                    <span className="text-sm">{formatMoney(data.ozkaynaklar.gecmis_yil_karlari)}</span>
                  </div>
                )}
                
                {data.ozkaynaklar.donem_net_kari !== 0 && (
                  <div className={`px-4 py-2 pl-8 flex justify-between ${
                    data.ozkaynaklar.donem_net_kari >= 0 ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <span className="text-sm">
                      <span className="text-gray-500 font-mono text-xs mr-2">
                        {data.ozkaynaklar.donem_net_kari >= 0 ? '590' : '591'}
                      </span>
                      Dönem Net {data.ozkaynaklar.donem_net_kari >= 0 ? 'Karı' : 'Zararı'}
                    </span>
                    <span className={`text-sm ${
                      data.ozkaynaklar.donem_net_kari >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {formatMoney(Math.abs(data.ozkaynaklar.donem_net_kari))}
                    </span>
                  </div>
                )}
                
                {/* Toplam Pasif */}
                <div className="p-4 bg-gradient-to-r from-red-700 to-red-800 text-white">
                  <div className="flex justify-between font-bold">
                    <span>TOPLAM PASİF</span>
                    <span>{formatMoney(data.toplam_pasif)} IQD</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Balance Check */}
      {data && (
        <div className={`rounded-lg border p-4 ${
          data.dengeli ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {data.dengeli ? (
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-600" />
            )}
            <div>
              <div className={`font-semibold ${data.dengeli ? 'text-green-900' : 'text-red-900'}`}>
                {data.dengeli ? '✓ Bilanço Dengeli' : '✗ Bilanço Dengesiz!'}
              </div>
              <div className={`text-sm ${data.dengeli ? 'text-green-700' : 'text-red-700'}`}>
                {data.dengeli 
                  ? `Aktif = Pasif = ${formatMoney(data.toplam_aktif)} IQD`
                  : `Fark: ${formatMoney(Math.abs(data.fark))} IQD - Muhasebe kayıtlarını kontrol edin!`
                }
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Scale className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="mb-2">
              <strong>Bilanço Nedir?</strong> İşletmenin belirli tarihteki varlıklarını (AKTİF) ve kaynaklarını (PASİF) gösteren tablodur.
            </p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>AKTİF:</strong> İşletmenin sahip olduğu varlıklar (kasa, bankalar, stoklar, demirbaşlar)</li>
              <li>• <strong>PASİF:</strong> Bu varlıkların kaynağı (borçlar, sermaye, karlar)</li>
              <li>• <strong>Temel Denklik:</strong> AKTİF = PASİF (Her zaman eşit olmalı!)</li>
              <li>• <strong>Dönen Varlıklar:</strong> 1 yıl içinde nakde dönüşebilen varlıklar</li>
              <li>• <strong>Duran Varlıklar:</strong> Uzun süreli kullanılan varlıklar (bina, araç vs.)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

