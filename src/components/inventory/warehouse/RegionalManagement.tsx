// Regional & Franchise Management Module

import { useMemo, useState } from 'react';
import {
  Map,
  Building,
  Users,
  Banknote,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  Phone,
  MapPin,
  BarChart3,
  Download,
  Plus,
  Edit,
  X,
  Loader2,
} from 'lucide-react';
import { useRegionStats } from '../../../hooks/useInfiniteStores';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import type { RegionStats } from '../../../services/storeApiService';

function useFirmCurrency() {
  const { selectedFirm } = useFirmaDonem();
  return getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency());
}

function formatGrowth(g: number | null | undefined): string {
  if (g == null || !Number.isFinite(g)) return '—';
  const sign = g > 0 ? '+' : '';
  return `${sign}${g.toFixed(1)}%`;
}

export function RegionalManagement() {
  const [selectedView, setSelectedView] = useState<'regional' | 'franchise' | 'managers' | 'reports'>('regional');
  const { data: regionStats, isLoading } = useRegionStats();
  const currency = useFirmCurrency();
  const formatCurrency = (value: number) => formatLedgerAmount(value, currency);

  const viewTabs = [
    { id: 'regional' as const, label: 'Bölgesel Yönetim', icon: Map },
    { id: 'franchise' as const, label: 'Franchise Yönetimi', icon: Building },
    { id: 'managers' as const, label: 'Bölge Müdürleri', icon: Users },
    { id: 'reports' as const, label: 'Raporlar', icon: BarChart3 },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl text-gray-900 flex items-center gap-2">
                <Map className="h-6 w-6 text-blue-600" />
                Bölgesel & Franchise Yönetimi
              </h1>
              <p className="text-sm text-gray-600 mt-1">Bölge, franchise ve müdür yönetimi</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>Rapor Al</span>
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Yeni Ekle</span>
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            {viewTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedView(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    selectedView === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Bölge verileri yükleniyor…
            </div>
          )}
          {selectedView === 'regional' && (
            <RegionalView regionStats={regionStats} formatCurrency={formatCurrency} />
          )}
          {selectedView === 'franchise' && <FranchiseView formatCurrency={formatCurrency} />}
          {selectedView === 'managers' && <ManagersView regionStats={regionStats} />}
          {selectedView === 'reports' && <ReportsView />}
        </div>
      </div>
    </div>
  );
}

