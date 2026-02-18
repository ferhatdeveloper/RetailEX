/**
 * ExRetailOS - Invoice Line with Profit Display
 * 
 * Fatura satırında anlık kar gösterimi
 * FIFO maliyeti otomatik hesaplanır
 * 
 * @created 2024-12-18
 */

import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { batchCalculateFIFOCost } from '../../../hooks/useFIFOCost';

interface InvoiceLineWithProfitProps {
  lines: Array<{
    id: string;
    productId?: string;
    productCode: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  isSalesInvoice: boolean; // Satış mı, alış mı?
}

export function InvoiceLineWithProfit({ lines, isSalesInvoice }: InvoiceLineWithProfitProps) {
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const [profitData, setProfitData] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(false);
  
  /**
   * FIFO maliyetlerini hesapla (sadece satış faturalarında)
   */
  useEffect(() => {
    if (!isSalesInvoice || !selectedFirma || !selectedDonem) {
      return;
    }
    
    const validLines = lines.filter(l => l.productCode && l.quantity > 0);
    if (validLines.length === 0) {
      return;
    }
    
    let cancelled = false;
    
    const calculate = async () => {
      setLoading(true);
      
      try {
        const items = validLines.map(line => ({
          productId: line.productId || line.productCode,
          productCode: line.productCode,
          quantity: line.quantity
        }));
        
        const costs = await batchCalculateFIFOCost({
          items,
          firmaId: selectedFirma.id,
          donemId: selectedDonem.id
        });
        
        if (!cancelled) {
          setProfitData(costs);
        }
        
      } catch (error) {
        console.error('[InvoiceLineWithProfit] Error:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    calculate();
    
    return () => {
      cancelled = true;
    };
  }, [lines, isSalesInvoice, selectedFirma, selectedDonem]);
  
  /**
   * Satır için kar hesapla
   */
  const calculateProfit = (line: any) => {
    if (!isSalesInvoice) return null;
    
    const productKey = line.productId || line.productCode;
    const cost = profitData.get(productKey);
    
    if (!cost || !cost.available) {
      return {
        hasCost: false,
        unitCost: 0,
        totalCost: 0,
        grossProfit: 0,
        profitMargin: 0
      };
    }
    
    const totalRevenue = line.total || 0;
    const totalCost = cost.totalCost;
    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    
    return {
      hasCost: true,
      unitCost: cost.unitCost,
      totalCost,
      grossProfit,
      profitMargin
    };
  };
  
  /**
   * Toplam kar hesapla
   */
  const calculateTotalProfit = () => {
    let totalRevenue = 0;
    let totalCost = 0;
    let itemsWithCost = 0;
    let itemsWithoutCost = 0;
    
    lines.forEach(line => {
      if (!line.productCode || line.quantity <= 0) return;
      
      totalRevenue += line.total || 0;
      
      const profit = calculateProfit(line);
      if (profit?.hasCost) {
        totalCost += profit.totalCost;
        itemsWithCost++;
      } else {
        itemsWithoutCost++;
      }
    });
    
    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    
    return {
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin,
      itemsWithCost,
      itemsWithoutCost
    };
  };
  
  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };
  
  if (!isSalesInvoice) {
    return null; // Alış faturalarında kar gösterme
  }
  
  const totals = calculateTotalProfit();
  
  return (
    <div className="space-y-4">
      {/* Per-Line Profit Display */}
      {lines.map((line, idx) => {
        if (!line.productCode || line.quantity <= 0) return null;
        
        const profit = calculateProfit(line);
        if (!profit) return null;
        
        const isProfitable = profit.grossProfit > 0;
        
        return (
          <div key={line.id} className={`rounded-lg border-2 p-3 ${
            profit.hasCost 
              ? isProfitable 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">
                {line.productCode} - {line.productName}
              </div>
              {loading && (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              )}
            </div>
            
            {profit.hasCost ? (
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <div className="text-gray-600 mb-1">Satış</div>
                  <div className="font-semibold text-blue-700">
                    {formatMoney(line.total)} IQD
                  </div>
                </div>
                
                <div>
                  <div className="text-gray-600 mb-1">Maliyet (FIFO)</div>
                  <div className="font-semibold text-orange-700">
                    {formatMoney(profit.totalCost)} IQD
                  </div>
                </div>
                
                <div>
                  <div className="text-gray-600 mb-1">Kar</div>
                  <div className={`font-semibold flex items-center gap-1 ${
                    isProfitable ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {isProfitable ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {formatMoney(profit.grossProfit)} IQD
                  </div>
                </div>
                
                <div>
                  <div className="text-gray-600 mb-1">Marj</div>
                  <div className={`font-semibold ${
                    isProfitable ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {profit.profitMargin.toFixed(2)}%
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-800 text-xs">
                <AlertCircle className="w-4 h-4" />
                <span>Maliyet bilgisi yok. Önce alış faturası kesilmeli.</span>
              </div>
            )}
          </div>
        );
      })}
      
      {/* Total Profit Summary */}
      {totals.itemsWithCost > 0 && (
        <div className="bg-gradient-to-br from-green-100 to-emerald-100 border-2 border-green-300 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-green-700" />
            <h3 className="font-semibold text-green-900">TOPLAM KAR ÖZETİ</h3>
          </div>
          
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Satış Toplamı</div>
              <div className="font-bold text-blue-700">
                {formatMoney(totals.totalRevenue)} IQD
              </div>
            </div>
            
            <div className="bg-white rounded p-2">
              <div className="text-xs text-gray-600 mb-1">Maliyet Toplamı</div>
              <div className="font-bold text-orange-700">
                {formatMoney(totals.totalCost)} IQD
              </div>
            </div>
            
            <div className={`rounded p-2 ${
              totals.grossProfit >= 0 ? 'bg-green-200' : 'bg-red-200'
            }`}>
              <div className={`text-xs mb-1 ${
                totals.grossProfit >= 0 ? 'text-green-800' : 'text-red-800'
              }`}>
                Toplam Kar
              </div>
              <div className={`font-bold flex items-center gap-1 ${
                totals.grossProfit >= 0 ? 'text-green-900' : 'text-red-900'
              }`}>
                {totals.grossProfit >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                {formatMoney(Math.abs(totals.grossProfit))} IQD
              </div>
            </div>
            
            <div className={`rounded p-2 ${
              totals.grossProfit >= 0 ? 'bg-green-200' : 'bg-red-200'
            }`}>
              <div className={`text-xs mb-1 ${
                totals.grossProfit >= 0 ? 'text-green-800' : 'text-red-800'
              }`}>
                Kar Marjı
              </div>
              <div className={`font-bold ${
                totals.grossProfit >= 0 ? 'text-green-900' : 'text-red-900'
              }`}>
                {totals.grossMargin.toFixed(2)}%
              </div>
            </div>
          </div>
          
          {totals.itemsWithoutCost > 0 && (
            <div className="mt-3 flex items-center gap-2 bg-yellow-100 border border-yellow-300 rounded p-2 text-xs text-yellow-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>{totals.itemsWithoutCost} üründe</strong> maliyet bilgisi bulunamadı.
              </span>
            </div>
          )}
          
          <div className="mt-3 text-center text-xs text-green-800">
            ✅ {totals.itemsWithCost} üründe kar hesaplandı • FIFO Maliyet Yöntemi
          </div>
        </div>
      )}
    </div>
  );
}

