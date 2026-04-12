/**
 * ExRetailOS - Gelir Tablosu (Income Statement)
 * 
 * Kar/Zarar tablosu - Logo muhasebe formatında
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import { TrendingUp, Download, Printer, Calendar, RefreshCw, Banknote, TrendingDown } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { FinancialReportsService, type IncomeStatementData, formatMoney, formatPercent } from '../../../services/financialReportsService';
import { toast } from 'sonner';

export function IncomeStatementReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IncomeStatementData | null>(null);
  const [baslangicTarihi, setBaslangicTarihi] = useState('');
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
      const result = await FinancialReportsService.generateIncomeStatement({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        baslangic_tarihi: baslangicTarihi || undefined,
        bitis_tarihi: bitisTarihi || undefined
      });

      setData(result);

      toast.success('✅ Gelir tablosu hazırlandı!', {
        description: `Net ${result.donem_net_kari >= 0 ? 'Kar' : 'Zarar'}: ${formatMoney(Math.abs(result.donem_net_kari))} IQD`
      });

    } catch (error: any) {
      console.error('[IncomeStatement] Load error:', error);
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
      if (selectedDonem.baslangic_tarihi) {
        setBaslangicTarihi(selectedDonem.baslangic_tarihi);
      }
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
          <TrendingUp className="w-8 h-8 text-green-600" />
          <div>
            <h2 className="text-2xl">Gelir Tablosu</h2>
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
            onClick={() => toast.info('📊 Excel export yakında...')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Başlangıç</label>
            <input
              type="date"
              value={baslangicTarihi}
              onChange={(e) => setBaslangicTarihi(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Bitiş</label>
            <input
              type="date"
              value={bitisTarihi}
              onChange={(e) => setBitisTarihi(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end col-span-2">
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
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="w-5 h-5 text-blue-600" />
              <div className="text-sm text-gray-600">Net Satışlar</div>
            </div>
            <div className="text-2xl">{formatMoney(data.net_satislar)} IQD</div>
            <div className="text-xs text-gray-500 mt-1">100%</div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <div className="text-sm text-gray-600">Brüt Kar</div>
            </div>
            <div className="text-2xl text-green-600">{formatMoney(data.brut_kar)} IQD</div>
            <div className="text-xs text-gray-500 mt-1">{formatPercent(data.brut_kar_yuzdesi)}</div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-orange-600" />
              <div className="text-sm text-gray-600">Toplam Giderler</div>
            </div>
            <div className="text-2xl text-orange-600">{formatMoney(data.toplam_giderler)} IQD</div>
            <div className="text-xs text-gray-500 mt-1">
              {data.net_satislar > 0 ? formatPercent((data.toplam_giderler / data.net_satislar) * 100) : '0%'}
            </div>
          </div>

          <div className={`rounded-lg border p-4 ${data.donem_net_kari >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
            <div className="flex items-center gap-2 mb-2">
              {data.donem_net_kari >= 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-600" />
              )}
              <div className={`text-sm ${data.donem_net_kari >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                Dönem Net {data.donem_net_kari >= 0 ? 'Karı' : 'Zararı'}
              </div>
            </div>
            <div className={`text-2xl ${data.donem_net_kari >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatMoney(Math.abs(data.donem_net_kari))} IQD
            </div>
            <div className="text-xs mt-1" style={{ color: data.donem_net_kari >= 0 ? 'rgb(21 128 61)' : 'rgb(185 28 28)' }}>
              {formatPercent(Math.abs(data.donem_net_kari_yuzdesi))}
            </div>
          </div>
        </div>
      )}

      {/* Income Statement Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Gelir tablosu hesaplanıyor...</span>
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-gray-500">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Gelir tablosu henüz hazırlanmadı</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-600 to-green-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">Hesap</th>
                  <th className="px-4 py-3 text-right text-sm">Tutar (IQD)</th>
                  <th className="px-4 py-3 text-right text-sm">% (Satışlara Göre)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.lines.map((line, index) => (
                  <tr
                    key={index}
                    className={`
                      hover:bg-gray-50 transition-colors
                      ${line.seviye === 1 && line.grup === 'SONUC' ? 'bg-yellow-50 font-semibold' : ''}
                      ${line.seviye === 1 && line.grup !== 'SONUC' ? 'bg-gray-50 font-semibold' : ''}
                      ${line.hesap_kodu.startsWith('59') ? 'bg-green-100 font-bold' : ''}
                    `}
                  >
                    <td className={`px-4 py-2 text-sm ${line.seviye === 1 ? '' : 'pl-8'
                      }`}>
                      {line.hesap_kodu && (
                        <span className="text-gray-500 mr-2 font-mono text-xs">{line.hesap_kodu}</span>
                      )}
                      {line.hesap_adi}
                    </td>
                    <td className={`px-4 py-2 text-sm text-right ${line.tutar >= 0 ? 'text-gray-900' : 'text-red-600'
                      }`}>
                      {formatMoney(Math.abs(line.tutar))}
                      {line.tutar < 0 && ' (-)'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-600">
                      {line.yuzde !== undefined ? formatPercent(line.yuzde) : '-'}
                    </td>
                  </tr>
                ))}

                {/* Final Net Kar/Zarar Row */}
                <tr className={`${data.donem_net_kari >= 0 ? 'bg-green-200' : 'bg-red-200'
                  }`}>
                  <td className="px-4 py-3 font-bold">
                    DÖNEM NET {data.donem_net_kari >= 0 ? 'KARI' : 'ZARARI'}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${data.donem_net_kari >= 0 ? 'text-green-800' : 'text-red-800'
                    }`}>
                    {formatMoney(Math.abs(data.donem_net_kari))} IQD
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${data.donem_net_kari >= 0 ? 'text-green-800' : 'text-red-800'
                    }`}>
                    {formatPercent(Math.abs(data.donem_net_kari_yuzdesi))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
          <div className="text-sm text-green-900">
            <p className="mb-2">
              <strong>Gelir Tablosu Nedir?</strong> İşletmenin belirli dönemdeki gelir ve giderlerini, kar/zarar durumunu gösteren rapordur.
            </p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>Net Satışlar:</strong> Brüt satışlar - İadeler</li>
              <li>• <strong>Satılan Mal Maliyeti:</strong> Malların alış bedeli</li>
              <li>• <strong>Brüt Kar:</strong> Net Satışlar - Maliyet (Kârlılık göstergesi)</li>
              <li>• <strong>Faaliyet Giderleri:</strong> Personel, kira, pazarlama vs.</li>
              <li>• <strong>Net Kar/Zarar:</strong> Tüm gelir ve giderler sonrası nihai sonuç</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

