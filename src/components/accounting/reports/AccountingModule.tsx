import { useMemo } from 'react';
import { FileSpreadsheet, TrendingDown } from 'lucide-react';
import { formatNumber } from '../../../utils/formatNumber';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

type AccountRow = {
  code: string;
  name: string;
  balance: number;
  type: string;
};

export function AccountingModule() {
  const accounts: AccountRow[] = [
    { code: '100', name: 'Kasa', balance: 45000, type: 'Aktif' },
    { code: '102', name: 'Bankalar', balance: 125000, type: 'Aktif' },
    { code: '120', name: 'Alıcılar', balance: 85000, type: 'Aktif' },
    { code: '320', name: 'Satıcılar', balance: -65000, type: 'Pasif' },
  ];

  const columns = useMemo<ReportColumnTableCol<AccountRow>[]>(
    () => [
      {
        key: 'code',
        header: 'HESAP KODU',
        size: 110,
        cell: (a) => <span className="font-mono text-[10px]">{a.code}</span>,
      },
      { key: 'name', header: 'HESAP ADI', size: 180 },
      {
        key: 'type',
        header: 'TİP',
        size: 100,
        cell: (a) => (
          <span
            className={`px-2 py-0.5 text-[9px] rounded ${
              a.type === 'Aktif' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {a.type}
          </span>
        ),
      },
      {
        key: 'balance',
        header: 'BAKİYE',
        type: 'number',
        align: 'right',
        size: 120,
        cell: (a) => (
          <span className={`text-[10px] ${a.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatNumber(Math.abs(a.balance), 0, false)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-4 py-2">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          <h2 className="text-sm">Muhasebe & Mali İşlemler</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Kurumsal Özet Panel */}
        <div className="bg-white border border-gray-300 rounded mb-3">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
            <h3 className="text-[11px] text-gray-700">Finansal Durum Özeti</h3>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-200">
            <div className="p-3">
              <span className="text-[10px] text-gray-600">Toplam Alacak</span>
              <div className="text-base text-green-600">255,000</div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-[10px] text-gray-600">Toplam Borç</span>
              </div>
              <div className="text-base text-red-600">65,000</div>
            </div>
          </div>
        </div>

        {/* Hesap Planı Tablosu */}
        <div className="bg-white border border-gray-300 p-2">
          <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5 mb-2">
            <h3 className="text-[11px] text-gray-700">Hesap Planı</h3>
          </div>
          <ReportColumnTable
            data={accounts}
            columns={columns}
            height={320}
            storageNamespace="accounting-module-chart"
          />
        </div>
      </div>
    </div>
  );
}
