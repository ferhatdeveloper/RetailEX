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
  Globe, RefreshCw, Search, ChevronDown, ChevronUp, BarChart3,
  Loader2, Trash2, X, Check
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { useLanguage } from '../../../contexts/LanguageContext';
import { currencyAPI, exchangeRateAPI, type Currency as APICurrency, type ExchangeRate as APIExchangeRate } from '../../../services/api/masterData';
import { toast } from 'sonner';

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
    header: 'Kod', // will be replaced dynamically inside the component, but let's keep it clean or make a factory function for columns. Actually, wait! The best way is to generate columns *inside* the component, or pass `tm` as a parameter to a column generator function.
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
  const { tm } = useLanguage();
  const [activeTab, setActiveTab] = useState<'list' | 'rates' | 'history' | 'charts'>('list');
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);

  // Moved columns inside to access tm()
  const currencyColumns = [
    columnHelper.accessor('code', {
      header: tm('code') || 'Kod',
      cell: info => (
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-gray-400" />
          <span className="font-semibold">{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor('name', {
      header: tm('currencyLabel') || 'Adı',
      cell: info => info.getValue(),
    }),
    columnHelper.accessor('symbol', {
      header: tm('currencySymbol') || 'Sembol',
      cell: info => <span className="font-mono">{info.getValue()}</span>,
    }),
    columnHelper.accessor('lastRate', {
      header: tm('lastRate') || 'Son Kur',
      cell: info => (
        <span className="font-semibold text-blue-600">
          {Number(info.getValue() || 0).toFixed(4)}
        </span>
      ),
    }),
    columnHelper.accessor('isActive', {
      header: tm('status') || 'Durum',
      cell: info => (
        <span className={`px-2 py-1 rounded text-xs font-semibold ${info.getValue()
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-700'
          }`}>
          {info.getValue() ? tm('active') || 'Aktif' : tm('passive') || 'Pasif'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: tm('actions') || 'İşlemler',
      cell: info => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEditCurrency(info.row.original)}
            className="p-1 hover:bg-gray-100 rounded text-gray-600"
          >
            <Edit className="w-4 h-4" />
          </button>
          {!info.row.original.isBaseCurrency && (
            <button
              onClick={() => handleDeleteCurrency(info.row.original.id)}
              className="p-1 hover:bg-gray-100 rounded text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    }),
  ];

  const [isLoading, setIsLoading] = useState(false);
  const [rateForm, setRateForm] = useState({
    currencyCode: 'USD',
    date: new Date().toISOString().split('T')[0],
    buyRate: 0,
    sellRate: 0
  });

  const [newCurrencyForm, setNewCurrencyForm] = useState({
    id: '',
    code: '',
    name: '',
    symbol: '',
    isActive: true
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [apiCurrencies, latestRates] = await Promise.all([
        currencyAPI.getAll(),
        exchangeRateAPI.getLatestRates()
      ]);

      const mappedCurrencies: Currency[] = apiCurrencies.map(c => {
        const rate = latestRates.find(r => r.currency_code === c.code);
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          symbol: c.symbol || '',
          isBaseCurrency: c.is_base_currency,
          isReportingCurrency: c.code === 'IQD',
          isActive: c.is_active,
          lastRate: Number(rate?.buy_rate || 1),
          lastUpdateDate: rate?.date || new Date().toISOString(),
          changePercent: 0
        };
      });

      const mappedRates: ExchangeRate[] = latestRates.map(r => ({
        id: r.id,
        currencyCode: r.currency_code,
        date: r.date,
        buyRate: Number(r.buy_rate),
        sellRate: Number(r.sell_rate),
        averageRate: (Number(r.buy_rate) + Number(r.sell_rate)) / 2,
        enteredBy: r.source || 'manual',
        enteredDate: r.created_at || r.date
      }));

      setCurrencies(mappedCurrencies);
      setExchangeRates(mappedRates);
    } catch (error) {
      console.error('Failed to fetch currency data:', error);
      toast.error(tm('fetchError') || 'Veriler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddCurrency = () => {
    setNewCurrencyForm({
      id: '',
      code: '',
      name: '',
      symbol: '',
      isActive: true
    });
    setIsEditing(false);
    setShowAddModal(true);
  };

  const handleEditCurrency = (currency: Currency) => {
    setNewCurrencyForm({
      id: currency.id,
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      isActive: currency.isActive
    });
    setIsEditing(true);
    setShowAddModal(true);
  };

  const handleSaveCurrency = async () => {
    if (!newCurrencyForm.code || !newCurrencyForm.name) {
      toast.error(tm('enterCodeAndName') || 'Lütfen kod ve isim giriniz');
      return;
    }

    setIsLoading(true);
    try {
      let result;
      if (isEditing && newCurrencyForm.id) {
        result = await currencyAPI.update(newCurrencyForm.id, {
          name: newCurrencyForm.name,
          symbol: newCurrencyForm.symbol,
          is_active: newCurrencyForm.isActive
        });
      } else {
        result = await currencyAPI.create({
          code: newCurrencyForm.code.toUpperCase(),
          name: newCurrencyForm.name,
          symbol: newCurrencyForm.symbol,
          is_base_currency: false,
          is_active: newCurrencyForm.isActive
        });
      }

      if (result) {
        toast.success(isEditing ? (tm('currencyUpdated') || 'Para birimi güncellendi') : (tm('currencyAdded') || 'Para birimi eklendi'));
        setShowAddModal(false);
        fetchData();
      } else {
        toast.error(tm('saveError') || 'Kaydedilemedi');
      }
    } catch (error: any) {
      console.error('Save currency failed:', error);
      toast.error(tm('saveError') || `Hata: ${error?.message || 'Bilinmeyen'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCurrency = async (id: string) => {
    if (!window.confirm(tm('confirmDelete') || 'Silmek istediğinize emin misiniz?')) return;

    setIsLoading(true);
    try {
      const success = await currencyAPI.delete(id);
      if (success) {
        toast.success(tm('deletedSuccessfully') || 'Başarıyla silindi');
        fetchData();
      } else {
        toast.error(tm('deleteError') || 'Silinemedi');
      }
    } catch (error) {
      console.error('Delete currency failed:', error);
      toast.error(tm('deleteError') || 'Silme işlemi sırasında hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRate = () => {
    setRateForm({
      ...rateForm,
      currencyCode: selectedCurrency || currencies.find(c => !c.isBaseCurrency)?.code || 'USD',
      date: new Date().toISOString().split('T')[0]
    });
    setShowRateModal(true);
  };

  const handleEditRate = (rate: ExchangeRate) => {
    setRateForm({
      currencyCode: rate.currencyCode,
      date: rate.date,
      buyRate: rate.buyRate,
      sellRate: rate.sellRate
    });
    setEditingRateId(rate.id);
    setShowRateModal(true);
  };

  const handleSaveRate = async () => {
    if (rateForm.buyRate <= 0 || rateForm.sellRate <= 0) {
      toast.error(tm('enterValidRates') || 'Lütfen geçerli kurlar giriniz');
      return;
    }

    setIsLoading(true);
    try {
      let result;
      if (editingRateId) {
        result = await exchangeRateAPI.update(editingRateId, {
          buy_rate: rateForm.buyRate,
          sell_rate: rateForm.sellRate
        });
      } else {
        result = await exchangeRateAPI.save({
          currency_code: rateForm.currencyCode,
          date: rateForm.date,
          buy_rate: rateForm.buyRate,
          sell_rate: rateForm.sellRate,
          source: 'manual',
          is_active: true
        });
      }

      if (result) {
        toast.success(editingRateId ? (tm('rateUpdated') || 'Kur başarıyla güncellendi') : (tm('rateSaved') || 'Kur başarıyla kaydedildi'));
        setShowRateModal(false);
        fetchData();
      } else {
        console.error('Save rate returned null or undefined');
        toast.error(tm('saveError') || 'Kaydedilemedi');
      }
    } catch (error: any) {
      console.error('Save rate failed with error:', error);
      toast.error(tm('saveError') || `Hata oluştu: ${error?.message || 'Bilinmeyen hata'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRate = async (id: string) => {
    if (!window.confirm(tm('confirmDelete') || 'Silmek istediğinize emin misiniz?')) return;

    setIsLoading(true);
    try {
      const success = await exchangeRateAPI.delete(id);
      if (success) {
        toast.success(tm('deletedSuccessfully') || 'Başarıyla silindi');
        fetchData();
      } else {
        toast.error(tm('deleteError') || 'Silinemedi');
      }
    } catch (error) {
      console.error('Delete rate failed:', error);
      toast.error(tm('deleteError') || 'Silme işlemi sırasında hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshRates = () => {
    fetchData();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-8 h-8 text-blue-600" />
            {tm('currencyManagement')}
          </h1>
          <p className="text-gray-600 mt-1">
            {tm('currencyManagementDesc')}
          </p>
        </div>
        <div className="flex gap-2">
            <button
              onClick={handleRefreshRates}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {tm('updateRates')}
            </button>
          <button
            onClick={handleAddRate}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {tm('enterRate')}
          </button>
          <button
            onClick={handleAddCurrency}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {tm('addCurrency')}
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
            {tm('currenciesTab')}
          </button>
          <button
            onClick={() => setActiveTab('rates')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'rates'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            {tm('dailyRatesTab')}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'history'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            {tm('rateHistoryTab')}
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'charts'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            {tm('chartsTab')}
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
                  {tm('selectDate')}
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
                  {tm('currencyLabel') || 'Para Birimi'}
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
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleEditRate(rate)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteRate(rate.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{tm('buyRate')}:</span>
                    <span className="text-lg font-semibold text-green-600">
                      {rate.buyRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{tm('sellRate')}:</span>
                    <span className="text-lg font-semibold text-red-600">
                      {rate.sellRate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="text-sm text-gray-600">{tm('average')}:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {rate.averageRate.toFixed(4)}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                  <div>{tm('enteredBy')}: {rate.enteredBy}</div>
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
              {tm('rateHistoryTab')}
            </h3>
            <p className="text-gray-600">
              {tm('rateHistoryPlaceholder') || 'Kur geçmişi verileri yakında burada görüntülenecektir.'}
            </p>
          </div>
        </div>
      )}

      {activeTab === 'charts' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {tm('chartsTab')}
            </h3>
            <p className="text-gray-600">
              {tm('rateChartsPlaceholder') || 'Kur değişim grafikleri yakında burada görüntülenecektir.'}
            </p>
          </div>
        </div>
      )}

      {/* Add Currency Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Globe className="w-5 h-5" />
                {isEditing ? (tm('editCurrency') || 'Para Birimi Düzenle') : (tm('addCurrency') || 'Yeni Para Birimi')}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {tm('currencyCode')}
                </label>
                <input
                  type="text"
                  placeholder="USD"
                  value={newCurrencyForm.code}
                  onChange={(e) => setNewCurrencyForm({...newCurrencyForm, code: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all disabled:bg-gray-50 disabled:text-gray-400 font-mono text-lg"
                  disabled={isEditing}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {tm('currencyName')}
                </label>
                <input
                  type="text"
                  placeholder="Amerikan Doları"
                  value={newCurrencyForm.name}
                  onChange={(e) => setNewCurrencyForm({...newCurrencyForm, name: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all text-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {tm('currencySymbol')}
                </label>
                <input
                  type="text"
                  placeholder="$"
                  value={newCurrencyForm.symbol}
                  onChange={(e) => setNewCurrencyForm({...newCurrencyForm, symbol: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:outline-none transition-all font-mono text-lg"
                />
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={newCurrencyForm.isActive}
                  onChange={(e) => setNewCurrencyForm({...newCurrencyForm, isActive: e.target.checked})}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700 cursor-pointer">
                  {tm('active')}
                </label>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 font-bold transition-all"
                disabled={isLoading}
              >
                {tm('cancel')}
              </button>
              <button
                onClick={handleSaveCurrency}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-200 transition-all"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {tm('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-700 p-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {editingRateId ? (tm('editRate') || 'Kur Düzenle') : (tm('currencyRateEntry') || 'Günlük Kur Girişi')}
              </h2>
              <button onClick={() => setShowRateModal(false)} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {tm('currencyLabel') || 'PARA BİRİMİ'}
                </label>
                <div className="relative">
                  <select 
                    value={rateForm.currencyCode}
                    onChange={(e) => setRateForm({...rateForm, currencyCode: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-green-500 focus:outline-none transition-all appearance-none bg-white disabled:bg-gray-50 text-lg font-bold text-gray-800"
                    disabled={!!editingRateId}
                  >
                    {currencies.filter(c => !c.isBaseCurrency).map(currency => (
                      <option key={currency.id} value={currency.code}>
                        {currency.code} - {currency.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  {tm('dateLabel')}
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={rateForm.date}
                    onChange={(e) => setRateForm({...rateForm, date: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-green-500 focus:outline-none transition-all font-mono text-lg"
                    disabled={!!editingRateId}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {tm('buyRate')}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.0001"
                      value={rateForm.buyRate}
                      onChange={(e) => setRateForm({...rateForm, buyRate: parseFloat(e.target.value) || 0})}
                      placeholder="32.5500"
                      className="w-full pl-4 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:border-green-500 focus:outline-none transition-all font-mono text-xl font-bold text-green-600 bg-green-50/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {tm('sellRate')}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.0001"
                      value={rateForm.sellRate}
                      onChange={(e) => setRateForm({...rateForm, sellRate: parseFloat(e.target.value) || 0})}
                      placeholder="32.5856"
                      className="w-full pl-4 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:border-green-500 focus:outline-none transition-all font-mono text-xl font-bold text-red-600 bg-red-50/30"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowRateModal(false)}
                className="flex-1 px-4 py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 font-bold transition-all"
                disabled={isLoading}
              >
                {tm('cancel')}
              </button>
              <button
                onClick={handleSaveRate}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-bold shadow-lg shadow-green-200 transition-all"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {tm('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
