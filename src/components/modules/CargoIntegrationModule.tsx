import React, { useState } from 'react';
import {
  Package, Truck, MapPin, Clock, CheckCircle, XCircle, AlertCircle,
  Search, Filter, Plus, Edit2, Trash2, Eye, Download, Upload,
  BarChart3, Settings, RefreshCw, FileText, Calendar, Banknote,
  TrendingUp, ArrowRight, Copy, Printer, Send, Users, Box,
  Navigation, Phone, Mail, Building, CreditCard, Percent,
  Star, ThumbsUp, Activity, Zap, Globe, ChevronDown, X
} from 'lucide-react';

interface CargoCompany {
  id: string;
  name: string;
  code: 'aras' | 'yurtici' | 'mng' | 'ptt';
  logo: string;
  color: string;
  isActive: boolean;
  apiCredentials: {
    username: string;
    password: string;
    customerId: string;
  };
  stats: {
    totalShipments: number;
    pendingShipments: number;
    deliveredToday: number;
    avgDeliveryTime: number;
  };
  pricing: {
    basePrice: number;
    pricePerKg: number;
    pricePerDesi: number;
  };
}

interface Shipment {
  id: string;
  trackingNumber: string;
  cargoCompany: 'aras' | 'yurtici' | 'mng' | 'ptt';
  customer: {
    name: string;
    phone: string;
    address: string;
    city: string;
    district: string;
  };
  package: {
    weight: number;
    desi: number;
    pieceCount: number;
    content: string;
    value: number;
  };
  status: 'pending' | 'collected' | 'in-transit' | 'in-distribution' | 'delivered' | 'returned' | 'cancelled';
  createdAt: string;
  estimatedDelivery: string;
  cost: number;
  paymentType: 'sender' | 'receiver';
}

interface ShipmentTracking {
  trackingNumber: string;
  status: string;
  lastLocation: string;
  estimatedDelivery: string;
  history: {
    date: string;
    status: string;
    location: string;
    description: string;
  }[];
}

type ViewMode = 'dashboard' | 'shipments' | 'create' | 'bulk-create' | 'tracking' | 'pricing' | 'reports' | 'settings';

