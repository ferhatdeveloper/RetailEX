/**
 * ExRetailOS - Customer Profitability Report
 * 
 * Müşteri bazlı karlılık analizi
 * - Toplam satış sayısı
 * - Satış tutarı
 * - Maliyet (FIFO)
 * - Brüt kar
 * - Kar marjı %
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Users, DollarSign, ShoppingCart, Download, Search } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { CostAccountingService } from '../../../services/costAccountingService';
import { toast } from 'sonner';

interface CustomerProfitData {
  customerId: string;
  customerName: string;
  transactionCount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  avgTransactionValue: number;
}

export function CustomerProfitabilityReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CustomerProfitData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'transactions'>('profit');

  useEffect(() => {
    if (selectedFirma && selectedDonem) {
      loadData();
    }
  }, [selectedFirma, selectedDonem]);

  const loadData = async () => {
    if (!selectedFirma || !selectedDonem) return;

    setLoading(true);
    try {
      // Mock data - In production, this would come from backend
      // Simulating customer transactions with profit data
      const mockData: CustomerProfitData[] = [
        {
          customerId: 'C001',
          customerName: 'Ahmed Al-Maliki',
          transactionCount: 15,
          totalRevenue: 45000000,
          totalCost: 30000000,
          grossProfit: 15000000,
          profitMargin: 33.33,
          avgTransactionValue: 3000000
        },
        {
          customerId: 'C002',
          customerName: 'Mohammed Hassan',
          transactionCount: 22,
          totalRevenue: 78000000,
          totalCost: 52000000,
          grossProfit: 26000000,
          profitMargin: 33.33,
          avgTransactionValue: 3545454
        },
        {
          customerId: 'C003',
          customerName: 'Ali Al-Sadr',
          transactionCount: 8,
          totalRevenue: 12000000,
          totalCost: 9000000,
          grossProfit: 3000000,
          profitMargin: 25.00,
          avgTransactionValue: 1500000
        },
        {
          customerId: 'C004',
          customerName: 'Fatima Al-Zubaidi',
          transactionCount: 31,
          totalRevenue: 95000000,
          totalCost: 60000000,
          grossProfit: 35000000,
          profitMargin: 36.84,
          avgTransactionValue: 3064516
        },
        {
          customerId: 'C005',
          customerName: 'Omar Al-Baghdadi',
          transactionCount: 12,
          totalRevenue: 28000000,
          totalCost: 20000000,
          grossProfit: 8000000,
          profitMargin: 28.57,
          avgTransactionValue: 2333333
        }
      ];

      setData(mockData);
    } catch (error) {
      console.error('[CustomerProfitabilityReport] Error:', error);
      toast.error('Rapor yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  // Filter and sort
  let filteredData = data.filter(c => {
    return !searchQuery || 
      c.customerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Sort
  filteredData.sort((a, b) => {
    if (sortBy === 'profit') return b.grossProfit - a.grossProfit;
    if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
    if (sortBy === 'transactions') return b.transactionCount - a.transactionCount;
    return 0;
  });

  // Summary
  const summary = {
    totalCustomers: filteredData.length,
    totalTransactions: filteredData.reduce((sum, c) => sum + c.transactionCount, 0),
    totalRevenue: filteredData.reduce((sum, c) => sum + c.totalRevenue, 0),
    totalCost: filteredData.reduce((sum, c) => sum + c.totalCost, 0),
    totalProfit: filteredData.reduce((sum, c) => sum + c.grossProfit, 0)
  };
  summary.profitMargin = summary.totalRevenue > 0 
    ? (summary.totalProfit / summary.totalRevenue) * 100 
    : 0;
  summary.avgTransactionValue = summary.totalTransactions > 0
    ? summary.totalRevenue / summary.totalTransactions
    : 0;

  const exportToExcel = () => {
    let csv = 'Müşteri Kodu,Müşteri Adı,İşlem Sayısı,Satış Tutarı,Maliyet,Brüt Kar,Kar Marjı %,Ort. İşlem Değeri\n';
    filteredData.forEach(c => {
      csv += `${c.customerId},${c.customerName},${c.transactionCount},${c.totalRevenue},${c.totalCost},${c.grossProfit},${c.profitMargin.toFixed(2)},${c.avgTransactionValue}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-profitability-${selectedDonem?.donem_adi}.csv`;
    a.click();
    
    toast.success('Rapor Excel\'e aktarıldı!');
  };

  if (!selectedFirma || !selectedDonem) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-yellow-800">
          <Users className="w-5 h-5" />
          <span>Lütfen firma ve dönem seçin</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-purple-600" />
            <div>
              <h2 className="text-xl font-semibold">Müşteri Karlılık Raporu</h2>
              <div className="text-sm text-gray-600">
                {selectedFirma.firma_adi} / {selectedDonem.donem_adi}
              </div>
            </div>
          </div>
          
          <button
            onClick={exportToExcel}
            disabled={filteredData.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Excel'e Aktar
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Müşteri kodu veya adı ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="profit">Kar'a Göre</option>
            <option value="revenue">Satış'a Göre</option>
            <option value="transactions">İşlem Sayısı'na Göre</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-purple-600" />
            <div className="text-sm text-purple-700">Müşteri Sayısı</div>
          </div>
          <div className="text-2xl font-bold text-purple-900">{summary.totalCustomers}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-blue-700">İşlem Sayısı</div>
          </div>
          <div className="text-2xl font-bold text-blue-900">{summary.totalTransactions}</div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            <div className="text-sm text-green-700">Toplam Satış</div>
          </div>
          <div className="text-xl font-bold text-green-900">
            {formatMoney(summary.totalRevenue)} IQD
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <div className="text-sm text-emerald-700">Toplam Kar</div>
          </div>
          <div className="text-xl font-bold text-emerald-900">
            {formatMoney(summary.totalProfit)} IQD
          </div>
          <div className="text-xs text-emerald-600 mt-1">
            Marj: {summary.profitMargin.toFixed(2)}%
          </div>
        </div>

        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border-2 border-cyan-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-cyan-600" />
            <div className="text-sm text-cyan-700">Ort. İşlem Değeri</div>
          </div>
          <div className="text-xl font-bold text-cyan-900">
            {formatMoney(summary.avgTransactionValue)} IQD
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <div className="mt-2 text-gray-600">Yükleniyor...</div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Veri bulunamadı
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Müşteri Kodu</th>
                  <th className="text-left px-4 py-3 font-semibold">Müşteri Adı</th>
                  <th className="text-right px-4 py-3 font-semibold">İşlem Sayısı</th>
                  <th className="text-right px-4 py-3 font-semibold">Ort. İşlem</th>
                  <th className="text-right px-4 py-3 font-semibold">Satış Tutarı</th>
                  <th className="text-right px-4 py-3 font-semibold">Maliyet</th>
                  <th className="text-right px-4 py-3 font-semibold">Brüt Kar</th>
                  <th className="text-right px-4 py-3 font-semibold">Marj %</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((customer, idx) => {
                  const isProfitable = customer.grossProfit >= 0;
                  
                  return (
                    <tr 
                      key={customer.customerId} 
                      className={`border-t hover:bg-gray-50 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-purple-600">
                        {customer.customerId}
                      </td>
                      <td className="px-4 py-3 font-medium">{customer.customerName}</td>
                      <td className="px-4 py-3 text-right">
                        {customer.transactionCount}
                      </td>
                      <td className="px-4 py-3 text-right text-cyan-700">
                        {formatMoney(customer.avgTransactionValue)} IQD
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {formatMoney(customer.totalRevenue)} IQD
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-700">
                        {formatMoney(customer.totalCost)} IQD
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${
                        isProfitable ? 'text-green-700' : 'text-red-700'
                      }`}>
                        <div className="flex items-center justify-end gap-1">
                          {isProfitable ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          {formatMoney(Math.abs(customer.grossProfit))} IQD
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${
                        isProfitable ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {customer.profitMargin.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-bold">
                    TOPLAM ({summary.totalCustomers} müşteri, {summary.totalTransactions} işlem)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700">
                    {formatMoney(summary.totalRevenue)} IQD
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-orange-700">
                    {formatMoney(summary.totalCost)} IQD
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">
                    {formatMoney(summary.totalProfit)} IQD
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">
                    {summary.profitMargin.toFixed(2)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

