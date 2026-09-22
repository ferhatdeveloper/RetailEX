/**
 * Cash Register Management Module - Kasa Yönetimi
 * Pixel-perfect restoration of the original design while adding real functionality
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Banknote,
  Plus, RefreshCw, Trash2, Pencil, X
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatCurrency } from '../../../utils/formatNumber';
import {
  fetchKasalar,
  fetchKasaIslemleri,
  deleteKasaIslemi,
  cloneKasa,
  formatKasaCariLabel,
  computeKasaIslemiSign,
  parseKasaAmount,
  type Kasa,
  type KasaIslemi,
} from '../../../services/api/kasa';
import { KasaDefinitionModal } from './KasaDefinitionModal';
import { KasaIslemleriModal } from './KasaIslemleriModal';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { getAppDefaultCurrency } from '../../../services/postgres';
import { getPosNow, toLocalDateInputValue } from '../../../store/usePosDateOverrideStore';

type KpiDetailKind = 'collection' | 'payment' | 'balance';

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
  const [editingKasa, setEditingKasa] = useState<Kasa | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedKasa, setSelectedKasa] = useState<Kasa | null>(null);
  const [selectedKasaIslemleri, setSelectedKasaIslemleri] = useState<KasaIslemi[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [kpiDetail, setKpiDetail] = useState<KpiDetailKind | null>(null);
  const amountCurrency = getAppDefaultCurrency() || 'IQD';

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

  const handleDeleteTransaction = async (tx: KasaIslemi) => {
    const id = tx.id;
    if (!id) {
      toast.error(tm('transactionDeleteNoId') || 'Bu satırda silinecek kayıt kimliği yok.');
      return;
    }
    const ok = window.confirm(
      `${tm('deleteTransactionConfirm')}\n\n${tx.islem_no || ''} — ${tx.islem_tipi || ''} — ${formatCurrency(tx.tutar)}`
    );
    if (!ok) return;
    setDeletingTxId(id);
    try {
      await deleteKasaIslemi(id);
      toast.success(tm('transactionDeleted'));
      await loadData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || tm('error') || 'Silinemedi');
    } finally {
      setDeletingTxId(null);
    }
  };

  const handleCloneKasa = async (kasa: Kasa) => {
    setContextMenu(null);
    try {
      await cloneKasa(kasa);
      toast.success(tm('success') || 'Kasa kopyalandı');
      await loadData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

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
      header: (tm('cashRegisterCode') || 'Kasa kodu').toUpperCase(),
      cell: info => info.getValue(),
      size: 150
    }),
    kasaColumnHelper.accessor('kasa_adi', {
      header: (tm('cashRegisterName') || 'Kasa adı').toUpperCase(),
      size: 160
    }),
    kasaColumnHelper.accessor('bakiye', {
      header: (tm('balance') || 'Bakiye').toUpperCase(),
      cell: info => (
        <span className="font-semibold">
          {formatCurrency(info.getValue())} {info.row.original.id_doviz_kodu || amountCurrency}
        </span>
      ),
      size: 140
    }),
    kasaColumnHelper.accessor('olusturma_tarihi', {
      header: (tm('createdAt') || 'Oluşturma').toUpperCase(),
      cell: info => new Date(info.getValue()).toLocaleString(language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR'),
      size: 150
    }),
    kasaColumnHelper.display({
      id: 'kasa_actions',
      header: tm('actions').toUpperCase(),
      size: 88,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingKasa(row.original);
          }}
          className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50"
          title={tm('edit') || 'Düzenle'}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ),
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
    txColumnHelper.accessor((row) => formatKasaCariLabel(row), {
      id: 'cari_hesap',
      header: (tm('currentAccountTitle') || 'Cari').toUpperCase(),
      cell: (info) => {
        const row = info.row.original;
        const label = formatKasaCariLabel(row);
        if (!label) return <span className="text-gray-400">-</span>;
        return (
          <div className="min-w-0">
            <div className="font-medium text-gray-900 truncate">{row.cari_hesap_unvani || label}</div>
            {row.cari_hesap_kodu ? (
              <div className="text-[11px] text-gray-500 font-mono truncate">{row.cari_hesap_kodu}</div>
            ) : null}
          </div>
        );
      },
      size: 180,
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
    }),
    txColumnHelper.display({
      id: 'actions',
      header: tm('actions').toUpperCase(),
      size: 88,
      cell: ({ row }) => {
        const tx = row.original;
        const id = tx.id;
        const busy = id != null && deletingTxId === id;
        return (
          <button
            type="button"
            disabled={!id || busy}
            onClick={(e) => {
              e.stopPropagation();
              void handleDeleteTransaction(tx);
            }}
            className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            title={tm('delete')}
          >
            <Trash2 className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
          </button>
        );
      },
    }),
  ];

  /** POS tarih override varsa «bugün» onunla; kasa işareti create ile aynı (computeKasaIslemiSign). */
  const todayKey = useMemo(() => toLocalDateInputValue(getPosNow()), [transactions, kasalar]);

  const isTodayTxn = (t: KasaIslemi) => {
    const d = new Date(t.islem_tarihi);
    if (Number.isNaN(d.getTime())) return false;
    return toLocalDateInputValue(d) === todayKey;
  };

  const stats = useMemo(() => {
    const absAmt = (t: KasaIslemi) => Math.abs(parseKasaAmount(t.tutar));
    let todayCollection = 0;
    let todayPayment = 0;
    for (const t of transactions) {
      if (!isTodayTxn(t)) continue;
      const sign = computeKasaIslemiSign(t.islem_tipi);
      if (sign > 0) todayCollection += absAmt(t);
      else if (sign < 0) todayPayment += absAmt(t);
    }
    const balance = kasalar.reduce((sum, k) => sum + (Number(k.bakiye) || 0), 0);
    return { todayCollection, todayPayment, balance };
  }, [transactions, kasalar, todayKey]);

  const kpiDetailRows = useMemo(() => {
    if (kpiDetail === 'collection') {
      return transactions.filter(
        (t) => isTodayTxn(t) && computeKasaIslemiSign(t.islem_tipi) > 0
      );
    }
    if (kpiDetail === 'payment') {
      return transactions.filter(
        (t) => isTodayTxn(t) && computeKasaIslemiSign(t.islem_tipi) < 0
      );
    }
    return [];
  }, [kpiDetail, transactions, todayKey]);

  const kpiDetailTitle =
    kpiDetail === 'collection'
      ? tm('kpiDetailTodayCollection')
      : kpiDetail === 'payment'
        ? tm('kpiDetailTodayPayment')
        : tm('kpiDetailCashBalance');

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

      {/* KPI — her zaman yan yana; tıklanınca detay */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <button
          type="button"
          onClick={() => setKpiDetail('collection')}
          title={tm('kpiDetailClickHint')}
          className="bg-green-50 hover:bg-green-100/90 rounded-lg p-3 md:p-4 text-left transition-colors border border-transparent hover:border-green-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-green-600 mb-1 font-semibold truncate">
                {tm('todayCollection')}
              </p>
              <p className="text-base md:text-xl font-bold text-green-900 truncate">
                {formatCurrency(stats.todayCollection, amountCurrency)}
              </p>
            </div>
            <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-green-600 shrink-0" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => setKpiDetail('payment')}
          title={tm('kpiDetailClickHint')}
          className="bg-orange-50 hover:bg-orange-100/90 rounded-lg p-3 md:p-4 text-left transition-colors border border-transparent hover:border-orange-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-orange-600 mb-1 font-semibold truncate">
                {tm('todayPayment')}
              </p>
              <p className="text-base md:text-xl font-bold text-orange-900 truncate">
                {formatCurrency(stats.todayPayment, amountCurrency)}
              </p>
            </div>
            <TrendingDown className="w-6 h-6 md:w-8 md:h-8 text-orange-600 shrink-0" />
          </div>
        </button>
        <button
          type="button"
          onClick={() => setKpiDetail('balance')}
          title={tm('kpiDetailClickHint')}
          className="bg-blue-50 hover:bg-blue-100/90 rounded-lg p-3 md:p-4 text-left transition-colors border border-transparent hover:border-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-blue-600 mb-1 font-semibold truncate">
                {tm('cashBalance')}
              </p>
              <p
                className={`text-base md:text-xl font-bold truncate ${
                  stats.balance < 0 ? 'text-red-700' : 'text-blue-900'
                }`}
              >
                {formatCurrency(stats.balance, amountCurrency)}
              </p>
            </div>
            <Banknote className="w-6 h-6 md:w-8 md:h-8 text-blue-600 shrink-0" />
          </div>
        </button>
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

      {editingKasa && (
        <KasaDefinitionModal
          kasa={editingKasa}
          onClose={() => setEditingKasa(null)}
          onSuccess={() => {
            setEditingKasa(null);
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

      {kpiDetail && (
        <PercentBodyModal
          onClose={() => setKpiDetail(null)}
          size="list"
          ariaLabel={kpiDetailTitle}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-gray-200 bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-3 text-white">
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{kpiDetailTitle}</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {kpiDetail === 'balance'
                  ? formatCurrency(stats.balance, amountCurrency)
                  : kpiDetail === 'collection'
                    ? formatCurrency(stats.todayCollection, amountCurrency)
                    : formatCurrency(stats.todayPayment, amountCurrency)}
                {kpiDetail !== 'balance' ? ` · ${todayKey}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setKpiDetail(null)}
              className="rounded-lg p-2 hover:bg-white/10 shrink-0"
              aria-label={tm('close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <PercentBodyModalScrollBody className="p-4">
            {kpiDetail === 'balance' ? (
              kasalar.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">{tm('kpiDetailEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {kasalar.map((k) => {
                    const bal = Number(k.bakiye) || 0;
                    return (
                      <li
                        key={k.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{k.kasa_adi}</p>
                          <p className="text-xs text-gray-500 font-mono">{k.kasa_kodu}</p>
                        </div>
                        <p
                          className={`shrink-0 font-bold tabular-nums ${
                            bal < 0 ? 'text-red-600' : 'text-blue-800'
                          }`}
                        >
                          {formatCurrency(bal, k.id_doviz_kodu || amountCurrency)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : kpiDetailRows.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">{tm('kpiDetailEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {kpiDetailRows.map((tx) => {
                  const sign = computeKasaIslemiSign(tx.islem_tipi);
                  const amt = Math.abs(parseKasaAmount(tx.tutar));
                  return (
                    <li
                      key={tx.id || `${tx.islem_no}-${tx.islem_tarihi}`}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {tx.islem_tipi}
                          </p>
                          <p className="text-sm text-gray-800 mt-0.5 truncate">
                            {tx.aciklama || formatKasaCariLabel(tx) || '—'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {tx.islem_tarihi
                              ? new Date(tx.islem_tarihi).toLocaleString(
                                  language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-Arab' : 'tr-TR'
                                )
                              : '—'}
                            {tx.islem_no ? ` · ${tx.islem_no}` : ''}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 font-bold tabular-nums ${
                            sign < 0 ? 'text-orange-700' : 'text-green-700'
                          }`}
                        >
                          {sign < 0 ? '−' : '+'}
                          {formatCurrency(amt, amountCurrency)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </PercentBodyModalScrollBody>
          <div className="shrink-0 border-t border-gray-200 px-5 py-3 flex justify-end bg-gray-50">
            <button
              type="button"
              onClick={() => setKpiDetail(null)}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              {tm('close')}
            </button>
          </div>
        </PercentBodyModal>
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
            onClick={() => {
              setEditingKasa(contextMenu.kasa);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 border-t"
          >
            {tm('edit') || 'Düzenle'} (ad / kod)
          </button>
          <button
            onClick={() => void handleCloneKasa(contextMenu.kasa)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 border-t"
          >
            Klonla
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
