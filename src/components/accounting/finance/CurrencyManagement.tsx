/**
 * Currency Management Module - Para Birimi Yönetimi
 * 
 * Features:
 * - Para birimi listesi ve yönetimi
 * - Günlük kur girişi (merkez şubeden)
 * - Kur geçmişi görüntüleme
 * - Kur grafikleri
 * - Otomatik exchange hesaplama
 * - Ana para birimi ve raporlama para birimi seçimi
 */

import { useState, useEffect } from 'react';
import {
  DollarSign, Plus, Edit, TrendingUp, TrendingDown, Calendar,
  Globe, RefreshCw, Search, ChevronDown, ChevronUp, BarChart3
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBaseCurrency: boolean;
  isReportingCurrency: boolean;
  isActive: boolean;
  lastRate: number;
  lastUpdateDate: string;
  changePercent: number;
}

interface ExchangeRate {
  id: string;
  currencyCode: string;
  date: string;
  buyRate: number;
  sellRate: number;
  averageRate: number;
  enteredBy: string;
  enteredDate: string;
}

const columnHelper = createColumnHelper<Currency>();

const currencyColumns = [
  columnHelper.accessor('code', {
    header: 'Kod',
    cell: info => (
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-gray-400" />
        <span className="font-semibold">{info.getValue()}</span>
      </div>
    ),
  }),
  columnHelper.accessor('name', {
    header: 'Para Birimi',
    cell: info => info.getValue(),
  }),
  columnHelper.accessor('symbol', {
    header: 'Sembol',
    cell: info => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor('lastRate', {
    header: 'Son Kur',
    cell: info => (
      <span className="font-semibold text-blue-600">
        {info.getValue().toFixed(4)}
      </span>
    ),
  }),
  columnHelper.accessor('changePercent', {
    header: 'Değişim',
    cell: info => {
      const value = info.getValue();
      const isPositive = value >= 0;
      return (
        <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="font-semibold">{Math.abs(value).toFixed(2)}%</span>
        </div>
      );
    },
  }),
  columnHelper.accessor('lastUpdateDate', {
    header: 'Son Güncelleme',
    cell: info => (
      <div className="flex items-center gap-1 text-gray-600">
        <Calendar className="w-4 h-4" />
        <span>{new Date(info.getValue()).toLocaleDateString('tr-TR')}</span>
      </div>
    ),
  }),
  columnHelper.accessor('isBaseCurrency', {
    header: 'Ana Para Birimi',
    cell: info => info.getValue() ? (
      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
        ANA
      </span>
    ) : null,
  }),
  columnHelper.accessor('isReportingCurrency', {
    header: 'Raporlama',
    cell: info => info.getValue() ? (
      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-semibold">
        RAPOR
      </span>
    ) : null,
  }),
  columnHelper.accessor('isActive', {
    header: 'Durum',
    cell: info => (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${info.getValue()
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-700'
        }`}>
        {info.getValue() ? 'Aktif' : 'Pasif'}
      </span>
    ),
  }),
];

export function CurrencyManagement() {
  const [activeTab, setActiveTab] = useState<'list' | 'rates' | 'history' | 'charts'>('list');
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);

  // Mock data - gerçek uygulamada API'den gelecek
  useEffect(() => {
    const mockCurrencies: Currency[] = [
      {
        id: '1',
        code: 'TRY',
        name: 'Türk Lirası',
        symbol: '₺',
        isBaseCurrency: true,
        isReportingCurrency: true,
        isActive: true,
        lastRate: 1.0000,
        lastUpdateDate: new Date().toISOString(),
        changePercent: 0,
      },
      {
        id: '2',
        code: 'USD',
        name: 'Amerikan Doları',
        symbol: '$',
        isBaseCurrency: false,
        isReportingCurrency: false,
        isActive: true,
        lastRate: 32.5678,
        lastUpdateDate: new Date().toISOString(),
        changePercent: 1.25,
      },
      {
        id: '3',
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        isBaseCurrency: false,
        isReportingCurrency: false,
        isActive: true,
        lastRate: 35.4321,
        lastUpdateDate: new Date().toISOString(),
        changePercent: -0.85,
      },
      {
        id: '4',
        code: 'GBP',
        name: 'İngiliz Sterlini',
        symbol: '£',
        isBaseCurrency: false,
        isReportingCurrency: false,
        isActive: true,
        lastRate: 41.2345,
        lastUpdateDate: new Date().toISOString(),
        changePercent: 0.45,
      },
    ];

    const mockRates: ExchangeRate[] = [
      {
        id: '1',
        currencyCode: 'USD',
        date: new Date().toISOString().split('T')[0],
        buyRate: 32.5500,
        sellRate: 32.5856,
        averageRate: 32.5678,
        enteredBy: 'Admin User',
        enteredDate: new Date().toISOString(),
      },
      {
        id: '2',
        currencyCode: 'EUR',
        date: new Date().toISOString().split('T')[0],
        buyRate: 35.4100,
        sellRate: 35.4542,
        averageRate: 35.4321,
        enteredBy: 'Admin User',
        enteredDate: new Date().toISOString(),
      },
    ];

    setCurrencies(mockCurrencies);
    setExchangeRates(mockRates);
  }, []);

  const handleAddCurrency = () => {
    setShowAddModal(true);
  };

  const handleAddRate = () => {
    setShowRateModal(true);
  };

  const handleRefreshRates = () => {
    // API'den güncel kurları çek
    console.log('Refreshing exchange rates...');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-8 h-8 text-blue-600" />
            Para Birimi Yönetimi
          </h1>
          <p className="text-gray-600 mt-1">
            Para birimleri ve döviz kurları yönetimi
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefreshRates}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Kurları Güncelle
          </button>
          <button
            onClick={handleAddRate}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Kur Girişi
          </button>
          <button
            onClick={handleAddCurrency}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Para Birimi Ekle
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'list'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Para Birimleri
          </button>
          <button
            onClick={() => setActiveTab('rates')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'rates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Günlük Kurlar
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Kur Geçmişi
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'charts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Grafikler
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-lg shadow">
          <DevExDataGrid
            data={currencies}
            columns={currencyColumns}
            enableFiltering
            enableSorting
            enablePagination
            pageSize={10}
          />
        </div>
      )}

      {activeTab === 'rates' && (
        <div className="space-y-4">
          {/* Date Selector */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tarih Seçin
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Para Birimi
                </label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {currencies.filter(c => !c.isBaseCurrency).map(currency => (
                    <option key={currency.id} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Exchange Rates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {exchangeRates.map(rate => (
              <div key={rate.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-6 h-6 text-blue-600" />
                    <span className="text-xl font-bold">{rate.currencyCode}</span>
                  </div>
                  <button className="p-2 hover:bg-gray-100 rounded-lg">
                    <Edit className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Alış:</span>
                    <span className="text-lg font-semibold text-green-600">
                      {rate.buyRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Satış:</span>
                    <span className="text-lg font-semibold text-red-600">
                      {rate.sellRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="text-sm text-gray-600">Ortalama:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {rate.averageRate.toFixed(4)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                  <div>Giren: {rate.enteredBy}</div>
                  <div>{new Date(rate.enteredDate).toLocaleString('tr-TR')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Kur Geçmişi
            </h3>
            <p className="text-gray-600">
              Seçili para biriminin geçmiş kur bilgileri burada görüntülenecek
            </p>
          </div>
        </div>
      )}

      {activeTab === 'charts' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Kur Grafikleri
            </h3>
            <p className="text-gray-600">
              Para birimi kur değişim grafikleri burada görüntülenecek
            </p>
          </div>
        </div>
      )}

      {/* Add Currency Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Yeni Para Birimi Ekle</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Para Birimi Kodu
                </label>
                <input
                  type="text"
                  placeholder="USD"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Para Birimi Adı
                </label>
                <input
                  type="text"
                  placeholder="Amerikan Doları"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sembol
                </label>
                <input
                  type="text"
                  placeholder="$"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  Aktif
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  // Save logic here
                  setShowAddModal(false);
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Kur Girişi</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Para Birimi
                </label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  {currencies.filter(c => !c.isBaseCurrency).map(currency => (
                    <option key={currency.id} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tarih
                </label>
                <input
                  type="date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alış Kuru
                </label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="32.5500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Satış Kuru
                </label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="32.5856"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowRateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => {
                  // Save logic here
                  setShowRateModal(false);
                }}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
