/**
 * ExRetailOS - Mizan Raporu (Trial Balance)
 * 
 * Hesapların borç-alacak dengelerini gösteren rapor
 * Logo muhasebe formatında
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import { FileText, Download, Printer, Calendar, Filter, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { MizanService, type MizanLine, type MizanSummary, formatMoney, getBakiyeType } from '../../../services/mizanService';
import { toast } from 'sonner';

export function MizanReportModule() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  
  const [loading, setLoading] = useState(false);
  const [mizanLines, setMizanLines] = useState<MizanLine[]>([]);
  const [summary, setSummary] = useState<MizanSummary | null>(null);
  
  // Filtreler
  const [baslangicTarihi, setBaslangicTarihi] = useState('');
  const [bitisTarihi, setBitisTarihi] = useState('');
  const [hesapKoduFiltre, setHesapKoduFiltre] = useState('');
  const [detaySeviye, setDetaySeviye] = useState<1 | 2 | 3>(3);
  const [hesapTipiFiltre, setHesapTipiFiltre] = useState<string>('all');
  
  /**
   * Mizan'ı yükle
   */
  const loadMizan = async () => {
    if (!selectedFirma || !selectedDonem) {
      toast.error('❌ Firma ve dönem seçilmeli!');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await MizanService.generateMizan({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        baslangic_tarihi: baslangicTarihi || undefined,
        bitis_tarihi: bitisTarihi || undefined,
        hesap_kodu_filtre: hesapKoduFiltre || undefined,
        detay_seviye: detaySeviye
      });
      
      setMizanLines(result.lines);
      setSummary(result.summary);
      
      if (result.summary.dengeli) {
        toast.success('✅ Mizan dengeli!', {
          description: `${result.lines.length} hesap, Toplam: ${formatMoney(result.summary.toplam_borc)} IQD`
        });
      } else {
        toast.warning('⚠️ Mizan dengesiz!', {
          description: `Fark: ${formatMoney(result.summary.fark)} IQD`
        });
      }
      
    } catch (error: any) {
      console.error('[Mizan] Load error:', error);
      toast.error('❌ Mizan yüklenemedi!', {
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
      // Dönem tarihlerini otomatik set et
      if (selectedDonem.baslangic_tarihi) {
        setBaslangicTarihi(selectedDonem.baslangic_tarihi);
      }
      if (selectedDonem.bitis_tarihi) {
        setBitisTarihi(selectedDonem.bitis_tarihi);
      }
      
      loadMizan();
    }
  }, [selectedFirma, selectedDonem]);
  
  /**
   * Filtrelenmiş satırlar
   */
  const filteredLines = mizanLines.filter(line => {
    if (hesapTipiFiltre !== 'all' && line.hesap_tipi !== hesapTipiFiltre) {
      return false;
    }
    return true;
  });
  
  /**
   * PDF Export
   */
  const handleExportPDF = () => {
    toast.info('ğŸ“„ PDF export yakında...');
    MizanService.exportToPDF(filteredLines, summary!);
  };
  
  /**
   * Excel Export
   */
  const handleExportExcel = () => {
    toast.info('ğŸ“Š Excel export yakında...');
    MizanService.exportToExcel(filteredLines, summary!);
  };
  
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
          <FileText className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl">Mizan Raporu</h2>
            <p className="text-sm text-gray-500">
              {selectedFirma?.firma_adi} - {selectedDonem?.donem_adi}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={loadMizan}
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
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>
      
      {/* Filtreler */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium">Filtreler</h3>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Tarih Aralığı */}
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
          
          {/* Hesap Kodu */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Hesap Kodu</label>
            <input
              type="text"
              placeholder="Örn: 100"
              value={hesapKoduFiltre}
              onChange={(e) => setHesapKoduFiltre(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Detay Seviye */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Detay Seviye</label>
            <select
              value={detaySeviye}
              onChange={(e) => setDetaySeviye(parseInt(e.target.value) as 1 | 2 | 3)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Ana Hesaplar</option>
              <option value={2}>Alt Hesaplar</option>
              <option value={3}>Tümü (Detay)</option>
            </select>
          </div>
          
          {/* Hesap Tipi */}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Hesap Tipi</label>
            <select
              value={hesapTipiFiltre}
              onChange={(e) => setHesapTipiFiltre(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tümü</option>
              <option value="AKTIF">Aktif</option>
              <option value="PASIF">Pasif</option>
              <option value="GELIR">Gelir</option>
              <option value="GIDER">Gider</option>
              <option value="SERMAYE">Sermaye</option>
            </select>
          </div>
          
          {/* Uygula Butonu */}
          <div className="flex items-end">
            <button
              onClick={loadMizan}
              disabled={loading}
              className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Uygula
            </button>
          </div>
        </div>
      </div>
      
      {/* Özet Kartlar */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-600 mb-1">Toplam Borç</div>
            <div className="text-2xl text-blue-600">{formatMoney(summary.toplam_borc)} IQD</div>
          </div>
          
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-600 mb-1">Toplam Alacak</div>
            <div className="text-2xl text-green-600">{formatMoney(summary.toplam_alacak)} IQD</div>
          </div>
          
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-600 mb-1">Fark</div>
            <div className={`text-2xl ${summary.dengeli ? 'text-green-600' : 'text-red-600'}`}>
              {formatMoney(summary.fark)} IQD
            </div>
          </div>
          
          <div className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-600 mb-1">Durum</div>
            <div className="flex items-center gap-2">
              {summary.dengeli ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <span className="text-lg text-green-600">Dengeli</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-6 h-6 text-red-600" />
                  <span className="text-lg text-red-600">Dengesiz!</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Mizan Tablosu */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-3 text-gray-600">Mizan hesaplanıyor...</span>
          </div>
        ) : filteredLines.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Henüz muhasebe hareketi yok</p>
            <p className="text-sm">Fatura keserek başlayabilirsiniz</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm" rowSpan={2}>Hesap Kodu</th>
                  <th className="px-4 py-3 text-left text-sm" rowSpan={2}>Hesap Adı</th>
                  <th className="px-4 py-3 text-center text-sm" rowSpan={2}>Tip</th>
                  <th className="px-4 py-3 text-center text-sm border-l border-blue-500" colSpan={2}>Önceki Dönem</th>
                  <th className="px-4 py-3 text-center text-sm border-l border-blue-500" colSpan={2}>Dönem Hareket</th>
                  <th className="px-4 py-3 text-center text-sm border-l border-blue-500" colSpan={2}>Toplam</th>
                  <th className="px-4 py-3 text-center text-sm border-l border-blue-500" colSpan={2}>Bakiye</th>
                </tr>
                <tr>
                  <th className="px-4 py-2 text-center text-xs border-l border-blue-500">Borç</th>
                  <th className="px-4 py-2 text-center text-xs">Alacak</th>
                  <th className="px-4 py-2 text-center text-xs border-l border-blue-500">Borç</th>
                  <th className="px-4 py-2 text-center text-xs">Alacak</th>
                  <th className="px-4 py-2 text-center text-xs border-l border-blue-500">Borç</th>
                  <th className="px-4 py-2 text-center text-xs">Alacak</th>
                  <th className="px-4 py-2 text-center text-xs border-l border-blue-500">Borç</th>
                  <th className="px-4 py-2 text-center text-xs">Alacak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLines.map((line, index) => (
                  <tr
                    key={line.hesap_kodu}
                    className={`
                      hover:bg-blue-50 transition-colors
                      ${line.seviye === 1 ? 'bg-gray-50' : ''}
                      ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                    `}
                  >
                    <td className={`px-4 py-2 text-sm ${line.seviye === 1 ? '' : 'text-gray-700'}`}>
                      {line.hesap_kodu}
                    </td>
                    <td className={`px-4 py-2 text-sm ${line.seviye === 1 ? '' : 'pl-6'}`}>
                      {line.hesap_adi}
                    </td>
                    <td className="px-4 py-2 text-xs text-center">
                      <span className={`
                        px-2 py-1 rounded text-xs
                        ${line.hesap_tipi === 'AKTIF' ? 'bg-blue-100 text-blue-700' : ''}
                        ${line.hesap_tipi === 'PASIF' ? 'bg-red-100 text-red-700' : ''}
                        ${line.hesap_tipi === 'GELIR' ? 'bg-green-100 text-green-700' : ''}
                        ${line.hesap_tipi === 'GIDER' ? 'bg-orange-100 text-orange-700' : ''}
                        ${line.hesap_tipi === 'SERMAYE' ? 'bg-purple-100 text-purple-700' : ''}
                      `}>
                        {line.hesap_tipi}
                      </span>
                    </td>
                    
                    {/* Önceki Dönem */}
                    <td className="px-4 py-2 text-sm text-right border-l">
                      {line.onceki_donem_borc > 0 ? formatMoney(line.onceki_donem_borc) : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      {line.onceki_donem_alacak > 0 ? formatMoney(line.onceki_donem_alacak) : '-'}
                    </td>
                    
                    {/* Dönem Hareket */}
                    <td className="px-4 py-2 text-sm text-right border-l text-blue-600">
                      {line.donem_borc > 0 ? formatMoney(line.donem_borc) : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-green-600">
                      {line.donem_alacak > 0 ? formatMoney(line.donem_alacak) : '-'}
                    </td>
                    
                    {/* Toplam */}
                    <td className="px-4 py-2 text-sm text-right border-l">
                      {line.toplam_borc > 0 ? formatMoney(line.toplam_borc) : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      {line.toplam_alacak > 0 ? formatMoney(line.toplam_alacak) : '-'}
                    </td>
                    
                    {/* Bakiye */}
                    <td className="px-4 py-2 text-sm text-right border-l">
                      {line.bakiye_borc > 0 ? (
                        <span className="text-blue-700">{formatMoney(line.bakiye_borc)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      {line.bakiye_alacak > 0 ? (
                        <span className="text-green-700">{formatMoney(line.bakiye_alacak)}</span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                
                {/* TOPLAM Satırı */}
                {summary && (
                  <tr className="bg-gradient-to-r from-gray-100 to-gray-200 font-semibold">
                    <td colSpan={3} className="px-4 py-3 text-sm">
                      TOPLAM ({filteredLines.length} hesap)
                    </td>
                    <td className="px-4 py-3 text-sm text-right border-l">-</td>
                    <td className="px-4 py-3 text-sm text-right">-</td>
                    <td className="px-4 py-3 text-sm text-right border-l text-blue-700">
                      {formatMoney(summary.toplam_borc)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-700">
                      {formatMoney(summary.toplam_alacak)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right border-l text-blue-700">
                      {formatMoney(summary.toplam_borc)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-700">
                      {formatMoney(summary.toplam_alacak)}
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-center border-l">
                      {summary.dengeli ? (
                        <span className="text-green-600">✓ DENGELİ</span>
                      ) : (
                        <span className="text-red-600">✗ DENGESİZ ({formatMoney(summary.fark)} IQD)</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="mb-2">
              <strong>Mizan Nedir?</strong> Tüm hesapların borç-alacak dengelerini gösteren rapordur.
            </p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>Önceki Dönem:</strong> Geçen dönemden devreden bakiyeler</li>
              <li>• <strong>Dönem Hareket:</strong> Bu dönemde yapılan tüm işlemler</li>
              <li>• <strong>Toplam:</strong> Önceki dönem + Dönem hareketleri</li>
              <li>• <strong>Bakiye:</strong> Net bakiye (Borç - Alacak)</li>
              <li>• <strong>Dengeli Mizan:</strong> Toplam Borç = Toplam Alacak olmalı ✅</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

