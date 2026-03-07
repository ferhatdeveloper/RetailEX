import { useState, useMemo } from 'react';
import { X, TrendingUp, TrendingDown, Plus, Minus, Wallet, FileText, ArrowRightLeft } from 'lucide-react';
import { Kasa, KasaIslemi } from '../../../services/api/kasa';
import { formatCurrency } from '../../../utils/formatNumber';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { useLanguage } from '../../../contexts/LanguageContext';

interface KasaIslemleriModalProps {
  kasa: Kasa;
  islemler: KasaIslemi[];
  loading: boolean;
  onClose: () => void;
  onIslemClick?: (islem: KasaIslemi) => void;
}

export function KasaIslemleriModal({ kasa, islemler, loading, onClose, onIslemClick }: KasaIslemleriModalProps) {
  const { t, tm, language } = useLanguage();
  const [selectedTur, setSelectedTur] = useState<'CH_TAHSILAT' | 'CH_ODEME' | 'KASA_GIRIS' | 'KASA_CIKIS' | 'VIRMAN' | null>(null);

  const islemTurleri = useMemo(() => [
    {
      type: 'CH_TAHSILAT' as const,
      label: tm('collection'),
      icon: TrendingUp,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-800',
      activeBg: 'bg-green-100 border-green-500',
    },
    {
      type: 'CH_ODEME' as const,
      label: t.payment,
      icon: TrendingDown,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      textColor: 'text-red-800',
      activeBg: 'bg-red-100 border-red-500',
    },
    {
      type: 'KASA_GIRIS' as const,
      label: tm('cashEntry'),
      icon: Plus,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-800',
      activeBg: 'bg-blue-100 border-blue-500',
    },
    {
      type: 'KASA_CIKIS' as const,
      label: tm('cashExit'),
      icon: Minus,
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-800',
      activeBg: 'bg-orange-100 border-orange-500',
    },
    {
      type: 'VIRMAN' as const,
      label: 'Virman',
      icon: ArrowRightLeft,
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-800',
      activeBg: 'bg-purple-100 border-purple-500',
    },
  ], [tm, t]);

  const filteredIslemler = useMemo(() => {
    if (!selectedTur) return [];
    return islemler.filter(islem => islem.islem_tipi === selectedTur);
  }, [islemler, selectedTur]);

  const columnHelper = createColumnHelper<KasaIslemi>();
  const columns = [
    columnHelper.accessor('islem_tarihi', {
      header: tm('date').toUpperCase(),
      cell: info => info.getValue() ? new Date(info.getValue()).toLocaleDateString(language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR') : '-',
      size: 100,
    }),
    columnHelper.accessor('islem_no', {
      header: tm('transactionNo').toUpperCase(),
      size: 120,
    }),
    columnHelper.accessor('islem_aciklamasi', {
      header: (t.description + '/' + tm('title')).toUpperCase(),
      cell: info => {
        const val = info.getValue();
        const row = info.row.original;
        if (row.islem_tipi === 'VIRMAN' && row.target_register_name) {
          return `${val || ''} -> ${row.target_register_name}`;
        }
        return val || '-';
      },
      size: 150,
    }),
    columnHelper.accessor('tutar', {
      header: t.amount.toUpperCase(),
      cell: info => {
        const tutar = info.getValue();
        return formatCurrency(tutar) + ' ' + kasa.id_doviz_kodu;
      },
      size: 120,
    }),
    columnHelper.accessor('islem_no', {
      header: (tm('voucher') + '/' + tm('transactionNo')).toUpperCase(),
      size: 120,
    }),
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header - Flat Blue */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex items-center justify-between border-b dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6" />
            <div>
              <h3 className="text-lg font-semibold leading-none">{tm('cashManagement')}</h3>
              <p className="text-xs text-blue-100 mt-1 uppercase tracking-wider font-bold">
                {kasa.kasa_kodu} / {kasa.kasa_adi}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Split Pane */}
        <div className="flex-1 flex overflow-hidden min-h-0 bg-gray-50 dark:bg-gray-900">
          {/* Left Side - List */}
          <div className="flex-1 flex flex-col border-r dark:border-gray-700 min-h-0">
            <div className="p-4 border-b bg-white dark:bg-gray-800 flex items-center justify-between">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 uppercase text-sm tracking-wide">
                {selectedTur ? islemTurleri.find(t => t.type === selectedTur)?.label : tm('pleaseSelect').toUpperCase()}
              </h4>
              {selectedTur && (
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">
                  {filteredIslemler.length} {tm('recordsCounter').toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 min-h-0">
              {!selectedTur ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-medium">{tm('selectTypeToViewDetails')}</p>
                  </div>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <DevExDataGrid
                  data={filteredIslemler}
                  columns={columns}
                  enableSorting
                  enableFiltering
                  enablePagination
                  pageSize={20}
                />
              )}
            </div>
          </div>

          {/* Right Side - Categories */}
          <div className="w-80 flex flex-col bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
            <div className="p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
              <h4 className="font-bold text-gray-900 dark:text-gray-100 uppercase text-sm tracking-wide">{tm('transactionTypes').toUpperCase()}</h4>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {islemTurleri.map((islem) => {
                const Icon = islem.icon;
                const isActive = selectedTur === islem.type;
                const count = islemler.filter(i => i.islem_tipi === islem.type).length;

                return (
                  <button
                    key={islem.type}
                    onClick={() => setSelectedTur(islem.type)}
                    className={`w-full text-left p-4 border transition-all ${isActive
                      ? `${islem.activeBg} shadow-sm transform translate-x-1`
                      : `${islem.bgColor} dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-400`
                      } rounded flex items-start gap-4`}
                  >
                    <div className={`p-2 rounded ${isActive ? 'bg-white shadow-sm' : 'bg-white/50 dark:bg-gray-700'}`}>
                      <Icon className={`w-5 h-5 ${islem.textColor}`} />
                    </div>
                    <div className="flex-1">
                      <div className={`font-bold text-sm ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{islem.label}</div>
                      <div className="text-[10px] mt-1 uppercase font-black opacity-40">{count} {tm('transactionsFound').toUpperCase()}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}


