import { useState } from 'react';
import { 
  Banknote, 
  TrendingUp, 
  TrendingDown,
  FileText,
  Receipt,
  Calculator,
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Printer
} from 'lucide-react';
import { stores, todayStats } from '../data/storeData';

export function FinancialControlCenter() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Calculate totals
  const totalRevenue = todayStats.reduce((sum, stat) => sum + stat.revenue, 0);
  const totalCash = todayStats.reduce((sum, stat) => sum + stat.cashBalance, 0);
  const totalTransactions = todayStats.reduce((sum, stat) => sum + stat.transactionCount, 0);

  // Z raporu stores
  const zReportStores = todayStats.map(stat => {
    const store = stores.find(s => s.id === stat.storeId)!;
    return {
      store,
      stat,
      zReportGenerated: Math.random() > 0.3,
      lastZReport: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString()
    };
  });

  const pendingZReports = zReportStores.filter(s => !s.zReportGenerated);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl text-gray-900">Finansal Kontrol Merkezi</h1>
              <p className="text-sm text-gray-600 mt-1">Tüm Mağazalar - Kasa ve Muhasebe Takibi</p>
            </div>
            
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Download className="w-4 h-4" />
                <span>Rapor Al</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Banknote className="w-5 h-5 text-green-600" />
                </div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {totalRevenue.toLocaleString('tr-TR')} IQD
              </div>
              <div className="text-sm text-gray-600">Toplam Günlük Ciro</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {totalCash.toLocaleString('tr-TR')} IQD
              </div>
              <div className="text-sm text-gray-600">Kasa Bakiyeleri</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {zReportStores.filter(s => s.zReportGenerated).length}/{stores.length}
              </div>
              <div className="text-sm text-gray-600">Z Raporu Oluşturuldu</div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-orange-600" />
                </div>
              </div>
              <div className="text-2xl text-gray-900 mb-1">
                {totalTransactions.toLocaleString('tr-TR')}
              </div>
              <div className="text-sm text-gray-600">Toplam İşlem</div>
            </div>
          </div>

          {/* Pending Z Reports Alert */}
          {pendingZReports.length > 0 && (
            <div className="bg-orange-50 border-l-4 border-orange-600 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-orange-900 font-medium mb-2">
                    Bekleyen Z Raporları ({pendingZReports.length} Mağaza)
                  </div>
                  <div className="text-sm text-orange-700">
                    Aşağıdaki mağazalar henüz günlük Z raporunu oluşturmadı. Lütfen ilgili mağaza müdürlerini bilgilendirin.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cash Management Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-gray-900">Kasa Yönetimi - Tüm Mağazalar</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs text-gray-600">Mağaza</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Bugün Ciro</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Nakit</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Kredi Kartı</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-600">Kasa Bakiye</th>
                    <th className="px-4 py-3 text-center text-xs text-gray-600">Z Raporu</th>
                    <th className="px-4 py-3 text-center text-xs text-gray-600">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {zReportStores.map(item => {
                    const cashPayment = Math.round(item.stat.revenue * 0.4);
                    const cardPayment = Math.round(item.stat.revenue * 0.6);
                    const highCash = item.stat.cashBalance > 50000;

                    return (
                      <tr key={item.store.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900">{item.store.name}</div>
                          <div className="text-xs text-gray-600">{item.store.code}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {item.stat.revenue.toLocaleString('tr-TR')} IQD
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">
                          {cashPayment.toLocaleString('tr-TR')} IQD
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">
                          {cardPayment.toLocaleString('tr-TR')} IQD
                        </td>
                        <td className={`px-4 py-3 text-sm text-right ${highCash ? 'text-orange-600 font-medium' : 'text-gray-900'}`}>
                          {item.stat.cashBalance.toLocaleString('tr-TR')} IQD
                          {highCash && <span className="ml-2 text-xs">⚠️ Yüksek</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.zReportGenerated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                              <CheckCircle className="w-3 h-3" />
                              Oluşturuldu
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                              <Clock className="w-3 h-3" />
                              Bekliyor
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded">
                              <FileText className="w-4 h-4" />
                            </button>
                            <button className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded">
                              <Printer className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Income/Expense Summary */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Gelir Dağılımı
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Nakit Satış</span>
                  <span className="text-sm font-medium text-gray-900">
                    {Math.round(totalRevenue * 0.4).toLocaleString('tr-TR')} IQD
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Kredi Kartı</span>
                  <span className="text-sm font-medium text-gray-900">
                    {Math.round(totalRevenue * 0.6).toLocaleString('tr-TR')} IQD
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-900 font-medium">Toplam</span>
                  <span className="text-sm font-medium text-green-600">
                    {totalRevenue.toLocaleString('tr-TR')} IQD
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-gray-900 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                  Gider Özeti
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Personel Maaş</span>
                  <span className="text-sm font-medium text-gray-900">
                    {(Math.round(totalRevenue * 0.15)).toLocaleString('tr-TR')} IQD
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Kira & Faturalar</span>
                  <span className="text-sm font-medium text-gray-900">
                    {(Math.round(totalRevenue * 0.10)).toLocaleString('tr-TR')} IQD
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  <span className="text-sm text-gray-900 font-medium">Toplam</span>
                  <span className="text-sm font-medium text-red-600">
                    {(Math.round(totalRevenue * 0.25)).toLocaleString('tr-TR')} IQD
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