function RegionalView({
  regionStats,
  formatCurrency,
}: {
  regionStats?: RegionStats[];
  formatCurrency: (n: number) => string;
}) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<RegionStats | null>(null);

  const totals = useMemo(() => {
    const list = regionStats || [];
    return {
      regions: list.length,
      stores: list.reduce((s, r) => s + r.storeCount, 0),
      revenue: list.reduce((s, r) => s + r.revenue, 0),
      staff: list.reduce((s, r) => s + r.staffCount, 0),
      avgGrowth: (() => {
        const withG = list.filter((r) => r.growth != null);
        if (!withG.length) return null;
        return withG.reduce((s, r) => s + (r.growth || 0), 0) / withG.length;
      })(),
    };
  }, [regionStats]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Bölge</span>
            <Map className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totals.regions}</div>
          <div className="text-sm text-gray-600 mt-1">stores.region</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Mağaza</span>
            <Building className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totals.stores}</div>
          <div className="text-sm text-gray-600 mt-1">Tüm bölgelerde</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Ciro</span>
            <Banknote className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{formatCurrency(totals.revenue)}</div>
          <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
            {totals.avgGrowth == null ? (
              <span>Son 30 gün</span>
            ) : (
              <>
                {totals.avgGrowth >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-600" />
                )}
                <span className={totals.avgGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatGrowth(totals.avgGrowth)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Mağaza Personeli</span>
            <Users className="h-5 w-5 text-orange-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{totals.staff}</div>
          <div className="text-sm text-gray-600 mt-1">Aktif kullanıcı</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Bölgesel Performans Detayları</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
          {!regionStats?.length ? (
            <p className="text-sm text-gray-500 text-center py-10">Bölge / mağaza kaydı yok.</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Bölge</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Mağaza</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Ciro</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">İşlemler</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Ort. Sepet</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Büyüme</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Bölge Müdürü</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {regionStats.map((region) => {
                  const g = region.growth;
                  return (
                    <tr key={region.regionId} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">{region.regionName}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4">{region.storeCount}</td>
                      <td className="text-right py-3 px-4 font-semibold text-green-600">
                        {formatCurrency(region.revenue)}
                      </td>
                      <td className="text-right py-3 px-4">
                        {new Intl.NumberFormat('tr-TR').format(region.transactions)}
                      </td>
                      <td className="text-right py-3 px-4">{formatCurrency(region.avgBasket)}</td>
                      <td className="text-right py-3 px-4">
                        {g == null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            {g >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className={g >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatGrowth(g)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          <div className="font-medium">{region.managerName || '—'}</div>
                          <div className="text-gray-600">{region.managerPhone || ''}</div>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="p-1 hover:bg-blue-50 rounded text-blue-600"
                            onClick={() => {
                              setSelectedRegion(region);
                              setShowEditModal(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="p-1 hover:bg-gray-100 rounded text-gray-600"
                            onClick={() => {
                              setSelectedRegion(region);
                              setShowReportModal(true);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showEditModal && selectedRegion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Bölge Bilgileri
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-white/80 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Bölge:</span>
                  <span className="font-semibold">{selectedRegion.regionName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Mağaza Sayısı:</span>
                  <span className="font-semibold">{selectedRegion.storeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Toplam Ciro:</span>
                  <span className="font-semibold text-green-600">{formatCurrency(selectedRegion.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Müdür:</span>
                  <span className="font-semibold">{selectedRegion.managerName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Telefon:</span>
                  <span className="font-semibold">{selectedRegion.managerPhone || '—'}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Bölge adı ve müdür bilgisi mağaza kartlarından (`stores.region`, `manager_name`) gelir.
              </p>
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowEditModal(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && selectedRegion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-purple-600 to-purple-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Bölge Raporu - {selectedRegion.regionName}
              </h3>
              <button onClick={() => setShowReportModal(false)} className="text-white/80 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-auto">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
                  <div className="text-sm opacity-90 mb-1">Toplam Ciro</div>
                  <div className="text-2xl font-bold">{formatCurrency(selectedRegion.revenue)}</div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
                  <div className="text-sm opacity-90 mb-1">İşlem Sayısı</div>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat('tr-TR').format(selectedRegion.transactions)}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
                  <div className="text-sm opacity-90 mb-1">Ort. Sepet</div>
                  <div className="text-2xl font-bold">{formatCurrency(selectedRegion.avgBasket)}</div>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Detaylar</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bölge:</span>
                    <span className="font-medium">{selectedRegion.regionName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mağaza Sayısı:</span>
                    <span className="font-medium">{selectedRegion.storeCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Personel:</span>
                    <span className="font-medium">{selectedRegion.staffCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Müdür:</span>
                    <span className="font-medium">{selectedRegion.managerName || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">İletişim:</span>
                    <span className="font-medium">{selectedRegion.managerPhone || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Performans (önceki 30 güne göre)</h4>
                {selectedRegion.growth == null ? (
                  <span className="text-sm text-gray-500">Karşılaştırma verisi yok</span>
                ) : (
                  <div className="flex items-center gap-2">
                    {selectedRegion.growth >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-600" />
                    )}
                    <span
                      className={`text-sm font-medium ${
                        selectedRegion.growth >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      Büyüme: {formatGrowth(selectedRegion.growth)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowReportModal(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Franchise kaydı şeması yok — boş durum; demo liste yok */
function FranchiseView({ formatCurrency }: { formatCurrency: (n: number) => string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Franchise Sayısı</span>
            <Building className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">0</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Franchise Mağaza</span>
            <Building className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">0</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Royalty</span>
            <Banknote className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{formatCurrency(0)}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Ortalama Royalty</span>
            <Banknote className="h-5 w-5 text-orange-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">—</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-10 text-center">
        <Building className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900 mb-1">Franchise kaydı yok</h3>
        <p className="text-sm text-gray-500">
          Franchise tablosu henüz tanımlı değil. Demo veri gösterilmiyor.
        </p>
      </div>
    </div>
  );
}

function ManagersView({ regionStats }: { regionStats?: RegionStats[] }) {
  const managers = useMemo(() => {
    return (regionStats || [])
      .filter((r) => r.managerName)
      .map((r) => ({
        id: r.regionId,
        name: r.managerName,
        region: r.regionName,
        stores: r.storeCount,
        phone: r.managerPhone,
        staff: r.staffCount,
        revenue: r.revenue,
        growth: r.growth,
      }));
  }, [regionStats]);

  if (!managers.length) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-10 text-center">
        <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900 mb-1">Bölge müdürü yok</h3>
        <p className="text-sm text-gray-500">
          Mağaza kartlarında `manager_name` dolu kayıt bulunamadı.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {managers.map((manager) => (
          <div key={manager.id} className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-xl font-bold">
                  {manager.name
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('')
                    .toLocaleUpperCase('tr-TR')}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{manager.name}</h4>
                  <p className="text-sm text-gray-600">{manager.region}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {manager.phone ? (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4" />
                  <span>{manager.phone}</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building className="h-4 w-4" />
                <span>{manager.stores} mağaza</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users className="h-4 w-4" />
                <span>{manager.staff} personel</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>Büyüme: {formatGrowth(manager.growth)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsView() {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
      <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Bölgesel Raporlar</h3>
      <p className="text-gray-600 mb-4">
        Detaylı bölgesel raporlar için Mağaza Paneli ve Çoklu Mağaza analitiğini kullanın.
      </p>
    </div>
  );
}
