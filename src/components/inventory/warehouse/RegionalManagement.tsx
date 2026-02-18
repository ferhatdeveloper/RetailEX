// Regional & Franchise Management Module

import { useState } from 'react';
import { 
  Map,
  Building,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Award,
  AlertCircle,
  CheckCircle,
  Calendar,
  FileText,
  Phone,
  Mail,
  MapPin,
  Target,
  BarChart3,
  Settings,
  Download,
  Plus,
  Edit,
  Trash2,
  X
} from 'lucide-react';
import { useRegionStats } from '../../../hooks/useInfiniteStores';

export function RegionalManagement() {
  const [selectedView, setSelectedView] = useState<'regional' | 'franchise' | 'managers' | 'reports'>('regional');
  const { data: regionStats } = useRegionStats();

  const viewTabs = [
    { id: 'regional' as const, label: 'Bölgesel Yönetim', icon: Map },
    { id: 'franchise' as const, label: 'Franchise Yönetimi', icon: Building },
    { id: 'managers' as const, label: 'Bölge Müdürleri', icon: Users },
    { id: 'reports' as const, label: 'Raporlar', icon: BarChart3 },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl text-gray-900 flex items-center gap-2">
                <Map className="h-6 w-6 text-blue-600" />
                Bölgesel & Franchise Yönetimi
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Bölge, franchise ve müdür yönetimi
              </p>
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

          {/* View Tabs */}
          <div className="flex gap-2">
            {viewTabs.map(tab => {
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

      {/* Content Area - SCROLLABLE */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          {selectedView === 'regional' && <RegionalView regionStats={regionStats} />}
          {selectedView === 'franchise' && <FranchiseView />}
          {selectedView === 'managers' && <ManagersView />}
          {selectedView === 'reports' && <ReportsView />}
        </div>
      </div>
    </div>
  );
}

// Regional View
function RegionalView({ regionStats }: any) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<any>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  const handleEditClick = (region: any) => {
    setSelectedRegion(region);
    setShowEditModal(true);
  };

  const handleReportClick = (region: any) => {
    setSelectedRegion(region);
    setShowReportModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Regional KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Bölge</span>
            <Map className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">8</div>
          <div className="text-sm text-green-600 flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3" />
            <span>Aktif</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Mağaza</span>
            <Building className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {regionStats?.reduce((sum: number, r: any) => sum + r.storeCount, 0) || 10000}
          </div>
          <div className="text-sm text-gray-600 mt-1">Tüm bölgelerde</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Ciro</span>
            <DollarSign className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {formatCurrency(regionStats?.reduce((sum: number, r: any) => sum + r.revenue, 0) || 0)}
          </div>
          <div className="text-sm text-green-600 flex items-center gap-1 mt-1">
            <TrendingUp className="h-3 w-3" />
            <span>+12.5%</span>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Mağaza Personeli</span>
            <Users className="h-5 w-5 text-orange-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">8</div>
          <div className="text-sm text-gray-600 mt-1">Her bölgede 1</div>
        </div>
      </div>

      {/* Regional Performance Table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Bölgesel Performans Detayları</h3>
        </div>
        <div className="overflow-auto max-h-[500px]">
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
              {regionStats?.map((region: any, index: number) => (
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
                    <div className="flex items-center justify-end gap-1">
                      {index % 2 === 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                      <span className={index % 2 === 0 ? 'text-green-600' : 'text-red-600'}>
                        {index % 2 === 0 ? '+' : '-'}{(Math.random() * 10).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm">
                      <div className="font-medium">Mohammed Al-Sadr</div>
                      <div className="text-gray-600">+964 750 123 45 67</div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1 hover:bg-blue-50 rounded text-blue-600" onClick={() => handleEditClick(region)}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="p-1 hover:bg-gray-100 rounded text-gray-600" onClick={() => handleReportClick(region)}>
                        <FileText className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedRegion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Bölge Bilgilerini Düzenle
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-white/80 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bölge Adı</label>
                <input
                  type="text"
                  defaultValue={selectedRegion.regionName}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mağaza Personeli</label>
                <input
                  type="text"
                  defaultValue="Mohammed Al-Sadr"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefon</label>
                <input
                  type="text"
                  defaultValue="+964 750 123 45 67"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Mağaza Sayısı:</span>
                  <span className="font-semibold">{selectedRegion.storeCount}</span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Toplam Ciro:</span>
                  <span className="font-semibold text-green-600">{formatCurrency(selectedRegion.revenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">İşlem Sayısı:</span>
                  <span className="font-semibold">{new Intl.NumberFormat('tr-TR').format(selectedRegion.transactions)}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex gap-2">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  // Burada kaydetme işlemi yapılacak
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
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
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
                  <div className="text-sm opacity-90 mb-1">Toplam Ciro</div>
                  <div className="text-2xl font-bold">{formatCurrency(selectedRegion.revenue)}</div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
                  <div className="text-sm opacity-90 mb-1">İşlem Sayısı</div>
                  <div className="text-2xl font-bold">{new Intl.NumberFormat('tr-TR').format(selectedRegion.transactions)}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
                  <div className="text-sm opacity-90 mb-1">Ort. Sepet</div>
                  <div className="text-2xl font-bold">{formatCurrency(selectedRegion.avgBasket)}</div>
                </div>
              </div>

              {/* Details */}
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
                    <span className="text-gray-600">Mağaza Personeli:</span>
                    <span className="font-medium">Mohammed Al-Sadr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">İletişim:</span>
                    <span className="font-medium">+964 750 123 45 67</span>
                  </div>
                </div>
              </div>

              {/* Performance Indicator */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Performans</h4>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <span className="text-sm text-green-600 font-medium">
                    Bu ayın büyümesi: +{(Math.random() * 15 + 5).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '87%' }}></div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex gap-2">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                Kapat
              </button>
              <button className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2">
                <Download className="h-4 w-4" />
                PDF İndir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Franchise View
function FranchiseView() {
  const franchises = [
    { id: 1, name: 'Franchise A', owner: 'Ali Veli', stores: 15, revenue: 2500000000, royalty: 5, status: 'Aktif', contract: '2023-01-15' },
    { id: 2, name: 'Franchise B', owner: 'Ayşe Fatma', stores: 8, revenue: 1200000000, royalty: 5, status: 'Aktif', contract: '2023-06-20' },
    { id: 3, name: 'Franchise C', owner: 'Mehmet Can', stores: 12, revenue: 1800000000, royalty: 5, status: 'Beklemede', contract: '2024-03-10' },
  ];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value) + ' IQD';
  };

  return (
    <div className="space-y-6">
      {/* Franchise KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Franchise Sayısı</span>
            <Building className="h-5 w-5 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">3</div>
          <div className="text-sm text-green-600 mt-1">+1 bu yıl</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Franchise Mağaza</span>
            <Building className="h-5 w-5 text-green-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">35</div>
          <div className="text-sm text-gray-600 mt-1">Toplam</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Toplam Royalty</span>
            <DollarSign className="h-5 w-5 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {formatCurrency(275000000)}
          </div>
          <div className="text-sm text-gray-600 mt-1">Bu yıl</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Ortalama Royalty</span>
            <Award className="h-5 w-5 text-orange-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900">%5</div>
          <div className="text-sm text-gray-600 mt-1">Ciro üzerinden</div>
        </div>
      </div>

      {/* Franchise List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-900">Franchise Listesi</h3>
        </div>
        <div className="overflow-auto max-h-96">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Franchise Adı</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Franchise Sahibi</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Mağaza Sayısı</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Toplam Ciro</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Royalty %</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Royalty Tutarı</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Sözleşme</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Durum</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {franchises.map(franchise => (
                <tr key={franchise.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{franchise.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm">
                      <div className="font-medium">{franchise.owner}</div>
                      <div className="text-gray-600">franchise@email.com</div>
                    </div>
                  </td>
                  <td className="text-right py-3 px-4">{franchise.stores}</td>
                  <td className="text-right py-3 px-4 font-semibold text-green-600">
                    {formatCurrency(franchise.revenue)}
                  </td>
                  <td className="text-right py-3 px-4">%{franchise.royalty}</td>
                  <td className="text-right py-3 px-4 font-semibold text-purple-600">
                    {formatCurrency(franchise.revenue * franchise.royalty / 100)}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">{franchise.contract}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      franchise.status === 'Aktif' ? 'bg-green-100 text-green-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {franchise.status}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1 hover:bg-blue-50 rounded text-blue-600">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="p-1 hover:bg-gray-100 rounded text-gray-600">
                        <FileText className="h-4 w-4" />
                      </button>
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

// Managers View
function ManagersView() {
  const managers = [
    { id: 1, name: 'Mohammed Al-Sadr', region: 'Baghdad Region', stores: 2500, phone: '+964 750 123 45 67', email: 'mohammed@retailos.com', experience: '8 years', performance: 95 },
    { id: 2, name: 'Fatima Hassan', region: 'Basra Region', stores: 2000, phone: '+964 750 234 56 78', email: 'fatima@retailos.com', experience: '6 years', performance: 92 },
    { id: 3, name: 'Ahmed Al-Maliki', region: 'Erbil Region', stores: 1800, phone: '+964 750 345 67 89', email: 'ahmed@retailos.com', experience: '5 years', performance: 88 },
  ];

  return (
    <div className="space-y-6">
      {/* Manager Cards */}
      <div className="grid grid-cols-3 gap-6">
        {managers.map(manager => (
          <div key={manager.id} className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-xl font-bold">
                  {manager.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">{manager.name}</h4>
                  <p className="text-sm text-gray-600">{manager.region}</p>
                </div>
              </div>
              <button className="p-1 hover:bg-gray-100 rounded">
                <Edit className="h-4 w-4 text-gray-600" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4" />
                <span>{manager.phone}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>{manager.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Building className="h-4 w-4" />
                <span>{manager.stores} mağaza</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>{manager.experience} deneyim</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Performans Skoru</span>
                <span className="text-sm font-semibold text-green-600">{manager.performance}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full"
                  style={{ width: `${manager.performance}%` }}
                ></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reports View
function ReportsView() {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
      <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
      <h3 className="text-xl font-semibold text-gray-900 mb-2">Bölgesel Raporlar</h3>
      <p className="text-gray-600 mb-4">
        Detaylı bölgesel ve franchise raporları yakında eklenecek
      </p>
      <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Rapor Şablonlarını Görüntüle
      </button>
    </div>
  );
}
