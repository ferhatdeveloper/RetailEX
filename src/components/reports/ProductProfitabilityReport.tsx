/**
 * ExRetailOS - Product Profitability Report
 * 
 * Ürün bazlı karlılık analizi
 * - Satış miktarı
 * - Satış tutarı
 * - Maliyet (FIFO)
 * - Brüt kar
 * - Kar marjı %
 * 
 * @created 2024-12-18
 */

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Package, Banknote, Percent, Download, Search, Filter } from 'lucide-react';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { CostAccountingService } from '../../services/costAccountingService';
import { toast } from 'sonner';

interface ProductProfitData {
  productCode: string;
  productName: string;
  totalQuantitySold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  avgUnitPrice: number;
  avgUnitCost: number;
}

export function ProductProfitabilityReport() {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProductProfitData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'margin'>('profit');
  const [filterProfitable, setFilterProfitable] = useState<'all' | 'profitable' | 'loss'>('all');

  useEffect(() => {
    if (selectedFirma && selectedDonem) {
      loadData();
    }
  }, [selectedFirma, selectedDonem]);

  const loadData = async () => {
    if (!selectedFirma || !selectedDonem) return;

    setLoading(true);
    try {
      // Get all stock movements for the period
      const movements = await CostAccountingService.getStockMovements({
        firma_id: selectedFirma.id,
        donem_id: selectedDonem.id,
        movement_type: 'OUT' // Only sales
      });

      // Aggregate by product
      const productMap = new Map<string, ProductProfitData>();

      movements.forEach(movement => {
        const key = movement.product_code;
        
        if (!productMap.has(key)) {
          productMap.set(key, {
            productCode: movement.product_code,
            productName: movement.product_name,
            totalQuantitySold: 0,
            totalRevenue: 0,
            totalCost: 0,
            grossProfit: 0,
            profitMargin: 0,
            avgUnitPrice: 0,
            avgUnitCost: 0
          });
        }

        const product = productMap.get(key)!;
        product.totalQuantitySold += movement.quantity;
        product.totalRevenue += movement.total_price || 0;
        product.totalCost += movement.total_cost || 0;
      });

      // Calculate metrics
      const results: ProductProfitData[] = [];
      productMap.forEach(product => {
        product.grossProfit = product.totalRevenue - product.totalCost;
        product.profitMargin = product.totalRevenue > 0 
          ? (product.grossProfit / product.totalRevenue) * 100 
          : 0;
        product.avgUnitPrice = product.totalQuantitySold > 0
          ? product.totalRevenue / product.totalQuantitySold
          : 0;
        product.avgUnitCost = product.totalQuantitySold > 0
          ? product.totalCost / product.totalQuantitySold
          : 0;
        
        results.push(product);
      });

      setData(results);
    } catch (error) {
      console.error('[ProductProfitabilityReport] Error:', error);
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
  let filteredData = data.filter(p => {
    const matchesSearch = !searchQuery || 
      p.productCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.productName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = filterProfitable === 'all' ||
      (filterProfitable === 'profitable' && p.grossProfit > 0) ||
      (filterProfitable === 'loss' && p.grossProfit < 0);
    
    return matchesSearch && matchesFilter;
  });

  // Sort
  filteredData.sort((a, b) => {
    if (sortBy === 'profit') return b.grossProfit - a.grossProfit;
    if (sortBy === 'revenue') return b.totalRevenue - a.totalRevenue;
    if (sortBy === 'margin') return b.profitMargin - a.profitMargin;
    return 0;
  });

  // Summary
  const summary = {
    totalProducts: filteredData.length,
    totalRevenue: filteredData.reduce((sum, p) => sum + p.totalRevenue, 0),
    totalCost: filteredData.reduce((sum, p) => sum + p.totalCost, 0),
    totalProfit: filteredData.reduce((sum, p) => sum + p.grossProfit, 0),
    profitableProducts: filteredData.filter(p => p.grossProfit > 0).length,
    lossProducts: filteredData.filter(p => p.grossProfit < 0).length
  };
  summary.profitMargin = summary.totalRevenue > 0 
    ? (summary.totalProfit / summary.totalRevenue) * 100 
    : 0;

  const exportToExcel = () => {
    // Simple CSV export
    let csv = 'Ürün Kodu,Ürün Adı,Miktar,Satış Tutarı,Maliyet,Brüt Kar,Kar Marjı %\n';
    filteredData.forEach(p => {
      csv += `${p.productCode},${p.productName},${p.totalQuantitySold},${p.totalRevenue},${p.totalCost},${p.grossProfit},${p.profitMargin.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-profitability-${selectedDonem?.donem_adi}.csv`;
    a.click();
    
    toast.success('Rapor Excel\'e aktarıldı!');
  };

  if (!selectedFirma || !selectedDonem) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-yellow-800">
          <Package className="w-5 h-5" />
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
            <Package className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold">Ürün Karlılık Raporu</h2>
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
              placeholder="Ürün kodu veya adı ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          <select
            value={filterProfitable}
            onChange={(e) => setFilterProfitable(e.target.value as any)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">Tüm Ürünler</option>
            <option value="profitable">Karlı Ürünler</option>
            <option value="loss">Zararlı Ürünler</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="profit">Kar'a Göre</option>
            <option value="revenue">Satış'a Göre</option>
            <option value="margin">Marj'a Göre</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-5 h-5 text-blue-600" />
            <div className="text-sm text-blue-700">Toplam Ürün</div>
          </div>
          <div className="text-2xl font-bold text-blue-900">{summary.totalProducts}</div>
          <div className="text-xs text-blue-600 mt-1">
            {summary.profitableProducts} karlı, {summary.lossProducts} zararlı
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-green-600" />
            <div className="text-sm text-green-700">Toplam Satış</div>
          </div>
          <div className="text-2xl font-bold text-green-900">
            {formatMoney(summary.totalRevenue)} IQD
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="w-5 h-5 text-orange-600" />
            <div className="text-sm text-orange-700">Toplam Maliyet</div>
          </div>
          <div className="text-2xl font-bold text-orange-900">
            {formatMoney(summary.totalCost)} IQD
          </div>
        </div>

        <div className={`bg-gradient-to-br rounded-lg p-4 border-2 ${
          summary.totalProfit >= 0
            ? 'from-emerald-50 to-emerald-100 border-emerald-200'
            : 'from-red-50 to-red-100 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {summary.totalProfit >= 0 ? (
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )}
            <div className={`text-sm ${
              summary.totalProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}>
              Toplam Kar
            </div>
          </div>
          <div className={`text-2xl font-bold ${
            summary.totalProfit >= 0 ? 'text-emerald-900' : 'text-red-900'
          }`}>
            {formatMoney(Math.abs(summary.totalProfit))} IQD
          </div>
          <div className={`text-xs mt-1 ${
            summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
          }`}>
            Marj: {summary.profitMargin.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
                  <th className="text-left px-4 py-3 font-semibold">Ürün Kodu</th>
                  <th className="text-left px-4 py-3 font-semibold">Ürün Adı</th>
                  <th className="text-right px-4 py-3 font-semibold">Miktar</th>
                  <th className="text-right px-4 py-3 font-semibold">Ort. Fiyat</th>
                  <th className="text-right px-4 py-3 font-semibold">Satış Tutarı</th>
                  <th className="text-right px-4 py-3 font-semibold">Maliyet</th>
                  <th className="text-right px-4 py-3 font-semibold">Brüt Kar</th>
                  <th className="text-right px-4 py-3 font-semibold">Marj %</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((product, idx) => {
                  const isProfitable = product.grossProfit >= 0;
                  
                  return (
                    <tr 
                      key={product.productCode} 
                      className={`border-t hover:bg-gray-50 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-blue-600">
                        {product.productCode}
                      </td>
                      <td className="px-4 py-3">{product.productName}</td>
                      <td className="px-4 py-3 text-right">
                        {product.totalQuantitySold.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(product.avgUnitPrice)} IQD
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {formatMoney(product.totalRevenue)} IQD
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-700">
                        {formatMoney(product.totalCost)} IQD
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
                          {formatMoney(Math.abs(product.grossProfit))} IQD
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${
                        isProfitable ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {product.profitMargin.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={4} className="px-4 py-3 font-bold">TOPLAM</td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700">
                    {formatMoney(summary.totalRevenue)} IQD
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-orange-700">
                    {formatMoney(summary.totalCost)} IQD
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    summary.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {formatMoney(Math.abs(summary.totalProfit))} IQD
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${
                    summary.totalProfit >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
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

