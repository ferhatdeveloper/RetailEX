/**
 * Advanced Reporting Module - Gelişmiş Raporlama
 * 100+ rapor şablonu, özel rapor oluşturma
 */

import React, { useState } from 'react';
import { FileText, Download, Calendar, Filter, PieChart, BarChart3, TrendingUp, Play, Database, X, Loader2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';

export function AdvancedReportingModule() {
  const { darkMode } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showNewReportModal, setShowNewReportModal] = useState(false);
  const [runningReport, setRunningReport] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const [categories] = useState([
    { id: 'sales', name: 'Satış Raporları', count: 28, icon: 'ğŸ“Š' },
    { id: 'stock', name: 'Stok Raporları', count: 18, icon: 'ğŸ“¦' },
    { id: 'finance', name: 'Finans Raporları', count: 24, icon: '💰' },
    { id: 'customer', name: 'Müşteri Raporları', count: 15, icon: 'ğŸ‘¥' },
    { id: 'hr', name: 'İnsan Kaynakları', count: 12, icon: 'ğŸ‘”' },
    { id: 'custom', name: 'Özel Raporlar', count: 8, icon: '⚙️' },
  ]);

  const [popularReports] = useState([
    { id: '1', name: 'Günlük Satış Raporu', category: 'Satış', uses: 1245, lastRun: '2 saat önce' },
    { id: '2', name: 'Stok Durum Raporu', category: 'Stok', uses: 987, lastRun: '5 saat önce' },
    { id: '3', name: 'Müşteri Analiz Raporu', category: 'Müşteri', uses: 756, lastRun: '1 gün önce' },
    { id: '4', name: 'Gelir-Gider Raporu', category: 'Finans', uses: 654, lastRun: '3 saat önce' },
    { id: '5', name: 'Karlılık Analizi', category: 'Finans', uses: 543, lastRun: '6 saat önce' },
  ]);

  const handleRunReport = async (reportId: string, reportName: string) => {
    console.log('Rapor çalıştırılıyor:', reportId, reportName);
    setRunningReport(reportId);
    toast.loading(`"${reportName}" raporu hazırlanıyor...`, { id: `run-${reportId}` });
    
    // Simüle edilmiş rapor çalıştırma
    setTimeout(() => {
      setRunningReport(null);
      toast.success(`"${reportName}" raporu başarıyla oluşturuldu!`, { id: `run-${reportId}` });
      console.log('Rapor çalıştırma tamamlandı:', reportId);
    }, 2000);
  };

  const handleDownloadReport = async (reportId: string, reportName: string) => {
    console.log('Rapor indiriliyor:', reportId, reportName);
    setDownloadingReport(reportId);
    toast.loading(`"${reportName}" raporu indiriliyor...`, { id: `download-${reportId}` });
    
    // Simüle edilmiş indirme
    setTimeout(() => {
      setDownloadingReport(null);
      toast.success(`"${reportName}" raporu başarıyla indirildi!`, { id: `download-${reportId}` });
      console.log('Rapor indirme tamamlandı:', reportId);
      
      // Gerçek indirme simülasyonu
      const link = document.createElement('a');
      link.href = '#'; // Gerçek uygulamada rapor URL'i olacak
      link.download = `${reportName}.pdf`;
      // link.click(); // Gerçek indirme için
    }, 1500);
  };

  const handleCreateNewReport = () => {
    console.log('Yeni rapor oluşturma modalı açılıyor');
    setShowNewReportModal(true);
  };

  const handleCategoryClick = (categoryId: string) => {
    console.log('Kategori seçildi:', categoryId);
    setSelectedCategory(categoryId);
    const categoryName = categories.find(c => c.id === categoryId)?.name;
    toast.success(`${categoryName} kategorisi seçildi (${categories.find(c => c.id === categoryId)?.count} rapor)`);
  };

  return (
    <div className={`p-6 space-y-6 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen`}>
      <div className="flex items-center justify-between">
        <h1 className={`text-2xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          <FileText className="w-8 h-8 text-blue-600" />
          Gelişmiş Raporlama
        </h1>
        <button 
          onClick={handleCreateNewReport}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
        >
          <PieChart className="w-4 h-4" />
          Yeni Rapor Oluştur
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-blue-50'} rounded-lg p-4 transition-colors`}>
          <FileText className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'} mb-2`} />
          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-blue-700'}`}>Toplam Rapor</p>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-blue-900'}`}>105</p>
        </div>
        <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-green-50'} rounded-lg p-4 transition-colors`}>
          <Download className={`w-8 h-8 ${darkMode ? 'text-green-400' : 'text-green-600'} mb-2`} />
          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-green-700'}`}>Bu Ay İndirme</p>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-green-900'}`}>1,247</p>
        </div>
        <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-purple-50'} rounded-lg p-4 transition-colors`}>
          <Calendar className={`w-8 h-8 ${darkMode ? 'text-purple-400' : 'text-purple-600'} mb-2`} />
          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-purple-700'}`}>Zamanlanmış</p>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-purple-900'}`}>23</p>
        </div>
        <div className={`${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-yellow-50'} rounded-lg p-4 transition-colors`}>
          <TrendingUp className={`w-8 h-8 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'} mb-2`} />
          <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-yellow-700'}`}>Özel Raporlar</p>
          <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-yellow-900'}`}>8</p>
        </div>
      </div>

      {/* Report Categories */}
      <div>
        <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Rapor Kategorileri</h2>
        <div className="grid grid-cols-3 gap-4">
          {categories.map(cat => (
            <div 
              key={cat.id} 
              onClick={() => handleCategoryClick(cat.id)}
              className={`${
                selectedCategory === cat.id 
                  ? darkMode 
                    ? 'bg-blue-900 border-blue-500 shadow-lg scale-105' 
                    : 'bg-blue-50 border-blue-500 shadow-lg scale-105'
                  : darkMode 
                    ? 'bg-gray-800 border-gray-700 hover:border-blue-500 hover:shadow-md' 
                    : 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-md'
              } rounded-lg shadow p-6 border-2 cursor-pointer transition-all duration-200`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{cat.icon}</span>
                <h3 className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>{cat.name}</h3>
              </div>
              <p className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>{cat.count} rapor</p>
            </div>
          ))}
        </div>
      </div>

      {/* Popular Reports */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow`}>
        <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
          <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>En Çok Kullanılan Raporlar</h2>
          <button 
            onClick={() => {
              setShowFilter(!showFilter);
              console.log('Filtreleme paneli:', !showFilter ? 'açıldı' : 'kapatıldı');
            }}
            className={`px-3 py-1 border ${showFilter ? 'bg-blue-600 text-white border-blue-600' : darkMode ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 hover:bg-gray-50'} rounded-lg text-sm flex items-center gap-2 transition-colors`}
          >
            <Filter className="w-4 h-4" />
            Filtrele
          </button>
        </div>
        {showFilter && (
          <div className={`p-4 border-b ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Kategori
                </label>
                <select
                  className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300'} rounded-lg text-sm`}
                  onChange={(e) => {
                    console.log('Kategori filtresi:', e.target.value);
                    if (e.target.value) {
                      setSelectedCategory(e.target.value);
                    }
                  }}
                >
                  <option value="">Tüm Kategoriler</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Kullanım Sayısı
                </label>
                <select
                  className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300'} rounded-lg text-sm`}
                >
                  <option value="">Tümü</option>
                  <option value="1000+">1000+</option>
                  <option value="500-999">500-999</option>
                  <option value="100-499">100-499</option>
                  <option value="0-99">0-99</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setShowFilter(false);
                    setSelectedCategory(null);
                    console.log('Filtreler temizlendi');
                  }}
                  className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 hover:bg-gray-100'} rounded-lg text-sm transition-colors`}
                >
                  Filtreleri Temizle
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b`}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} uppercase`}>Rapor Adı</th>
                <th className={`px-4 py-3 text-left text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} uppercase`}>Kategori</th>
                <th className={`px-4 py-3 text-right text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} uppercase`}>Kullanım</th>
                <th className={`px-4 py-3 text-left text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} uppercase`}>Son Çalıştırma</th>
                <th className={`px-4 py-3 text-center text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} uppercase`}>İşlemler</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-100'}`}>
              {popularReports.map(report => (
                <tr key={report.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                  <td className={`px-4 py-3 font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{report.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 ${darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'} rounded text-xs`}>
                      {report.category}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{report.uses}</td>
                  <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{report.lastRun}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunReport(report.id, report.name);
                        }}
                        disabled={runningReport === report.id}
                        className={`px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center gap-1 transition-colors ${
                          runningReport === report.id ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {runningReport === report.id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Çalışıyor...
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            Çalıştır
                          </>
                        )}
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadReport(report.id, report.name);
                        }}
                        disabled={downloadingReport === report.id}
                        className={`px-3 py-1 border ${darkMode ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 hover:bg-gray-50'} rounded text-sm transition-colors ${
                          downloadingReport === report.id ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {downloadingReport === report.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={`${darkMode ? 'bg-gradient-to-r from-gray-800 to-gray-700 border border-gray-600' : 'bg-gradient-to-r from-blue-50 to-purple-50'} rounded-lg p-6`}>
        <div className="flex items-start gap-4">
          <BarChart3 className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'} flex-shrink-0`} />
          <div>
            <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-blue-900'}`}>Özel Rapor Oluşturucu</h3>
            <p className={`text-sm mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Drag & Drop rapor editörü ile kendi raporlarınızı oluşturun. 
              SQL sorguları yazın, grafikler ekleyin ve otomatik zamanlama ayarlayın.
            </p>
            <button 
              onClick={handleCreateNewReport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              Özel Rapor Oluştur
            </button>
          </div>
        </div>
      </div>

      {/* Yeni Rapor Oluşturma Modalı */}
      {showNewReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden`}>
            <div className={`${darkMode ? 'bg-gray-900' : 'bg-blue-600'} px-6 py-4 flex items-center justify-between`}>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-white'}`}>Yeni Rapor Oluştur</h2>
              <button
                onClick={() => setShowNewReportModal(false)}
                className={`${darkMode ? 'text-gray-300 hover:bg-gray-800' : 'text-white hover:bg-blue-700'} rounded-lg p-2 transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Rapor Adı
                </label>
                <input
                  type="text"
                  className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Örn: Aylık Satış Özeti"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Kategori
                </label>
                <select
                  className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Kategori Seçin</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Açıklama
                </label>
                <textarea
                  rows={4}
                  className={`w-full px-3 py-2 border ${darkMode ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholder="Rapor hakkında açıklama..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowNewReportModal(false)}
                  className={`px-4 py-2 border ${darkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-50'} rounded-lg transition-colors`}
                >
                  İptal
                </button>
                <button
                  onClick={() => {
                    toast.success('Rapor şablonu oluşturuldu!');
                    setShowNewReportModal(false);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Oluştur
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

