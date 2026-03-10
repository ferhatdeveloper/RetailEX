/**
 * ExRetailOS - Kasalar Modülü
 * 
 * Kasa yönetimi modülü:
 * - Kasa listesi (Kodu, Adı, Açıklama, Bakiye, İ.D. Bakiye)
 * - Kasa işlemleri (CH Tahsilat, CH Ödeme, direkt giriş/çıkış)
 * - Muhasebe entegrasyonu
 * 
 * @created 2025-01-02
 */

import { useState, useEffect, useRef } from 'react';
import {
  Wallet,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  RefreshCw,
  FileText,
  ArrowUpDown,
  MoreVertical,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Landmark,
  Calculator,
  FileSignature
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { toast } from 'sonner';
import { formatCurrency } from '../../../utils/formatNumber';
import {
  fetchKasalar,
  fetchKasaIslemleri,
  createKasa,
  updateKasa,
  deleteKasa,
  type Kasa,
  type KasaIslemi
} from '../../../services/api/kasa';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { KasaIslemModal } from './KasaIslemModal';
import { KasaIslemDetayModal } from './KasaIslemDetayModal';
import { KasaIslemTurleriModal } from './KasaIslemTurleriModal';
import { KasaIslemleriModal } from './KasaIslemleriModal';
import { ContextMenu } from '../../shared/ContextMenu';

// ===== COMPONENT =====

interface Props {
  initialKasaId?: string | null;
  onBack?: () => void;
}

export function KasalarModule({ initialKasaId, onBack }: Props) {
  const { t, tm } = useLanguage();
  const { selectedFirma, selectedDonem } = useFirmaDonem();

  // State
  const [kasalar, setKasalar] = useState<Kasa[]>([]);
  const [selectedKasa, setSelectedKasa] = useState<Kasa | null>(null);
  const [kasaIslemleri, setKasaIslemleri] = useState<KasaIslemi[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIslemModal, setShowIslemModal] = useState(false);
  const [islemModalType, setIslemModalType] = useState<'CH_TAHSILAT' | 'CH_ODEME' | 'KASA_GIRIS' | 'KASA_CIKIS' | 'BANKA_YATIRILAN' | 'BANKADAN_CEKILEN' | 'VIRMAN' | 'GIDER_PUSULASI' | 'VERILEN_SERBEST_MESLEK' | 'ALINAN_SERBEST_MESLEK' | 'MUSTAHSIL_MAKBUZU' | 'ACILIS_BORC' | 'ACILIS_ALACAK' | 'KUR_FARKI_BORC' | 'KUR_FARKI_ALACAK' | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'kasa' | 'islem';
    data: Kasa | KasaIslemi;
  } | null>(null);

  // ... (existing state)

  // Handler for Kasa Card (Create Operations)


  // Handler for Transaction Row (Edit/Delete)
  const handleRowContextMenu = (e: React.MouseEvent, islem: KasaIslemi) => {
    e.preventDefault();
    setSelectedId(islem.id || null);
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'islem', data: islem });
  };

  // ...

  // Update the Table Props to pass the new handler
  // In KasaIslemleriTable component call:
  // onRowContextMenu={(e, islem) => handleRowContextMenu(e, islem)}
  const [selectedIslem, setSelectedIslem] = useState<KasaIslemi | null>(null);
  const [showIslemDetayModal, setShowIslemDetayModal] = useState(false);
  const [showIslemTurleriModal, setShowIslemTurleriModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'in' | 'out'>('all');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(!initialKasaId);

  // Fetch kasalar
  useEffect(() => {
    if (selectedFirma) {
      loadKasalar();
    }
  }, [selectedFirma, selectedDonem]);

  // İşlemler otomatik yüklenmesin, sadece kullanıcı istediğinde yüklensin
  // useEffect(() => {
  //   if (selectedKasa) {
  //     loadKasaIslemleri(selectedKasa.id);
  //   }
  // }, [selectedKasa]);

  // Close context menu on outside click
  useEffect(() => {
    if (initialKasaId) {
      // Find the kasa in the list and select it
      const kasa = kasalar.find(k => k.id === initialKasaId);
      if (kasa) {
        setSelectedKasa(kasa);
        loadKasaIslemleri(kasa.id);
        setShowSidebar(false);
      }
    }
  }, [initialKasaId, kasalar.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadKasalar = async () => {
    if (!selectedFirma) return;

    setLoading(true);
    try {
      const data = await fetchKasalar({
        firm_nr: selectedFirma.firm_nr || (selectedFirma as any).firma_kodu,
        aktif: true,
      });
      setKasalar(data);
    } catch (error: any) {
      console.error('[Kasalar] Load error:', error);
      toast.error(tm('loadingError'));
      // Mock data fallback
      setKasalar([
        {
          id: '00000000-0000-0000-0000-000000000001',
          firma_id: selectedFirma.firm_nr || (selectedFirma as any).firma_kodu || '',
          kasa_kodu: 'ANA KASA (OFFLINE/MOCK)',
          kasa_adi: 'ANA KASA',
          aciklama: tm('dbConnectionFailed'),
          bakiye: 0,
          id_bakiye: 0,
          id_doviz_kodu: 'USD',
          aktif: true,
          olusturma_tarihi: new Date().toISOString(),
          guncelleme_tarihi: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadKasaIslemleri = async (kasaId: string) => {
    if (!selectedFirma) return;

    setLoading(true);
    try {
      const data = await fetchKasaIslemleri({
        firm_nr: selectedFirma.firm_nr || (selectedFirma as any).firma_kodu,
        kasa_id: kasaId,
      });
      setKasaIslemleri(data);
    } catch (error: any) {
      console.error('[Kasalar] İşlem load error:', error);
      toast.error(tm('loadingError'));
      setKasaIslemleri([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (kasa: Kasa) => {
    setSelectedKasa(kasa);
    // İşlemler otomatik yüklenmesin, sadece kasa seçilsin
  };

  const handleRowDoubleClick = (kasa: Kasa) => {
    setSelectedKasa(kasa);
    loadKasaIslemleri(kasa.id);
  };

  // Handler for Kasa Card (Create Operations)
  const handleContextMenu = (e: React.MouseEvent, kasa: Kasa) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'kasa', data: kasa });
  };

  const handleIslemClick = (type: 'CH_TAHSILAT' | 'CH_ODEME' | 'KASA_GIRIS' | 'KASA_CIKIS' | 'BANKA_YATIRILAN' | 'BANKADAN_CEKILEN' | 'VIRMAN' | 'GIDER_PUSULASI' | 'VERILEN_SERBEST_MESLEK' | 'ALINAN_SERBEST_MESLEK' | 'MUSTAHSIL_MAKBUZU' | 'ACILIS_BORC' | 'ACILIS_ALACAK' | 'KUR_FARKI_BORC' | 'KUR_FARKI_ALACAK') => {
    if (!selectedKasa) {
      toast.error(tm('selectSafeFirst'));
      return;
    }
    setIslemModalType(type);
    setShowIslemModal(true);
  };

  const filteredTransactions = kasaIslemleri.filter(m => {
    const matchesTab = activeTab === 'all' ||
      (activeTab === 'in' && (m.islem_tipi === 'CH_TAHSILAT' || m.islem_tipi === 'KASA_GIRIS' || m.islem_tipi === 'ACILIS')) ||
      (activeTab === 'out' && (m.islem_tipi === 'CH_ODEME' || m.islem_tipi === 'KASA_CIKIS' || m.islem_tipi === 'KAPANIS'));

    const matchesSearch = !searchQuery ||
      (m.islem_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.islem_aciklamasi || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.cari_hesap_unvani || '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesSearch;
  });

  // Filter kasalar
  const filteredKasalar = kasalar.filter(kasa => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      kasa.kasa_kodu.toLowerCase().includes(query) ||
      kasa.kasa_adi.toLowerCase().includes(query) ||
      (kasa.aciklama || '').toLowerCase().includes(query)
    );
  });

  // Render List View
  if (!selectedKasa) {
    return (
      <div className="h-full flex flex-col bg-[#f8f9fa]">
        {/* Header Section */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100 shadow-sm">
              <Wallet className="w-7 h-7 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{tm('safesCode')}</h1>
              <p className="text-sm text-gray-500">{tm('safesDescription')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                placeholder={tm('searchTitle')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64 h-10 bg-gray-50 border border-gray-200 focus:bg-white transition-all rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={loadKasalar}
              className="p-2 text-gray-400 hover:text-purple-600 transition-all"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Logo Style Toolbar */}
        <div className="bg-white border-b px-4 py-1.5 flex items-center justify-between shadow-sm sticky top-0 z-10">
          <div className="flex items-center gap-1">
            <button className="h-9 px-3 gap-2 text-gray-700 hover:bg-purple-50 hover:text-purple-600 transition-colors flex items-center text-sm font-medium rounded-md">
              <Plus className="w-4 h-4" /> {tm('add')}
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1" />
            <button className="h-9 px-3 gap-2 text-gray-700 hover:bg-gray-100 transition-colors flex items-center text-sm font-medium rounded-md" onClick={loadKasalar}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {tm('refreshData')}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-[#f8f9fa] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
              <p className="text-sm text-gray-500 font-medium">{tm('loadingData')}</p>
            </div>
          ) : filteredKasalar.length === 0 ? (
            <div className="col-span-full h-64 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                <Wallet className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-400 font-medium">{tm('noRecordFound')}</p>
            </div>
          ) : (
            filteredKasalar.map((kasa) => (
              <button
                key={kasa.id}
                onClick={() => {
                  setSelectedKasa(kasa);
                  loadKasaIslemleri(kasa.id);
                }}
                onContextMenu={(e) => handleContextMenu(e, kasa)}
                className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all text-left flex flex-col items-start gap-4 group"
              >
                <div className="w-full flex items-start justify-between">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${kasa.aktif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {kasa.aktif ? tm('active') : tm('passive')}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">{kasa.kasa_kodu}</h3>
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{kasa.kasa_adi}</p>
                </div>
                <div className="w-full pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{tm('crmBalance')}</span>
                    <p className="text-lg font-black text-gray-900 leading-none mt-1">
                      {formatCurrency(kasa.bakiye || 0)} <span className="text-xs font-normal text-gray-500">IQD</span>
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Render Full-Page Detail View
  return (
    <div className="h-full flex flex-col bg-[#f8f9fa]">
      {/* Header Section */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (onBack) onBack();
              setSelectedKasa(null);
            }}
            className="w-10 h-10 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 text-gray-600 transition-all"
          >
            <RefreshCw className="w-5 h-5 rotate-180" />
          </button>
          <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100 shadow-sm">
            <Wallet className="w-7 h-7 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              {selectedKasa.kasa_adi} - {tm('transactions')}
            </h1>
            <p className="text-sm text-gray-500">{selectedKasa.kasa_kodu} • {formatCurrency(selectedKasa.bakiye || 0)} IQD</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder={tm('searchTitle')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64 h-10 bg-gray-50 border border-gray-200 focus:bg-white transition-all rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Logo Style Toolbar */}
      <div className="bg-white border-b px-4 py-1.5 flex items-center justify-between shadow-sm sticky top-0 z-10 transition-all">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowIslemTurleriModal(true)}
            className="h-9 px-3 gap-2 text-gray-700 hover:bg-purple-50 hover:text-purple-600 transition-colors flex items-center text-sm font-medium rounded-md"
          >
            <Plus className="w-4 h-4" /> {tm('add')}
          </button>
          <button
            disabled={!selectedId}
            className="h-9 px-3 gap-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-40 flex items-center text-sm font-medium rounded-md"
          >
            <Edit className="w-4 h-4" /> {tm('edit')}
          </button>
          <button
            disabled={!selectedId}
            className="h-9 px-3 gap-2 text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors disabled:opacity-40 flex items-center text-sm font-medium rounded-md"
          >
            <Eye className="w-4 h-4" /> {tm('view')}
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button
            disabled={!selectedId}
            className="h-9 px-3 gap-2 text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 flex items-center text-sm font-medium rounded-md"
          >
            <Trash2 className="w-4 h-4" /> {tm('deleteAction')}
          </button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <button className="h-9 px-3 gap-2 text-gray-700 hover:bg-gray-100 transition-colors flex items-center text-sm font-medium rounded-md">
            <FileText className="w-4 h-4" /> {tm('print')}
          </button>
          <button
            onClick={() => loadKasaIslemleri(selectedKasa.id)}
            className="h-9 px-3 gap-2 text-gray-700 hover:bg-gray-100 transition-colors flex items-center text-sm font-medium rounded-md"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {tm('refreshData')}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button className="h-9 px-3 gap-2 text-gray-600 hover:bg-gray-100 transition-colors flex items-center text-sm font-medium rounded-md">
            <MoreVertical className="w-4 h-4" /> Filtrele
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border-b px-6 flex items-center justify-between">
        <div className="flex">
          {[
            { id: 'all', label: tm('all') },
            { id: 'in', label: tm('chCollection') },
            { id: 'out', label: tm('chPayment') }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3.5 text-sm font-semibold transition-all relative ${activeTab === tab.id
                ? 'text-purple-600 bg-purple-50/50'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />
              )}
            </button>
          ))}
        </div>
        <div className="text-xs font-medium text-gray-400 italic">
          {filteredTransactions.length} {tm('record')}
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <KasaIslemleriTable
              islemler={filteredTransactions}
              loading={loading}
              onRowDoubleClick={(islem) => {
                setSelectedIslem(islem);
                setShowIslemDetayModal(true);
              }}
              onRowContextMenu={(e, islem) => handleRowContextMenu(e, islem)}
              onSelectionChange={(id) => setSelectedId(id)}
              selectedId={selectedId}
            />
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="bg-white border-t px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 font-medium">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 uppercase tracking-tighter">{tm('status')}:</span>
            <span className="text-green-600 flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              {tm('systemActive')}
            </span>
          </div>
          <div className="w-px h-3 bg-gray-200" />
          <div>
            <span className="text-gray-400 mr-2 uppercase tracking-tighter">{tm('total')}:</span>
            <span className="text-gray-900">{filteredTransactions.length} {tm('record')}</span>
          </div>
        </div>
      </div>

      {/* Modals & Context Menus */}
      {showIslemModal && islemModalType && selectedKasa && (
        <KasaIslemModal
          kasa={selectedKasa}
          islemTipi={islemModalType}
          onClose={() => {
            setShowIslemModal(false);
            setIslemModalType(null);
          }}
          onSuccess={() => {
            loadKasaIslemleri(selectedKasa.id);
            loadKasalar();
            setShowIslemModal(false);
            setIslemModalType(null);
          }}
        />
      )}

      {showIslemDetayModal && selectedIslem && (
        <KasaIslemDetayModal
          islem={selectedIslem}
          onClose={() => {
            setShowIslemDetayModal(false);
            setSelectedIslem(null);
          }}
          onIslemClick={(islemType) => {
            console.log('Processed selected:', islemType);
          }}
        />
      )}

      {showIslemTurleriModal && selectedKasa && (
        <KasaIslemTurleriModal
          kasa={selectedKasa}
          onClose={() => setShowIslemTurleriModal(false)}
          onSelect={(type) => {
            setShowIslemTurleriModal(false);
            setIslemModalType(type);
            setShowIslemModal(true);
          }}
        />
      )}

      {/* Context Menu */}
      {/* Shared Context Menu Integration */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={contextMenu.type === 'kasa' ? [
            // Cari Hesap İşlemleri
            {
              id: 'ch_tahsilat',
              label: tm('chCollection'),
              icon: TrendingDown,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('CH_TAHSILAT');
                setShowIslemModal(true);
              }
            },
            {
              id: 'ch_odeme',
              label: tm('chPayment'),
              icon: TrendingUp,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('CH_ODEME');
                setShowIslemModal(true);
              }
            },
            { id: 'div1', label: '', icon: MoreVertical, onClick: () => { }, divider: true },

            // Banka İşlemleri
            {
              id: 'banka_yatirilan',
              label: tm('bankDeposit'),
              icon: TrendingUp,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('BANKA_YATIRILAN');
                setShowIslemModal(true);
              }
            },
            {
              id: 'bankadan_cekilen',
              label: tm('bankWithdrawal'),
              icon: TrendingDown,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('BANKADAN_CEKILEN');
                setShowIslemModal(true);
              }
            },
            { id: 'div2', label: '', icon: MoreVertical, onClick: () => { }, divider: true },

            // Kasa İşlemleri
            {
              id: 'virman',
              label: tm('bankTransfer'),
              icon: ArrowUpDown,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('VIRMAN');
                setShowIslemModal(true);
              }
            },
            {
              id: 'gider',
              label: tm('expenseVoucher'),
              icon: FileText,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('GIDER_PUSULASI');
                setShowIslemModal(true);
              }
            },
            {
              id: 'acilis_borc',
              label: tm('openingDebit'),
              icon: Plus,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('ACILIS_BORC');
                setShowIslemModal(true);
              }
            },
            {
              id: 'acilis_alacak',
              label: tm('openingCredit'),
              icon: Minus,
              onClick: () => {
                setSelectedKasa(contextMenu.data as Kasa);
                setIslemModalType('ACILIS_ALACAK');
                setShowIslemModal(true);
              }
            }
          ] : [
            // İşlem Detayları
            {
              id: 'detay',
              label: tm('viewDetails'),
              icon: Eye,
              onClick: () => {
                setSelectedIslem(contextMenu.data as KasaIslemi);
                setShowIslemDetayModal(true);
              }
            },
            {
              id: 'duzenle',
              label: tm('edit'),
              icon: Edit,
              onClick: () => toast.info(tm('editComingSoon'))
            },
            {
              id: 'yazdir',
              label: tm('print'),
              icon: FileText,
              onClick: () => toast.info(tm('printComingSoon'))
            },
            { id: 'div_del', label: '', icon: MoreVertical, onClick: () => { }, divider: true },
            {
              id: 'sil',
              label: tm('deleteAction'),
              icon: Trash2,
              variant: 'danger',
              onClick: () => toast.info(tm('deleteComingSoon'))
            }
          ]}
        />
      )}
    </div>
  );
}

interface KasaIslemleriTableProps {
  islemler: KasaIslemi[];
  loading: boolean;
  onRowDoubleClick?: (islem: KasaIslemi) => void;
  onRowContextMenu?: (e: React.MouseEvent, islem: KasaIslemi) => void;
  onSelectionChange?: (id: string | null) => void;
  selectedId?: string | null;
}

function KasaIslemleriTable({
  islemler,
  loading,
  onRowDoubleClick,
  onRowContextMenu,
  onSelectionChange,
  selectedId
}: KasaIslemleriTableProps) {
  const { tm } = useLanguage();
  const columnHelper = createColumnHelper<KasaIslemi>();

  const columns = [
    columnHelper.accessor('islem_no', {
      header: tm('ficheNo'),
      cell: info => <span className="font-mono font-bold text-gray-700">{info.getValue() || '-'}</span>,
      size: 150,
    }),
    columnHelper.accessor('islem_tarihi', {
      header: tm('dateLabel'),
      cell: info => {
        const tarih = info.getValue();
        return tarih ? new Date(tarih).toLocaleDateString('tr-TR') : '-';
      },
      size: 120,
    }),
    columnHelper.accessor('islem_tipi', {
      id: 'tur',
      header: tm('type'),
      cell: info => {
        const tip = info.getValue();
        const labels: Record<string, string> = {
          'CH_TAHSILAT': tm('chCollection'),
          'CH_ODEME': tm('chPayment'),
          'KASA_GIRIS': tm('cashIn'),
          'KASA_CIKIS': tm('cashOut'),
          'ACILIS': tm('openingDebit'), // Assuming ACILIS maps to opening debit/credit general concept.
          'KAPANIS': tm('openingCredit'),
        };
        const isGiris = tip === 'CH_TAHSILAT' || tip === 'KASA_GIRIS' || tip === 'ACILIS';
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${isGiris
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
            }`}>
            {labels[tip] || tip}
          </span>
        );
      },
      size: 130,
    }),
    columnHelper.accessor('cari_hesap_unvani', {
      header: tm('currentAccountTitle'),
      cell: info => <span className="font-medium text-gray-900">{info.getValue() || '-'}</span>,
      size: 200,
    }),
    columnHelper.accessor('islem_aciklamasi', {
      header: tm('description'),
      cell: info => info.getValue() || '-',
      size: 250,
    }),
    columnHelper.accessor('tutar', {
      header: tm('amount'),
      cell: info => {
        const tutar = info.getValue() || 0;
        const tip = info.row.original.islem_tipi;
        const isGiris = tip === 'CH_TAHSILAT' || tip === 'KASA_GIRIS' || tip === 'ACILIS';
        return (
          <span className={`font-semibold ${isGiris ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(tutar)} {isGiris ? '(B)' : '(A)'}
          </span>
        );
      },
      size: 120,
    }),
    columnHelper.display({
      id: 'durum',
      header: tm('status'),
      cell: info => (
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
          <span className="text-gray-700 font-medium whitespace-nowrap">{tm('approved')}</span>
        </span>
      ),
      size: 100,
    }),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <DevExDataGrid
      data={islemler as any}
      columns={columns as any}
      enableSorting
      enableFiltering
      enablePagination
      pageSize={20}
      onRowDoubleClick={onRowDoubleClick}
      onRowContextMenu={onRowContextMenu}
    />
  );
}
