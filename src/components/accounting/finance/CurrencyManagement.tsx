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

import { useState, useEffect, useCallback } from 'react';
import {
  Banknote, Plus, Edit, TrendingUp, TrendingDown, Calendar,
  Globe, RefreshCw, Search, ChevronDown, ChevronUp, BarChart3,
  Loader2, Trash2, X, Check, Calculator
} from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { useLanguage } from '../../../contexts/LanguageContext';
import { currencyAPI, exchangeRateAPI, type Currency as APICurrency, type ExchangeRate as APIExchangeRate } from '../../../services/api/masterData';
import { parseDecimalStringForInput, formatDecimalForTrInput } from '../../../utils/numberFormatter';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

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

interface RateHistoryRow {
  id: string;
  currencyCode: string;
  date: string;
  buyRate: number;
  sellRate: number;
  averageRate: number;
  source: string;
  enteredDate: string;
}

/** Kur tablolarında ondalık virgül (tr-TR); arayüz dili farklı olsa bile tutarlı */
function formatExchangeRateDisplay(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  return x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const columnHelper = createColumnHelper<Currency>();
const historyColumnHelper = createColumnHelper<RateHistoryRow>();

const currencyColumns = [
  columnHelper.accessor('code', {
    header: 'Kod', // will be replaced dynamically inside the component, but let's keep it clean or make a factory function for columns. Actually, wait! The best way is to generate columns *inside* the component, or pass `tm` as a parameter to a column generator function.
    cell: info => (
      <div className="flex items-center gap-2">
        <Banknote className="w-4 h-4 text-gray-400" />
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
        {formatExchangeRateDisplay(info.getValue())}
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
          <Banknote className="w-4 h-4 text-gray-400" />
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
          {formatExchangeRateDisplay(Number(info.getValue() || 0))}
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
  const [rateBuyInput, setRateBuyInput] = useState('');
  const [rateSellInput, setRateSellInput] = useState('');
  /** Toplu: örn. 100 USD karşılığı X IQD → 1 USD kuru */
  const [rateBulkForeignInput, setRateBulkForeignInput] = useState('100');
  const [rateBulkLocalInput, setRateBulkLocalInput] = useState('');

  const defaultHistoryDateFrom = () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().split('T')[0];
  };
  const [historyRows, setHistoryRows] = useState<RateHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDateFrom, setHistoryDateFrom] = useState<string>(defaultHistoryDateFrom);
  const [historyDateTo, setHistoryDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [historyCurrencyFilter, setHistoryCurrencyFilter] = useState<string>('');
  const [historyTick, setHistoryTick] = useState(0);

  const [chartCurrencyCode, setChartCurrencyCode] = useState('');
  const [chartSeries, setChartSeries] = useState<
    { date: string; buy: number; sell: number; avg: number }[]
  >([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartDateFrom, setChartDateFrom] = useState<string>(defaultHistoryDateFrom);
  const [chartDateTo, setChartDateTo] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const loadRateHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await exchangeRateAPI.getHistory({
        currency_code: historyCurrencyFilter || undefined,
        date_from: historyDateFrom || undefined,
        date_to: historyDateTo || undefined,
        limit: 1000,
      });
      setHistoryRows(
        rows.map((r) => ({
          id: r.id,
          currencyCode: r.currency_code,
          date: r.date,
          buyRate: Number(r.buy_rate),
          sellRate: Number(r.sell_rate),
          averageRate: (Number(r.buy_rate) + Number(r.sell_rate)) / 2,
          source: r.source || 'manual',
          enteredDate: r.created_at || r.date,
        }))
      );
    } catch (e) {
      console.error('loadRateHistory failed:', e);
      setHistoryRows([]);
      toast.error('Veriler yüklenemedi');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyCurrencyFilter, historyDateFrom, historyDateTo]);

  useEffect(() => {
    if (activeTab !== 'history') return;
    void loadRateHistory();
  }, [activeTab, historyTick, loadRateHistory]);

  useEffect(() => {
    if (chartCurrencyCode) return;
    const c = currencies.find((x) => !x.isBaseCurrency);
    if (c) setChartCurrencyCode(c.code);
  }, [currencies, chartCurrencyCode]);

  useEffect(() => {
    if (!showRateModal) return;
    setRateBuyInput(rateForm.buyRate > 0 ? formatDecimalForTrInput(rateForm.buyRate) : '');
    setRateSellInput(rateForm.sellRate > 0 ? formatDecimalForTrInput(rateForm.sellRate) : '');
  }, [showRateModal, rateForm.buyRate, rateForm.sellRate]);

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

  const closeRateModal = () => {
    setShowRateModal(false);
    setEditingRateId(null);
    setRateBulkForeignInput('100');
    setRateBulkLocalInput('');
  };

  const baseCurrencyCode = currencies.find((c) => c.isBaseCurrency)?.code || 'IQD';

  const handleApplyBulkToUnitRate = () => {
    const foreignAmt = parseDecimalStringForInput(rateBulkForeignInput);
    const localAmt = parseDecimalStringForInput(rateBulkLocalInput);
    if (!Number.isFinite(foreignAmt) || foreignAmt <= 0) {
      toast.error('Döviz miktarı sıfırdan büyük olmalıdır (örn. 100).');
      return;
    }
    if (!Number.isFinite(localAmt) || localAmt <= 0) {
      toast.error(`Ana para (${baseCurrencyCode}) toplam tutarını girin.`);
      return;
    }
    const perUnit = localAmt / foreignAmt;
    const rounded = Math.round(perUnit * 1e8) / 1e8;
    const formatted = formatDecimalForTrInput(rounded);
    if (!formatted) {
      toast.error('Kur hesaplanamadı.');
      return;
    }
    setRateBuyInput(formatted);
    setRateSellInput(formatted);
    toast.success(
      `1 ${rateForm.currencyCode} = ${formatExchangeRateDisplay(rounded)} ${baseCurrencyCode} → alış/satış güncellendi.`
    );
  };

  /** Yeni kur: önceki alış/satış değerlerini taşıma (ör. 15400 kalmışken 1,54 sanılıyordu) */
  const handleAddRate = () => {
    setEditingRateId(null);
    setRateForm({
      currencyCode: selectedCurrency || currencies.find(c => !c.isBaseCurrency)?.code || 'USD',
      date: new Date().toISOString().split('T')[0],
      buyRate: 0,
      sellRate: 0
    });
    setRateBuyInput('');
    setRateSellInput('');
    setRateBulkForeignInput('100');
    setRateBulkLocalInput('');
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
    setRateBulkForeignInput('100');
    setRateBulkLocalInput('');
    setShowRateModal(true);
  };

  const handleSaveRate = async () => {
    const buyParsed = parseDecimalStringForInput(rateBuyInput);
    const sellParsed = parseDecimalStringForInput(rateSellInput);
    if (!Number.isFinite(buyParsed) || buyParsed <= 0 || !Number.isFinite(sellParsed) || sellParsed <= 0) {
      toast.error(tm('enterValidRates') || 'Lütfen geçerli kurlar giriniz (örn. 1,54 veya 32,55)');
      return;
    }

    setIsLoading(true);
    try {
      let result;
      if (editingRateId) {
        result = await exchangeRateAPI.update(editingRateId, {
          buy_rate: buyParsed,
          sell_rate: sellParsed
        });
      } else {
        result = await exchangeRateAPI.save({
          currency_code: rateForm.currencyCode,
          date: rateForm.date,
          buy_rate: buyParsed,
          sell_rate: sellParsed,
          source: 'manual',
          is_active: true
        });
      }

      if (result) {
        toast.success(editingRateId ? (tm('rateUpdated') || 'Kur başarıyla güncellendi') : (tm('rateSaved') || 'Kur başarıyla kaydedildi'));
        closeRateModal();
        fetchData();
        setHistoryTick((t) => t + 1);
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
        setHistoryTick((t) => t + 1);
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
    setHistoryTick((t) => t + 1);
  };

  const localeCode = tm('localeCode') || 'tr-TR';

  const loadChartData = useCallback(async () => {
    if (!chartCurrencyCode) {
      setChartSeries([]);
      return;
    }
    setChartLoading(true);
    try {
      const rows = await exchangeRateAPI.getHistory({
        currency_code: chartCurrencyCode,
        date_from: chartDateFrom || undefined,
        date_to: chartDateTo || undefined,
        limit: 500,
      });
      const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      setChartSeries(
        sorted.map((r) => {
          const raw = String(r.date);
          const [y, m, d] = raw.split('-').map((x) => parseInt(x, 10));
          const label =
            y && m && d
              ? new Date(y, m - 1, d).toLocaleDateString(localeCode, { day: '2-digit', month: 'short' })
              : raw;
          const buy = Number(r.buy_rate);
          const sell = Number(r.sell_rate);
          return { date: label, buy, sell, avg: (buy + sell) / 2 };
        })
      );
    } catch (e) {
      console.error('loadChartData failed:', e);
      setChartSeries([]);
    } finally {
      setChartLoading(false);
    }
  }, [chartCurrencyCode, chartDateFrom, chartDateTo, localeCode]);

  useEffect(() => {
    if (activeTab !== 'charts') return;
    void loadChartData();
  }, [activeTab, historyTick, loadChartData]);

  const historyColumns = [
    historyColumnHelper.accessor('date', {
      header: tm('dateLabel') || 'Tarih',
      cell: (info) => {
        const raw = info.getValue();
        if (!raw) return '';
        const [y, m, d] = raw.split('-').map((x) => parseInt(x, 10));
        if (!y || !m || !d) return raw;
        return new Date(y, m - 1, d).toLocaleDateString(localeCode);
      },
    }),
    historyColumnHelper.accessor('currencyCode', {
      header: tm('currencyCodeLabel') || 'Kod',
      cell: (info) => <span className="font-mono font-semibold">{info.getValue()}</span>,
    }),
    historyColumnHelper.accessor('buyRate', {
      header: tm('buyRate') || 'Alış',
      cell: (info) => (
        <span className="text-green-700 font-medium">
          {formatExchangeRateDisplay(Number(info.getValue()))}
        </span>
      ),
    }),
    historyColumnHelper.accessor('sellRate', {
      header: tm('sellRate') || 'Satış',
      cell: (info) => (
        <span className="text-red-700 font-medium">
          {formatExchangeRateDisplay(Number(info.getValue()))}
        </span>
      ),
    }),
    historyColumnHelper.accessor('averageRate', {
      header: tm('average') || 'Ort.',
      cell: (info) => (
        <span className="text-blue-700 font-medium">
          {formatExchangeRateDisplay(Number(info.getValue()))}
        </span>
      ),
    }),
    historyColumnHelper.accessor('source', {
      header: tm('sourceLabel') || 'Kaynak',
      cell: (info) => <span className="text-gray-600 text-sm">{info.getValue()}</span>,
    }),
    historyColumnHelper.accessor('enteredDate', {
      header: tm('recordedAt') || 'Kayıt',
      cell: (info) => {
        const v = info.getValue();
        try {
          return new Date(v).toLocaleString(localeCode);
        } catch {
          return v;
        }
      },
    }),
    historyColumnHelper.display({
      id: 'historyActions',
      header: tm('actions') || 'İşlemler',
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                handleEditRate({
                  id: row.id,
                  currencyCode: row.currencyCode,
                  date: row.date,
                  buyRate: row.buyRate,
                  sellRate: row.sellRate,
                  averageRate: row.averageRate,
                  enteredBy: row.source,
                  enteredDate: row.enteredDate,
                })
              }
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600"
              title={tm('edit') || 'Düzenle'}
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteRate(row.id)}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-red-600"
              title={tm('delete') || 'Sil'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    }),
  ];

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
                    <Banknote className="w-6 h-6 text-blue-600" />
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
                      {formatExchangeRateDisplay(rate.buyRate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{tm('sellRate')}:</span>
                    <span className="text-lg font-semibold text-red-600">
                      {formatExchangeRateDisplay(rate.sellRate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="text-sm text-gray-600">{tm('average')}:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {formatExchangeRateDisplay(rate.averageRate)}
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
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-3">{tm('rateHistoryPlaceholder')}</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tm('dateFrom')}
                </label>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(e) => setHistoryDateFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tm('dateTo')}
                </label>
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(e) => setHistoryDateTo(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tm('currencyLabel')}
                </label>
                <select
                  value={historyCurrencyFilter}
                  onChange={(e) => setHistoryCurrencyFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{tm('allCurrencies')}</option>
                  {currencies.filter((c) => !c.isBaseCurrency).map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void loadRateHistory()}
                disabled={historyLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                {tm('refresh')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {historyLoading && historyRows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>{tm('loading') || 'Yükleniyor…'}</span>
              </div>
            ) : historyRows.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600">{tm('noRateHistory')}</p>
              </div>
            ) : (
              <DevExDataGrid
                data={historyRows}
                columns={historyColumns}
                enableFiltering
                enableSorting
                enablePagination
                pageSize={15}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'charts' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-3">{tm('rateChartsPlaceholder')}</p>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('dateFrom')}</label>
                <input
                  type="date"
                  value={chartDateFrom}
                  onChange={(e) => setChartDateFrom(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('dateTo')}</label>
                <input
                  type="date"
                  value={chartDateTo}
                  onChange={(e) => setChartDateTo(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">{tm('currencyLabel')}</label>
                <select
                  value={chartCurrencyCode}
                  onChange={(e) => setChartCurrencyCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {currencies.filter((c) => !c.isBaseCurrency).map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void loadChartData()}
                disabled={chartLoading || !chartCurrencyCode}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${chartLoading ? 'animate-spin' : ''}`} />
                {tm('refresh')}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 pb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              {chartCurrencyCode ? `${chartCurrencyCode} — ${tm('chartsTab')}` : tm('chartsTab')}
            </h3>
            {chartLoading && chartSeries.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-gray-500 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>{tm('loading')}</span>
              </div>
            ) : chartSeries.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <BarChart3 className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <p>{tm('noChartRateData')}</p>
              </div>
            ) : (
              <div className="w-full mt-2" style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={['auto', 'auto']}
                      tickFormatter={(v) => formatExchangeRateDisplay(Number(v))}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatExchangeRateDisplay(Number(value)), '']}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="buy"
                      name={tm('buyRate')}
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="sell"
                      name={tm('sellRate')}
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      name={tm('average')}
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
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
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-700 p-4 text-white flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                {editingRateId ? (tm('editRate') || 'Kur Düzenle') : (tm('currencyRateEntry') || 'Günlük Kur Girişi')}
              </h2>
              <button type="button" onClick={closeRateModal} className="hover:bg-white/20 p-1 rounded-full transition-colors">
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

              <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Calculator className="w-4 h-4 shrink-0" />
                  Toplu tutardan 1 birim kur
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Örnek: 100 {rateForm.currencyCode} için bankadan gelen toplam {baseCurrencyCode} tutarını yazın; alış ve
                  satış alanlarına <strong>1 {rateForm.currencyCode}</strong> başına düşen kur yazılır.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Döviz miktarı ({rateForm.currencyCode})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={rateBulkForeignInput}
                      onChange={(e) => setRateBulkForeignInput(e.target.value)}
                      placeholder="100"
                      className="w-full px-3 py-2.5 border-2 border-white rounded-lg focus:border-emerald-500 focus:outline-none font-mono text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Toplam tutar ({baseCurrencyCode})
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={rateBulkLocalInput}
                      onChange={(e) => setRateBulkLocalInput(e.target.value)}
                      placeholder="155.250,00"
                      className="w-full px-3 py-2.5 border-2 border-white rounded-lg focus:border-emerald-500 focus:outline-none font-mono text-sm bg-white"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleApplyBulkToUnitRate}
                  className="w-full py-2.5 px-3 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  1 birim kura çevir → alış / satışa yaz
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    {tm('buyRate')}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={rateBuyInput}
                      onChange={(e) => setRateBuyInput(e.target.value)}
                      placeholder="1,54"
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
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={rateSellInput}
                      onChange={(e) => setRateSellInput(e.target.value)}
                      placeholder="1,54"
                      className="w-full pl-4 pr-4 py-3 border-2 border-gray-100 rounded-xl focus:border-green-500 focus:outline-none transition-all font-mono text-xl font-bold text-red-600 bg-red-50/30"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Ondalık: virgül (örn. 1,54). Binlik: nokta (örn. 1.234,56). İsterseniz yukarıdaki hesaplayıcıyı kullanın.
              </p>
            </div>
            <div className="p-6 bg-gray-50 flex gap-3">
              <button
                type="button"
                onClick={closeRateModal}
                className="flex-1 px-4 py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 font-bold transition-all"
                disabled={isLoading}
              >
                {tm('cancel')}
              </button>
              <button
                type="button"
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
