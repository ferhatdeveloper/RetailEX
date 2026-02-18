import { Calculator, TrendingUp, TrendingDown } from 'lucide-react';

export function BudgetModule() {
  const budgets = [
    { category: 'Satış Geliri', budgeted: 500000, actual: 475000, variance: -25000, percentage: 95 },
    { category: 'Satın Alma Gideri', budgeted: 250000, actual: 265000, variance: 15000, percentage: 106 },
    { category: 'Personel Maaşları', budgeted: 100000, actual: 98000, variance: -2000, percentage: 98 },
    { category: 'Kira & Faturalar', budgeted: 30000, actual: 28500, variance: -1500, percentage: 95 },
    { category: 'Pazarlama', budgeted: 20000, actual: 22000, variance: 2000, percentage: 110 },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-violet-600 to-violet-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          <h2 className="text-sm">Bütçe & Maliyet Yönetimi</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Bütçe Özeti</h3>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-200">
            <div className="p-3">
              <div className="text-[10px] text-gray-600">Planlanan Bütçe</div>
              <div className="text-base text-blue-600">{budgets.reduce((s, b) => s + b.budgeted, 0).toLocaleString()}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-[10px] text-gray-600">Gerçekleşen</span>
              </div>
              <div className="text-base text-green-600">{budgets.reduce((s, b) => s + b.actual, 0).toLocaleString()}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-600">Pozitif Varyans</span>
              </div>
              <div className="text-base text-orange-600">{budgets.filter(b => b.variance < 0).reduce((s, b) => s + Math.abs(b.variance), 0).toLocaleString()}</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-[10px] text-gray-600">Negatif Varyans</span>
              </div>
              <div className="text-base text-red-600">{budgets.filter(b => b.variance > 0).reduce((s, b) => s + b.variance, 0).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Bütçe Tablosu */}
        <div className="bg-white border border-gray-300">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Bütçe Karşılaştırma</h3>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#E3F2FD] border-b border-gray-300">
                <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">KATEGORİ</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">BÜTÇE</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">GERÇEKLEŞEN</th>
                <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">VARYANS</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">ORAN</th>
                <th className="px-2 py-1 text-center text-[10px] text-gray-700">İLERLEME</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget, idx) => (
                <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-2 py-0.5 text-[10px] border-r border-gray-200">{budget.category}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] border-r border-gray-200">{budget.budgeted.toLocaleString()}</td>
                  <td className="px-2 py-0.5 text-right text-[10px] border-r border-gray-200">{budget.actual.toLocaleString()}</td>
                  <td className={`px-2 py-0.5 text-right text-[10px] border-r border-gray-200 ${budget.variance < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {budget.variance > 0 ? '+' : ''}{budget.variance.toLocaleString()}
                  </td>
                  <td className="px-2 py-0.5 text-center border-r border-gray-200">
                    <span className={`px-2 py-0.5 rounded text-[9px] ${
                      budget.percentage <= 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {budget.percentage}%
                    </span>
                  </td>
                  <td className="px-2 py-0.5">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full ${budget.percentage <= 100 ? 'bg-green-600' : 'bg-red-600'}`}
                          style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
