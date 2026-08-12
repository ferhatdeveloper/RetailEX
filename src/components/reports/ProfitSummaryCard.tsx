/**
 * ExRetailOS - Profit Summary Card
 * 
 * Fatura oluştururken anlık kar özeti gösterir
 * 
 * @created 2024-12-18
 */

import { TrendingUp, Banknote, Percent, AlertTriangle } from 'lucide-react';

interface ProfitSummaryCardProps {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  itemsWithProfit: number;
  itemsWithoutCost: number;
}

export function ProfitSummaryCard({
  totalRevenue,
  totalCost,
  grossProfit,
  grossMargin,
  itemsWithProfit,
  itemsWithoutCost
}: ProfitSummaryCardProps) {
  const formatMoney = (amount: number) => {
    return amount.toLocaleString('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };
  
  const isProfitable = grossProfit > 0;
  
  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-5 h-5 text-green-600" />
        <h3 className="font-semibold text-green-900">Anlık Kar Özeti</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="w-4 h-4 text-blue-600" />
            <div className="text-xs text-gray-600">Satış Tutarı</div>
          </div>
          <div className="text-xl font-bold text-blue-600">
            {formatMoney(totalRevenue)} IQD
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="w-4 h-4 text-orange-600" />
            <div className="text-xs text-gray-600">Maliyet (FIFO)</div>
          </div>
          <div className="text-xl font-bold text-orange-600">
            {formatMoney(totalCost)} IQD
          </div>
        </div>
        
        <div className={`rounded-lg p-3 shadow-sm ${
          isProfitable ? 'bg-green-100' : 'bg-red-100'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className={`w-4 h-4 ${isProfitable ? 'text-green-700' : 'text-red-700'}`} />
            <div className={`text-xs ${isProfitable ? 'text-green-700' : 'text-red-700'}`}>
              Brüt Kar
            </div>
          </div>
          <div className={`text-xl font-bold ${
            isProfitable ? 'text-green-700' : 'text-red-700'
          }`}>
            {formatMoney(grossProfit)} IQD
          </div>
        </div>
        
        <div className={`rounded-lg p-3 shadow-sm ${
          isProfitable ? 'bg-green-100' : 'bg-red-100'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <Percent className={`w-4 h-4 ${isProfitable ? 'text-green-700' : 'text-red-700'}`} />
            <div className={`text-xs ${isProfitable ? 'text-green-700' : 'text-red-700'}`}>
              Kar Marjı
            </div>
          </div>
          <div className={`text-xl font-bold ${
            isProfitable ? 'text-green-700' : 'text-red-700'
          }`}>
            {grossMargin.toFixed(2)}%
          </div>
        </div>
      </div>
      
      {itemsWithoutCost > 0 && (
        <div className="flex items-start gap-2 bg-yellow-100 border border-yellow-300 rounded p-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div className="text-yellow-800">
            <strong>{itemsWithoutCost} üründe</strong> maliyet bilgisi bulunamadı. 
            Önce alış faturası kesmeniz gerekiyor.
          </div>
        </div>
      )}
      
      <div className="mt-3 pt-3 border-t border-green-200">
        <div className="text-xs text-gray-600 text-center">
          {itemsWithProfit} üründe kar hesaplandı • FIFO Maliyet Yöntemi
        </div>
      </div>
    </div>
  );
}

