/**
 * Cash Register Management Module - Kasa Yönetimi
 * Pixel-perfect restoration of the original design while adding real functionality
 */

import { useState, useEffect } from 'react';
import {
  Wallet, DollarSign, TrendingUp, AlertTriangle, Clock,
  CheckCircle, Plus, RefreshCw, Search
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import { fetchKasalar, fetchKasaIslemleri, type Kasa, type KasaIslemi } from '../../../services/api/kasa';
import { KasaDefinitionModal } from './KasaDefinitionModal';
import { KasaIslemleriModal } from './KasaIslemleriModal';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';

interface Props {
  onEnterKasa?: (id: string) => void;
  initialTab?: 'sessions' | 'transactions';
}

export function CashRegisterManagement({ onEnterKasa, initialTab = 'sessions' }: Props) {
  const { t, tm, language } = useLanguage();
  const { selectedFirm, selectedPeriod } = useFirmaDonem();
  const [activeTab, setActiveTab] = useState<'sessions' | 'transactions'>(initialTab);
  const [kasalar, setKasalar] = useState<Kasa[]>([]);
  const [transactions, setTransactions] = useState<KasaIslemi[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, kasa: Kasa } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedKasa, setSelectedKasa] = useState<Kasa | null>(null);
  const [selectedKasaIslemleri, setSelectedKasaIslemleri] = useState<KasaIslemi[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadData = async () => {
    // If firm not selected, don't even try - prevents noise
    if (!selectedFirm) return;

    setLoading(true);
    try {
      console.log(`[CashManagement] Loading data for Firm: ${selectedFirm.firm_nr}, Period: ${selectedPeriod?.nr}`);
      const kData = await fetchKasalar();
      setKasalar(kData);

      const tData = await fetchKasaIslemleri();
      setTransactions(tData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error(t.error || 'Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFirm, selectedPeriod]);

  const handleRowDoubleClick = async (kasa: Kasa) => {
    setSelectedKasa(kasa);
    setShowDetailModal(true);
    setLoadingDetail(true);
    try {
      const data = await fetchKasaIslemleri({ kasa_id: kasa.id });
      setSelectedKasaIslemleri(data);
    } catch (error) {
      toast.error(tm('errorLoadingOperations') || 'Kasa işlemleri yüklenemedi');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRowContextMenu = (e: React.MouseEvent, rows: any) => {
    e.preventDefault();
    if (rows && rows.length > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY, kasa: rows[0] });
    }
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const kasaColumnHelper = createColumnHelper<Kasa>();
  const kasaColumns = [
    kasaColumnHelper.accessor('aktif', {
      header: tm('status').toUpperCase(),
      cell: info => (
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${info.getValue()
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-700'
          }`}>
          {info.getValue() ? tm('open').toUpperCase() : tm('closed').toUpperCase()}
        </span>
      ),
      size: 90
    }),
    kasaColumnHelper.accessor('kasa_kodu', {
      header: t.store.toUpperCase(),
      cell: info => info.getValue(),
      size: 150
    }),
    kasaColumnHelper.accessor('kasa_adi', {
      header: t.cashier.toUpperCase(),
      size: 130
    }),
    kasaColumnHelper.accessor('bakiye', {
      header: tm('expected').toUpperCase(),
      cell: info => (
        <span className="font-semibold">
          {formatCurrency(info.getValue())} {info.row.original.id_doviz_kodu}
        </span>
      ),
      size: 120
    }),
    kasaColumnHelper.display({
      id: 'actual',
      header: tm('actual').toUpperCase(),
      cell: info => <span className="text-gray-600 font-semibold">{formatCurrency(info.row.original.bakiye)}</span>,
      size: 120
    }),
    kasaColumnHelper.display({
      id: 'diff',
      header: tm('difference').toUpperCase(),
      cell: info => <span className="text-green-600 font-semibold">0</span>,
      size: 120
    }),
    kasaColumnHelper.accessor('olusturma_tarihi', {
      header: tm('openingTime').toUpperCase(),
      cell: info => new Date(info.getValue()).toLocaleString(language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR'),
      size: 140
    }),
  ];

  const txColumnHelper = createColumnHelper<KasaIslemi>();
  const txColumns = [
    txColumnHelper.accessor('islem_tarihi', {
      header: tm('date').toUpperCase(),
      cell: info => new Date(info.getValue()).toLocaleString(language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR'),
      size: 150
    }),
    txColumnHelper.accessor('islem_no', {
      header: tm('transactionNo').toUpperCase(),
      size: 120
    }),
    txColumnHelper.accessor('islem_tipi', {
      header: tm('type').toUpperCase(),
      size: 130
    }),
    txColumnHelper.accessor('tutar', {
      header: t.amount.toUpperCase(),
      cell: info => (
        <span className="font-semibold text-blue-600">
          {formatCurrency(info.getValue())}
        </span>
      ),
      size: 130
    }),
    txColumnHelper.accessor('islem_aciklamasi', {
      header: t.description.toUpperCase(),
      size: 250
    })
  ];

  const stats = {
    openCount: kasalar.filter(k => k.aktif).length,
    newToday: kasalar.filter(k => new Date(k.olusturma_tarihi).toDateString() === new Date().toDateString()).length,
    totalSalesToday: transactions
      .filter(t => new Date(t.islem_tarihi).toDateString() === new Date().toDateString() && (t.islem_tipi === 'KASA_GIRIS' || t.islem_tipi === 'CH_TAHSILAT'))
      .reduce((sum, t) => sum + t.tutar, 0),
    totalDiff: kasalar.reduce((sum, k) => sum + (k.bakiye < 0 ? Math.abs(k.bakiye) : 0), 0)
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-8 h-8 text-blue-600" />
            {tm('cashManagement')}
          </h1>
          <p className="text-gray-600 mt-1">
            {tm('cashManagementDesc')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            {tm('newCashRegister')}
          </button>
          <button
            onClick={loadData}
            className="p-2 text-gray-400 hover:text-blue-600 transition-all"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 mb-1 font-semibold">{tm('openCashRegisters')}</p>
              <p className="text-2xl font-bold text-green-900">{stats.openCount}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 mb-1 font-semibold">{tm('openedToday')}</p>
              <p className="text-2xl font-bold text-blue-900">{stats.newToday}</p>
            </div>
            <Clock className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 mb-1 font-semibold">{tm('totalSalesToday')}</p>
              <p className="text-xl font-bold text-purple-900">
                {formatCurrency(stats.totalSalesToday)} {tm('currencyCode')}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 mb-1 font-semibold">{tm('totalDifference')}</p>
              <p className="text-xl font-bold text-red-900">
                {formatCurrency(stats.totalDiff)} {tm('currencyCode')}
              </p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${activeTab === 'sessions'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {tm('cashSessions')}
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${activeTab === 'transactions'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {tm('transactionHistory')}
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {activeTab === 'sessions' && (
          <DevExDataGrid
            data={kasalar}
            columns={kasaColumns}
            enableFiltering
            enableSorting
            enablePagination
            pageSize={20}
            onRowDoubleClick={handleRowDoubleClick}
            onRowContextMenu={handleRowContextMenu}
          />
        )}

        {activeTab === 'transactions' && (
          <DevExDataGrid
            data={transactions}
            columns={txColumns}
            enableFiltering
            enableSorting
            enablePagination
            pageSize={20}
          />
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <KasaDefinitionModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadData();
          }}
        />
      )}

      {showDetailModal && selectedKasa && (
        <KasaIslemleriModal
          kasa={selectedKasa}
          islemler={selectedKasaIslemleri}
          loading={loadingDetail}
          onClose={() => setShowDetailModal(false)}
          onIslemClick={async () => {
            loadData();
          }}
        />
      )}
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleRowDoubleClick(contextMenu.kasa)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          >
            İncele
          </button>
          <button
            onClick={() => onEnterKasa?.(contextMenu.kasa.id)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 text-blue-600 font-semibold flex items-center gap-2 border-t"
          >
            İçine Gir
          </button>
        </div>
      )}
    </div>
  );
}