export function CargoIntegrationModule() {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingResult, setTrackingResult] = useState<ShipmentTracking | null>(null);
  const [newShipment, setNewShipment] = useState({
    cargoCompany: 'aras' as 'aras' | 'yurtici' | 'mng' | 'ptt',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerCity: '',
    customerDistrict: '',
    packageWeight: 0,
    packageDesi: 0,
    packagePieceCount: 1,
    packageContent: '',
    packageValue: 0,
    paymentType: 'sender' as 'sender' | 'receiver'
  });

  // Mock data - Cargo Companies
  const [cargoCompanies, setCargoCompanies] = useState<CargoCompany[]>([
    {
      id: '1',
      name: 'Iraq Express Cargo',
      code: 'aras',
      logo: 'ğŸ”´',
      color: 'red',
      isActive: true,
      apiCredentials: {
        username: 'API_USER_IRAQ',
        password: '••••••••',
        customerId: 'IEX123456'
      },
      stats: {
        totalShipments: 1247,
        pendingShipments: 23,
        deliveredToday: 45,
        avgDeliveryTime: 2.3
      },
      pricing: {
        basePrice: 15000,
        pricePerKg: 3500,
        pricePerDesi: 2800
      }
    },
    {
      id: '2',
      name: 'Baghdad Logistics',
      code: 'yurtici',
      logo: 'ğŸŸ¡',
      color: 'yellow',
      isActive: true,
      apiCredentials: {
        username: 'API_USER_BAGHDAD',
        password: '••••••••',
        customerId: 'BL987654'
      },
      stats: {
        totalShipments: 1089,
        pendingShipments: 18,
        deliveredToday: 38,
        avgDeliveryTime: 2.1
      },
      pricing: {
        basePrice: 14500,
        pricePerKg: 3200,
        pricePerDesi: 2600
      }
    },
    {
      id: '3',
      name: 'Mesopotamia Cargo',
      code: 'mng',
      logo: 'ğŸŸ¢',
      color: 'green',
      isActive: true,
      apiCredentials: {
        username: 'API_USER_MESO',
        password: '••••••••',
        customerId: 'MC456789'
      },
      stats: {
        totalShipments: 892,
        pendingShipments: 15,
        deliveredToday: 31,
        avgDeliveryTime: 2.5
      },
      pricing: {
        basePrice: 13900,
        pricePerKg: 3000,
        pricePerDesi: 2500
      }
    },
    {
      id: '4',
      name: 'Basra Shipping Co.',
      code: 'ptt',
      logo: 'ğŸ”µ',
      color: 'blue',
      isActive: true,
      apiCredentials: {
        username: 'API_USER_BASRA',
        password: '••••••••',
        customerId: 'BSC321654'
      },
      stats: {
        totalShipments: 756,
        pendingShipments: 12,
        deliveredToday: 27,
        avgDeliveryTime: 2.8
      },
      pricing: {
        basePrice: 12500,
        pricePerKg: 2800,
        pricePerDesi: 2300
      }
    }
  ]);

  // Mock data - Shipments
  const [shipments, setShipments] = useState<Shipment[]>([
    {
      id: '1',
      trackingNumber: 'IEX2024001234567',
      cargoCompany: 'aras',
      customer: {
        name: 'Ali Mohammed',
        phone: '+964 750 123 4567',
        address: 'Al-Mansour District, Street 14, Building 45',
        city: 'Baghdad',
        district: 'Al-Mansour'
      },
      package: {
        weight: 2.5,
        desi: 3.2,
        pieceCount: 1,
        content: 'Laptop Bag',
        value: 299900
      },
      status: 'in-transit',
      createdAt: '2024-12-10 09:30',
      estimatedDelivery: '2024-12-11',
      cost: 23500,
      paymentType: 'sender'
    },
    {
      id: '2',
      trackingNumber: 'BL2024009876543',
      cargoCompany: 'yurtici',
      customer: {
        name: 'Fatima Hassan',
        phone: '+964 770 987 6543',
        address: 'Al-Karada Street, House No:12',
        city: 'Baghdad',
        district: 'Al-Karada'
      },
      package: {
        weight: 1.2,
        desi: 2.0,
        pieceCount: 1,
        content: 'Wireless Mouse',
        value: 149900
      },
      status: 'delivered',
      createdAt: '2024-12-09 14:20',
      estimatedDelivery: '2024-12-10',
      cost: 18900,
      paymentType: 'sender'
    },
    {
      id: '3',
      trackingNumber: 'MC2024005555555',
      cargoCompany: 'mng',
      customer: {
        name: 'Ahmed Al-Maliki',
        phone: '+964 771 321 9876',
        address: 'Basra Port Road, Building 78',
        city: 'Basra',
        district: 'Al-Ashar'
      },
      package: {
        weight: 3.8,
        desi: 5.1,
        pieceCount: 2,
        content: 'Mechanical Keyboard + Mouse',
        value: 1049800
      },
      status: 'pending',
      createdAt: '2024-12-10 16:45',
      estimatedDelivery: '2024-12-12',
      cost: 31200,
      paymentType: 'receiver'
    },
    {
      id: '4',
      trackingNumber: 'BSC2024007777777',
      cargoCompany: 'ptt',
      customer: {
        name: 'Layla Ibrahim',
        phone: '+964 772 111 2222',
        address: 'Erbil City Center, Avenue 156',
        city: 'Erbil',
        district: 'Downtown'
      },
      package: {
        weight: 0.8,
        desi: 1.5,
        pieceCount: 1,
        content: 'USB Cable Set',
        value: 89900
      },
      status: 'in-distribution',
      createdAt: '2024-12-10 11:15',
      estimatedDelivery: '2024-12-10',
      cost: 15800,
      paymentType: 'sender'
    }
  ]);

  // Stats
  const stats = {
    totalShipments: shipments.length,
    pendingShipments: shipments.filter(s => s.status === 'pending' || s.status === 'collected').length,
    inTransit: shipments.filter(s => s.status === 'in-transit' || s.status === 'in-distribution').length,
    deliveredToday: shipments.filter(s => s.status === 'delivered' && s.estimatedDelivery === '2024-12-10').length,
    totalCost: shipments.reduce((sum, s) => sum + s.cost, 0),
    avgDeliveryTime: 2.4
  };

  const getStatusColor = (status: Shipment['status']) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-700';
      case 'collected': return 'bg-blue-100 text-blue-700';
      case 'in-transit': return 'bg-purple-100 text-purple-700';
      case 'in-distribution': return 'bg-orange-100 text-orange-700';
      case 'delivered': return 'bg-green-100 text-green-700';
      case 'returned': return 'bg-yellow-100 text-yellow-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: Shipment['status']) => {
    switch (status) {
      case 'pending': return 'Beklemede';
      case 'collected': return 'Toplandı';
      case 'in-transit': return 'Yolda';
      case 'in-distribution': return 'Dağıtımda';
      case 'delivered': return 'Teslim Edildi';
      case 'returned': return 'İade';
      case 'cancelled': return 'İptal';
      default: return status;
    }
  };

  const getCompanyColor = (code: string) => {
    const company = cargoCompanies.find(c => c.code === code);
    return company?.color || 'gray';
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Gönderi</p>
              <p className="text-2xl mt-2">{stats.totalShipments}</p>
              <p className="text-xs text-gray-500 mt-1">Son 30 gün</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Yoldaki Gönderi</p>
              <p className="text-2xl mt-2">{stats.inTransit}</p>
              <p className="text-xs text-orange-600 mt-1">{stats.pendingShipments} beklemede</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Bugün Teslim</p>
              <p className="text-2xl mt-2">{stats.deliveredToday}</p>
              <p className="text-xs text-green-600 mt-1">Teslimat başarılı</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Maliyet</p>
              <p className="text-2xl mt-2">{stats.totalCost.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Ort. teslimat: {stats.avgDeliveryTime} gün</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Banknote className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Cargo Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {cargoCompanies.map(company => (
          <div key={company.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{company.logo}</div>
                  <div>
                    <h3 className="text-sm">{company.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Müşteri No: {company.apiCredentials.customerId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    company.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {company.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                  <button className="p-2 hover:bg-gray-100 rounded">
                    <Settings className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-gray-500">Toplam Gönderi</p>
                  <p className="text-lg mt-1">{company.stats.totalShipments}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bekleyen</p>
                  <p className="text-lg mt-1 text-orange-600">{company.stats.pendingShipments}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Bugün Teslim</p>
                  <p className="text-lg mt-1 text-green-600">{company.stats.deliveredToday}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Ort. Teslimat</p>
                  <p className="text-lg mt-1">{company.stats.avgDeliveryTime} gün</p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Fiyatlandırma</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500">Taban</p>
                    <p className="mt-1">{company.pricing.basePrice.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500">KG</p>
                    <p className="mt-1">{company.pricing.pricePerKg.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-gray-500">Desi</p>
                    <p className="mt-1">{company.pricing.pricePerDesi.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
              <button 
                onClick={() => {
                  setSelectedCompany(company.id);
                  setViewMode('shipments');
                }}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Gönderileri Görüntüle
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Shipments */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm">Son Gönderiler</h3>
            <button 
              onClick={() => setViewMode('shipments')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Tümünü Gör →
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {shipments.slice(0, 5).map(shipment => (
            <div key={shipment.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-2xl">
                    {cargoCompanies.find(c => c.code === shipment.cargoCompany)?.logo}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{shipment.trackingNumber}</p>
                    <p className="text-xs text-gray-500 mt-1">{shipment.customer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{shipment.customer.city}</p>
                    <p className="text-xs text-gray-500 mt-1">{shipment.createdAt}</p>
                  </div>
                </div>
                <div className="ml-4 text-right">
                  <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(shipment.status)}`}>
                    {getStatusLabel(shipment.status)}
                  </span>
                  <p className="text-sm mt-1">{shipment.cost.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderShipments = () => (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Takip no, müşteri adı ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
            />
          </div>
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtrele
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setViewMode('bulk-create')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Toplu Gönderi
          </button>
          <button 
            onClick={() => setViewMode('create')}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Yeni Gönderi
          </button>
        </div>
      </div>

      {/* Shipments Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Kargo Firması</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Takip No</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Alıcı</th>
              <th className="px-6 py-3 text-left text-xs text-gray-600">Şehir</th>
              <th className="px-6 py-3 text-center text-xs text-gray-600">Durum</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">Maliyet</th>
              <th className="px-6 py-3 text-right text-xs text-gray-600">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shipments
              .filter(s => 
                searchQuery === '' || 
                s.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.customer.name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map(shipment => (
                <tr key={shipment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {cargoCompanies.find(c => c.code === shipment.cargoCompany)?.logo}
                      </span>
                      <span className="text-sm">
                        {cargoCompanies.find(c => c.code === shipment.cargoCompany)?.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm">{shipment.trackingNumber}</p>
                      <p className="text-xs text-gray-500 mt-1">{shipment.createdAt}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm">{shipment.customer.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{shipment.customer.phone}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {shipment.customer.city} / {shipment.customer.district}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(shipment.status)}`}>
                      {getStatusLabel(shipment.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">
                    {shipment.cost.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setTrackingNumber(shipment.trackingNumber);
                          setViewMode('tracking');
                        }}
                        className="p-1 text-purple-600 hover:bg-purple-50 rounded"
                      >
                        <MapPin className="w-4 h-4" />
                      </button>
                      <button className="p-1 text-gray-600 hover:bg-gray-100 rounded">
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderCreateShipment = () => (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg mb-6">Yeni Gönderi Oluştur</h3>
        
        <div className="space-y-6">
          {/* Cargo Company Selection */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">Kargo Firması Seçin *</label>
            <div className="grid grid-cols-4 gap-3">
              {cargoCompanies.map(company => (
                <button
                  key={company.id}
                  onClick={() => setNewShipment({ ...newShipment, cargoCompany: company.code })}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    newShipment.cargoCompany === company.code
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{company.logo}</div>
                  <p className="text-xs">{company.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{company.pricing.basePrice.toFixed(2)}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Customer Information */}
          <div>
            <h4 className="text-sm mb-3">Alıcı Bilgileri</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ad Soyad *</label>
                <input
                  type="text"
                  value={newShipment.customerName}
                  onChange={(e) => setNewShipment({ ...newShipment, customerName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Alıcı adı"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Telefon *</label>
                <input
                  type="tel"
                  value={newShipment.customerPhone}
                  onChange={(e) => setNewShipment({ ...newShipment, customerPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+964 750 XXX XXXX"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Şehir *</label>
                <select
                  value={newShipment.customerCity}
                  onChange={(e) => setNewShipment({ ...newShipment, customerCity: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seçiniz</option>
                  <option value="Baghdad">Baghdad</option>
                  <option value="Basra">Basra</option>
                  <option value="Erbil">Erbil</option>
                  <option value="Mosul">Mosul</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">İlçe *</label>
                <input
                  type="text"
                  value={newShipment.customerDistrict}
                  onChange={(e) => setNewShipment({ ...newShipment, customerDistrict: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="İlçe"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-700 mb-1">Adres *</label>
              <textarea
                value={newShipment.customerAddress}
                onChange={(e) => setNewShipment({ ...newShipment, customerAddress: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mahalle, sokak, bina no, daire..."
              />
            </div>
          </div>

          {/* Package Information */}
          <div>
            <h4 className="text-sm mb-3">Paket Bilgileri</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ağırlık (KG) *</label>
                <input
                  type="number"
                  step="0.1"
                  value={newShipment.packageWeight}
                  onChange={(e) => setNewShipment({ ...newShipment, packageWeight: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Desi *</label>
                <input
                  type="number"
                  step="0.1"
                  value={newShipment.packageDesi}
                  onChange={(e) => setNewShipment({ ...newShipment, packageDesi: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Adet *</label>
                <input
                  type="number"
                  value={newShipment.packagePieceCount}
                  onChange={(e) => setNewShipment({ ...newShipment, packagePieceCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">İçerik *</label>
                <input
                  type="text"
                  value={newShipment.packageContent}
                  onChange={(e) => setNewShipment({ ...newShipment, packageContent: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paket içeriği"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Değer</label>
                <input
                  type="number"
                  step="0.01"
                  value={newShipment.packageValue}
                  onChange={(e) => setNewShipment({ ...newShipment, packageValue: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Payment Type */}
          <div>
            <label className="block text-sm text-gray-700 mb-2">Ödeme Şekli</label>
            <div className="flex gap-4">
              <button
                onClick={() => setNewShipment({ ...newShipment, paymentType: 'sender' })}
                className={`flex-1 p-3 border-2 rounded-lg transition-all ${
                  newShipment.paymentType === 'sender'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm">Gönderici Ödemeli</p>
              </button>
              <button
                onClick={() => setNewShipment({ ...newShipment, paymentType: 'receiver' })}
                className={`flex-1 p-3 border-2 rounded-lg transition-all ${
                  newShipment.paymentType === 'receiver'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="text-sm">Alıcı Ödemeli</p>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => setViewMode('shipments')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              İptal
            </button>
            <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800">
              Gönderi Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTracking = () => (
    <div className="max-w-4xl mx-auto">
      {/* Tracking Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h3 className="text-sm mb-4">Kargo Takip</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Takip numarasını girin..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            onClick={() => {
              // Mock tracking result
              setTrackingResult({
                trackingNumber: trackingNumber,
                status: 'In Distribution',
                lastLocation: 'Al-Mansour Distribution Center',
                estimatedDelivery: 'Dec 10, 2024, 18:00',
                history: [
                  {
                    date: 'Dec 10, 2024 14:30',
                    status: 'Out for Delivery',
                    location: 'Al-Mansour Distribution Center',
                    description: 'Shipment out for delivery'
                  },
                  {
                    date: 'Dec 10, 2024 08:15',
                    status: 'At Transfer Center',
                    location: 'Baghdad Transfer Center',
                    description: 'Shipment processed at transfer center'
                  },
                  {
                    date: 'Dec 9, 2024 22:00',
                    status: 'In Transit',
                    location: 'Basra - Baghdad Route',
                    description: 'Shipment en route to Baghdad'
                  },
                  {
                    date: 'Dec 9, 2024 16:45',
                    status: 'Collected',
                    location: 'Basra Branch Office',
                    description: 'Shipment collected from branch'
                  }
                ]
              });
            }}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm hover:from-blue-700 hover:to-blue-800 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Sorgula
          </button>
        </div>
      </div>

      {/* Tracking Result */}
      {trackingResult && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Takip No</p>
                <p className="text-lg mt-1">{trackingResult.trackingNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Tahmini Teslimat</p>
                <p className="text-sm mt-1">{trackingResult.estimatedDelivery}</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <MapPin className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm">Mevcut Durum: <strong>{trackingResult.status}</strong></p>
                <p className="text-xs text-gray-500 mt-1">{trackingResult.lastLocation}</p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h4 className="text-sm mb-4">Gönderi Geçmişi</h4>
              <div className="space-y-4">
                {trackingResult.history.map((item, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        idx === 0 ? 'bg-green-500' : 'bg-blue-500'
                      }`} />
                      {idx < trackingResult.history.length - 1 && (
                        <div className="w-0.5 h-12 bg-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <p className="text-sm">{item.status}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.date} - {item.location}</p>
                      <p className="text-xs text-gray-600 mt-2">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (viewMode) {
      case 'dashboard':
        return renderDashboard();
      case 'shipments':
        return renderShipments();
      case 'create':
        return renderCreateShipment();
      case 'bulk-create':
        return <div className="text-center py-12 text-gray-500">Toplu Gönderi (Yakında)</div>;
      case 'tracking':
        return renderTracking();
      case 'pricing':
        return <div className="text-center py-12 text-gray-500">Fiyat Karşılaştırma (Yakında)</div>;
      case 'reports':
        return <div className="text-center py-12 text-gray-500">Kargo Raporları (Yakında)</div>;
      case 'settings':
        return <div className="text-center py-12 text-gray-500">Kargo Ayarları (Yakında)</div>;
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg text-gray-900">Kargo Entegrasyonu</h1>
            <p className="text-sm text-gray-500 mt-1">Aras, Yurtiçi, MNG ve PTT kargo yönetimi</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Rapor Al
            </button>
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Senkronize Et
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'shipments', label: 'Gönderiler', icon: Package, badge: stats.totalShipments },
            { id: 'tracking', label: 'Kargo Takip', icon: MapPin },
            { id: 'pricing', label: 'Fiyat Karşılaştır', icon: Banknote },
            { id: 'reports', label: 'Raporlar', icon: FileText },
            { id: 'settings', label: 'Ayarlar', icon: Settings }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={`px-4 py-3 text-sm flex items-center gap-2 border-b-2 transition-colors relative ${
                  viewMode === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && (
                  <span className="ml-1 px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {renderContent()}
      </div>
    </div>
  );
}
