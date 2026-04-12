import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, Save, FileText, Tag, Banknote, Calculator, Info, 
  Settings, Database, Check, AlertCircle, Briefcase,
  Share2, Trash2, Plus, Search, LayoutGrid, MoreVertical,
  Barcode as BarcodeIcon, Download, Image as ImageIcon,
  Globe, Building, Ruler, Weight, Calendar, Layers,
  ChevronDown, ChevronRight, Printer, Package, Upload
} from 'lucide-react';
import { serviceAPI, type Service, type CreateServiceInput } from '../../../services/serviceAPI';
import { currencyAPI, categoryAPI, taxRateAPI, specialCodeAPI, type Currency, type Category, type TaxRate, type SpecialCode, definitionAPI, brandAPI, productGroupAPI, unitAPI, type Brand } from '../../../services/api/masterData';
import { MasterDataSelectionModal, type MasterDataItem } from '../../shared/MasterDataSelectionModal';
import { TreeSelectionModal, type TreeDataItem } from '../../shared/TreeSelectionModal';
import { ImageSearchModal } from '../../shared/ImageSearchModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import { translateToAllLanguages } from '../../../services/translationService';
import { compressImage } from '../../../utils/imageUtils';

interface ServiceFormPageProps {
  serviceId?: string;
  onClose?: () => void;
  onSave?: (service: Service) => void;
}

type TabType = 'genel' | 'fiyat' | 'muhasebe' | 'ek-bilgi' | 'resim';

export const ServiceFormPage = React.memo(({ serviceId, onClose, onSave }: ServiceFormPageProps) => {
  const { tm } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('genel');
  const [loading, setLoading] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const translationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [usdExchangeRate, setUsdExchangeRate] = useState<number>(1316);
  const [showImageSearchModal, setShowImageSearchModal] = useState(false);

  const [formData, setFormData] = useState({
    id: '',
    code: '',
    name: '',
    category: '',
    categoryId: '',
    categoryCode: '',
    groupCode: '',
    subGroupCode: '',
    brand: '',
    model: '',
    manufacturer: '',
    supplier: '',
    origin: '',
    
    // Özel Kodlar
    specialCode1: '',
    specialCode2: '',
    specialCode3: '',
    specialCode4: '',
    specialCode5: '',
    specialCode6: '',

    // Birim
    unit: 'Adet',

    // Vergi
    taxRate: 15,
    taxType: 'TAX',
    withholdingRate: 0,
    
    // Fiyatlandırma
    currency: 'IQD',
    unit_price: 0,
    unit_price_usd: 0,
    unit_price_eur: 0,
    purchase_price: 0,
    purchase_price_usd: 0,
    purchase_price_eur: 0,
    
    // İskontolar
    discount1: 0,
    discount2: 0,
    discount3: 0,
    
    // Fiyat Listeleri
    priceList1: 0,
    priceList2: 0,
    priceList3: 0,
    priceList4: 0,
    priceList5: 0,
    priceList6: 0,

    // Muhasebe
    accountCode: '',
    costCenterCode: '',
    expenseItemCode: '',
    revenueAccountCode: '',

    // Ek Bilgiler
    description: '',
    description_tr: '',
    description_en: '',
    description_ar: '',
    description_ku: '',
    technicalSpecs: '',
    usageInfo: '',
    notes: '',

    // E-ticaret / SEO
    seoTitle: '',
    seoDescription: '',
    metaKeywords: '',
    image_url: '',

    // Durum
    isActive: true,
    autoCalculateUSD: false,
    customExchangeRate: 0,
  });

  // Master data states
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [productGroups, setProductGroups] = useState<any[]>([]);
  const [units, setUnits] = useState<MasterDataItem[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [suppliers, setSuppliers] = useState<MasterDataItem[]>([]);
  const [allSpecialCodes, setAllSpecialCodes] = useState<SpecialCode[]>([]);

  const [selectionModal, setSelectionModal] = useState<{
    show: boolean;
    title: string;
    type: string;
    items: MasterDataItem[];
    currentValue: string | string[];
    isMulti?: boolean;
    useTree?: boolean;
  }>({
    show: false,
    title: '',
    type: 'category',
    items: [],
    currentValue: '',
    isMulti: false,
    useTree: false,
  });

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        const [currRes, catRes, brandRes, groupRes, unitRes, taxRes, suppRes, specRes] = await Promise.all([
          currencyAPI.getAll(),
          categoryAPI.getAll(),
          brandAPI.getAll(),
          productGroupAPI.getAll(),
          unitAPI.getAll(),
          taxRateAPI.getAll(),
          definitionAPI.getAll('suppliers'),
          specialCodeAPI.getAll(),
        ]);
        setCurrencies(currRes);
        setCategories(catRes);
        setBrands(brandRes);
        setProductGroups(groupRes);
        setUnits(unitRes);
        setTaxRates(taxRes);
        setSuppliers(suppRes);
        setAllSpecialCodes(specRes);

        // Fetch latest USD exchange rate
        const { exchangeRateAPI } = await import('../../../services/api/masterData');
        const latestRates = await exchangeRateAPI.getLatestRates();
        const usdRate = latestRates.find(r => r.currency_code === 'USD');
        if (usdRate) {
          setUsdExchangeRate(usdRate.sell_rate);
          setFormData(prev => ({
            ...prev,
            customExchangeRate: prev.customExchangeRate > 0 ? prev.customExchangeRate : usdRate.sell_rate
          }));
        }

        if (serviceId) {
          setLoading(true);
          const service = await serviceAPI.getById(serviceId);
          if (service) {
            setFormData(prev => ({
              ...prev,
              id: service.id,
              code: service.code,
              name: service.name,
              description_tr: service.description_tr || service.name,
              description_en: service.description_en || '',
              description_ar: service.description_ar || '',
              description_ku: service.description_ku || '',
              category: service.category || '',
              categoryId: service.categoryId || '',
              categoryCode: service.categoryCode || '',
              brand: service.brand || '',
              model: service.model || '',
              manufacturer: service.manufacturer || '',
              supplier: service.supplier || '',
              origin: service.origin || '',
              groupCode: service.groupCode || '',
              subGroupCode: service.subGroupCode || '',
              specialCode1: service.specialCode1 || '',
              specialCode2: service.specialCode2 || '',
              specialCode3: service.specialCode3 || '',
              specialCode4: service.specialCode4 || '',
              specialCode5: service.specialCode5 || '',
              specialCode6: service.specialCode6 || '',
              unit_price: service.unit_price,
              unit_price_usd: service.unit_price_usd || 0,
              purchase_price: service.purchase_price || 0,
              purchase_price_usd: service.purchase_price_usd || 0,
              taxRate: service.tax_rate,
              unit: service.unit,
              isActive: service.is_active,
              image_url: service.image_url || '',
              priceList1: service.priceList1 || 0,
              priceList2: service.priceList2 || 0,
              priceList3: service.priceList3 || 0,
              priceList4: service.priceList4 || 0,
              priceList5: service.priceList5 || 0,
              priceList6: service.priceList6 || 0,
            }));
          }
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Veriler yüklenirken bir hata oluştu');
      }
    };
    fetchMasterData();
  }, [serviceId]);

  const handleInputChange = (field: string, value: any) => {
    const safeValue = value === undefined || value === null ? '' : value;
    
    setFormData((prev: any) => {
      const newData = { ...prev, [field]: safeValue };

      // Auto calculation logic (matching ProductFormPage)
      let effectiveRate = newData.customExchangeRate > 0 ? newData.customExchangeRate : usdExchangeRate;
      
      if (newData.currency === 'IQD' && effectiveRate > 0 && effectiveRate < 10) {
        effectiveRate = effectiveRate * 1000;
      }
      
      if (newData.autoCalculateUSD && effectiveRate > 0) {
        if (field === 'unit_price_usd') {
          newData.unit_price = Math.round(Number(safeValue) * effectiveRate);
        } else if (field === 'purchase_price_usd') {
          newData.purchase_price = Math.round(Number(safeValue) * effectiveRate);
        } else if (field === 'customExchangeRate') {
          if (newData.unit_price_usd > 0) newData.unit_price = Math.round(newData.unit_price_usd * Number(safeValue));
          if (newData.purchase_price_usd > 0) newData.purchase_price = Math.round(newData.purchase_price_usd * Number(safeValue));
        } else if (field === 'autoCalculateUSD' && safeValue === true) {
          if (newData.unit_price_usd > 0) newData.unit_price = Math.round(newData.unit_price_usd * effectiveRate);
          if (newData.purchase_price_usd > 0) newData.purchase_price = Math.round(newData.purchase_price_usd * effectiveRate);
        }
      } else if (!newData.autoCalculateUSD && effectiveRate > 0) {
        // Reverse calculation: local price change updates USD price
        if (field === 'unit_price') {
          newData.unit_price_usd = Number((Number(safeValue) / effectiveRate).toFixed(2));
        } else if (field === 'purchase_price') {
          newData.purchase_price_usd = Number((Number(safeValue) / effectiveRate).toFixed(2));
        }
      }

      return newData;
    });
  };

  // Auto-translate descriptions (matching ProductFormPage)
  useEffect(() => {
    if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);

    if (formData.description_tr && formData.description_tr.trim() !== '') {
      translationTimeoutRef.current = setTimeout(async () => {
        setIsTranslating(true);
        try {
          const translations = await translateToAllLanguages(formData.description_tr);
          setFormData((prev: any) => ({
            ...prev,
            description_en: translations.en,
            description_ar: translations.ar,
            description_ku: translations.ku,
          }));
        } catch (error) {
          console.error('Translation failed:', error);
        } finally {
          setIsTranslating(false);
        }
      }, 1000);
    }

    return () => {
      if (translationTimeoutRef.current) clearTimeout(translationTimeoutRef.current);
    };
  }, [formData.description_tr]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.code || !formData.description_tr) {
      toast.error('Hizmet kodu ve Türkçe açıklama zorunludur');
      return;
    }

    try {
      const serviceData: any = {
        code: formData.code,
        name: formData.description_tr,
        description: formData.description_tr,
        description_tr: formData.description_tr,
        description_en: formData.description_en,
        description_ar: formData.description_ar,
        description_ku: formData.description_ku,
        category: formData.category,
        categoryId: formData.categoryId,
        categoryCode: formData.categoryCode,
        brand: formData.brand,
        model: formData.model,
        manufacturer: formData.manufacturer,
        supplier: formData.supplier,
        origin: formData.origin,
        groupCode: formData.groupCode,
        subGroupCode: formData.subGroupCode,
        specialCode1: formData.specialCode1,
        specialCode2: formData.specialCode2,
        specialCode3: formData.specialCode3,
        specialCode4: formData.specialCode4,
        specialCode5: formData.specialCode5,
        specialCode6: formData.specialCode6,
        unit_price: formData.unit_price,
        unit_price_usd: formData.unit_price_usd,
        unit_price_eur: formData.unit_price_eur,
        purchase_price: formData.purchase_price,
        purchase_price_usd: formData.purchase_price_usd,
        purchase_price_eur: formData.purchase_price_eur,
        tax_rate: formData.taxRate,
        tax_type: formData.taxType,
        withholding_rate: formData.withholdingRate,
        discount1: formData.discount1,
        discount2: formData.discount2,
        discount3: formData.discount3,
        unit: formData.unit,
        is_active: formData.isActive,
        image_url: formData.image_url,
        priceList1: formData.priceList1,
        priceList2: formData.priceList2,
        priceList3: formData.priceList3,
        priceList4: formData.priceList4,
        priceList5: formData.priceList5,
        priceList6: formData.priceList6,
      };

      let result;
      if (serviceId) {
        result = await serviceAPI.update(serviceId, serviceData);
        toast.success(tm('materialCardUpdated') || 'Hizmet başarıyla güncellendi');
      } else {
        result = await serviceAPI.create(serviceData);
        toast.success(tm('materialCardCreated') || 'Hizmet başarıyla oluşturuldu');
      }
      if (onSave) onSave(result);
      if (onClose) onClose();
    } catch (error: any) {
      console.error('Error saving service:', error);
      toast.error(error.message || 'Hizmet kaydedilirken bir hata oluştu');
    }
  };

  const openSelectionModal = (type: string) => {
    let title = '';
    let items: any[] = [];
    let currentValue = '';

    switch (type) {
      case 'category':
        title = 'Kategori Seç';
        items = categories;
        currentValue = formData.category || '';
        break;
      case 'brand':
        title = 'Marka Seç';
        items = brands;
        currentValue = formData.brand || '';
        break;
      case 'productGroup':
        title = 'Grup Seç';
        items = productGroups;
        currentValue = formData.groupCode || '';
        break;
      case 'unit':
        title = 'Birim Seç';
        items = units;
        currentValue = formData.unit || '';
        break;
      case 'taxRate':
        title = 'TAX Oranı Seç';
        items = taxRates.map(tr => ({ id: tr.id, code: `%${tr.rate}`, name: tr.description || `%${tr.rate}` }));
        currentValue = formData.taxRate.toString();
        break;
      case 'supplier':
        title = 'Tedarikçi Seç (Çoklu)';
        items = suppliers;
        currentValue = formData.supplier || '';
        break;
      case 'specialCode1':
      case 'specialCode2':
      case 'specialCode3':
      case 'specialCode4':
      case 'specialCode5':
      case 'specialCode6':
        const codeNum = type.replace('specialCode', '');
        title = `Özel Kod ${codeNum} Seç`;
        items = allSpecialCodes;
        currentValue = (formData as any)[type] || '';
        break;
    }

    setSelectionModal({
      show: true,
      title,
      type,
      items,
      currentValue,
      isMulti: type === 'supplier',
      useTree: type === 'category' || type === 'productGroup',
    });
  };

  const handleSelectionSelect = (item: MasterDataItem | MasterDataItem[]) => {
    if (Array.isArray(item)) {
      if (selectionModal.type === 'supplier') {
        const supplierNames = item.map(i => i.name).join(', ');
        handleInputChange('supplier', supplierNames);
      }
      setSelectionModal((prev: any) => ({ ...prev, show: false }));
      return;
    }

    switch (selectionModal.type) {
      case 'category':
        handleInputChange('category', item.name);
        handleInputChange('categoryId', item.id);
        handleInputChange('categoryCode', item.code);
        break;
      case 'brand':
        handleInputChange('brand', item.name);
        break;
      case 'productGroup':
        handleInputChange('groupCode', item.code);
        break;
      case 'unit':
        handleInputChange('unit', item.name);
        break;
      case 'taxRate':
        const rate = parseFloat(item.code.replace('%', ''));
        handleInputChange('taxRate', rate);
        break;
      default:
        if (selectionModal.type.startsWith('specialCode')) {
          handleInputChange(selectionModal.type, item.code);
        }
    }
    setSelectionModal((prev: any) => ({ ...prev, show: false }));
  };

  const handleTreeSelect = (item: TreeDataItem) => {
    if (selectionModal.type === 'category') {
      handleInputChange('category', item.name);
      handleInputChange('categoryId', item.id);
      handleInputChange('categoryCode', item.code);
    } else if (selectionModal.type === 'productGroup') {
      handleInputChange('groupCode', item.code);
    }
    setSelectionModal((prev: any) => ({ ...prev, show: false }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file, 800, 800, 0.7);
      handleInputChange('image_url', base64);
      toast.success('Resim yüklendi ve optimize edildi');
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('Resim işlenirken bir hata oluştu');
    }
  };

  const tabs = [
    { id: 'genel' as TabType, label: tm('general'), icon: FileText },
    { id: 'fiyat' as TabType, label: tm('price'), icon: Calculator },
    { id: 'muhasebe' as TabType, label: tm('accounting'), icon: Database },
    { id: 'ek-bilgi' as TabType, label: tm('additionalInfo'), icon: Globe },
    { id: 'resim' as TabType, label: tm('image'), icon: ImageIcon },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-gray-900">
            {serviceId ? 'Hizmet Kartı Düzenle' : 'Yeni Hizmet Kartı'}
          </span>
          {formData.code && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold font-mono">
              {formData.code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSubmit()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {tm('save')} (Ctrl+S)
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-300">
        <div className="flex overflow-x-auto">
          {tabs.map((tab: any) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs border-r border-gray-300 transition-colors whitespace-nowrap ${activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        <div className="max-w-6xl mx-auto">
          
          {activeTab === 'genel' && (
            <div className="space-y-3">
              {/* Temel Bilgiler */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('basicInformation')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Kart Tipi</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <select
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      disabled
                      value="service"
                    >
                      <option value="service">Hizmet Kartı</option>
                    </select>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Hizmet Kodu *</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.code || ''}
                      onChange={(e) => handleInputChange('code', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-blue-700"
                      placeholder="Otomatik veya Manuel"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">
                      {tm('description')} (Türkçe) *
                      {isTranslating && <span className="ml-2 text-blue-600">🔄 {tm('translating')}...</span>}
                    </label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.description_tr || ''}
                      onChange={(e) => handleInputChange('description_tr', e.target.value)}
                      placeholder="Ana açıklama..."
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('description')} (English)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.description_en || ''}
                      onChange={(e) => handleInputChange('description_en', e.target.value)}
                      placeholder="Auto translated..."
                      className="w-full px-2 py-1 border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('description')} (Arabic)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.description_ar || ''}
                      onChange={(e) => handleInputChange('description_ar', e.target.value)}
                      placeholder="Auto translated..."
                      dir="rtl"
                      className="w-full px-2 py-1 border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('description')} (Kurdish)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.description_ku || ''}
                      onChange={(e) => handleInputChange('description_ku', e.target.value)}
                      placeholder="Auto translated..."
                      dir="rtl"
                      className="w-full px-2 py-1 border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                  </div>
                  <div className="col-span-6"></div>
                </div>
              </div>

              {/* Kategori ve Sınıflandırma */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">Kategori ve Sınıflandırma</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('category')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.category || ''}
                      readOnly
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                    <button
                      onClick={() => openSelectionModal('category')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Grup Kodu</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.groupCode || ''}
                      readOnly
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                    <button
                      onClick={() => openSelectionModal('productGroup')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Birim</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.unit || ''}
                      readOnly
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                    <button
                      onClick={() => openSelectionModal('unit')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-6"></div>
                </div>
              </div>

              {/* Marka ve Üretici */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">Marka ve Üretici Bilgileri</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('brand')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.brand || ''}
                      readOnly
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                    <button
                      onClick={() => openSelectionModal('brand')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Model</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.model || ''}
                      onChange={(e) => handleInputChange('model', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                     <button
                      onClick={() => openSelectionModal('model')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Tedarikçi</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.supplier || ''}
                      readOnly
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                    />
                    <button
                      onClick={() => openSelectionModal('supplier')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Menşei</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.origin || ''}
                      onChange={(e) => handleInputChange('origin', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Özel Kodlar */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">Analiz ve Özel Kodlar</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <React.Fragment key={num}>
                      <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                        <label className="text-xs text-gray-700">Özel Kod {num}</label>
                      </div>
                      <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                        <input
                          type="text"
                          value={(formData as any)[`specialCode${num}`]}
                          readOnly
                          className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                        />
                        <button
                          onClick={() => openSelectionModal(`specialCode${num}`)}
                          className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fiyat' && (
            <div className="space-y-3">
              {/* Para Birimi ve Temel Fiyatlar */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('basicPricing')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  {/* Row 1: Para Birimi & TAX Tipi */}
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700">{tm('currency')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <select
                      value={formData.currency || 'IQD'}
                      onChange={(e) => handleInputChange('currency', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="IQD">IQD - {tm('iraqiDinar')}</option>
                      <option value="USD">USD - {tm('usDollar')}</option>
                      <option value="EUR">EUR - {tm('euro')}</option>
                    </select>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700">{tm('taxType')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <select
                      value={formData.taxType || 'TAX'}
                      onChange={(e) => handleInputChange('taxType', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="TAX">TAX</option>
                      <option value="Muaf">{tm('exempt')}</option>
                    </select>
                  </div>

                  {/* Row 2: Alış Fiyatı & TAX % */}
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700 font-bold">{tm('purchasePrice')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 relative">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchase_price || 0}
                      onChange={(e) => handleInputChange('purchase_price', Number(e.target.value))}
                      readOnly={formData.autoCalculateUSD}
                      className={`w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${formData.autoCalculateUSD ? 'bg-blue-50 cursor-not-allowed text-blue-700' : ''}`}
                    />
                    {formData.autoCalculateUSD && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold flex items-center gap-1 bg-blue-50/50 px-1 rounded">
                        <Banknote className="w-2.5 h-2.5" /> {tm('auto')}
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700 italic">TAX %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      value={formData.taxRate || 0}
                      onChange={(e) => handleInputChange('taxRate', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Row 3: Satış Fiyatı & Tevkifat % */}
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700 font-bold">{tm('salePrice')}</label>
                  </div>
                  <div className="col-span-3 bg-green-50 px-2 py-1.5 relative">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.unit_price || 0}
                      onChange={(e) => handleInputChange('unit_price', Number(e.target.value))}
                      readOnly={formData.autoCalculateUSD}
                      className={`w-full px-2 py-1 border border-green-300 text-xs text-right bg-green-50 font-bold focus:outline-none focus:ring-1 focus:ring-green-500 ${formData.autoCalculateUSD ? 'text-blue-700' : ''}`}
                    />
                    {formData.autoCalculateUSD && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold flex items-center gap-1 bg-blue-50/50 px-1 rounded border border-blue-200">
                        <Banknote className="w-2.5 h-2.5" /> {tm('auto')}
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700">{tm('withholdingTax')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.withholdingRate || 0}
                      onChange={(e) => handleInputChange('withholdingRate', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Row 4: Kâr Marjı */}
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700">{tm('profitMargin')}</label>
                  </div>
                  <div className="col-span-3 bg-gray-50 px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.purchase_price > 0
                        ? ((formData.unit_price - formData.purchase_price) / formData.purchase_price * 100).toFixed(2)
                        : '0.00'}
                      readOnly
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right bg-gray-100 text-gray-600 font-medium"
                    />
                  </div>
                  <div className="col-span-6 bg-gray-50 flex items-center px-4">
                    <span className="text-[10px] text-gray-400 italic">Net kâr marjı (Lokal para birimi üzerinden hesaplanır)</span>
                  </div>
                </div>
              </div>

              {/* Dövizli Fiyatlar */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('foreignCurrencyPrices')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                   <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center justify-between">
                    <label className="text-xs text-gray-700">{tm('purchasePrice')} (USD)</label>
                    <button
                      onClick={() => handleInputChange('autoCalculateUSD', !formData.autoCalculateUSD)}
                      className={`p-1 rounded transition-colors ${formData.autoCalculateUSD ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:text-gray-500'}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchase_price_usd || 0}
                      onChange={(e) => handleInputChange('purchase_price_usd', Number(e.target.value))}
                      className={`w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${formData.autoCalculateUSD ? 'bg-blue-50' : ''}`}
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center justify-between">
                    <label className="text-xs text-gray-700">{tm('salePrice')} (USD)</label>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">Rate: {usdExchangeRate}</span>
                      <button
                        onClick={() => handleInputChange('autoCalculateUSD', !formData.autoCalculateUSD)}
                        className={`p-1 rounded transition-colors ${formData.autoCalculateUSD ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:text-gray-500'}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.unit_price_usd || 0}
                      onChange={(e) => handleInputChange('unit_price_usd', Number(e.target.value))}
                      className={`w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${formData.autoCalculateUSD ? 'bg-blue-50' : ''}`}
                    />
                  </div>

                  {/* Row 2: Özel Kur */}
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700">{tm('customExchangeRate')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.customExchangeRate || 0}
                      onChange={(e) => handleInputChange('customExchangeRate', Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-6 bg-gray-50 px-2 py-1.5 flex items-center">
                    <span className="text-[10px] text-gray-400 italic">Boş ise sistem kuru ({usdExchangeRate}) baz alınır.</span>
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('purchasePrice')} (EUR)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchase_price_eur || 0}
                      onChange={(e) => handleInputChange('purchase_price_eur', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('salePrice')} (EUR)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.unit_price_eur || 0}
                      onChange={(e) => handleInputChange('unit_price_eur', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Fiyat Listeleri */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                   <span className="text-xs text-gray-700">Fiyat Listeleri</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <React.Fragment key={num}>
                      <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                        <label className="text-xs text-gray-700">{tm('priceList')} {num}</label>
                      </div>
                      <div className="col-span-3 bg-white px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={(formData as any)[`priceList${num}`] || 0}
                          onChange={(e) => handleInputChange(`priceList${num}`, Number(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* İskonto */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">İskonto Oranları</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">İskonto 1 %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount1}
                      onChange={(e) => handleInputChange('discount1', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">İskonto 2 %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount2}
                      onChange={(e) => handleInputChange('discount2', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">İskonto 3 %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount3}
                      onChange={(e) => handleInputChange('discount3', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5"></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'muhasebe' && (
            <div className="bg-white border border-gray-300">
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                <span className="text-xs text-gray-700">{tm('accounting')}</span>
              </div>
              <div className="grid grid-cols-12 gap-px bg-gray-300">
                <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                  <label className="text-xs text-gray-700">Gelir Hesabı</label>
                </div>
                <div className="col-span-3 bg-white px-2 py-1.5">
                  <input
                    type="text"
                    value={formData.revenueAccountCode || ''}
                    onChange={(e) => handleInputChange('revenueAccountCode', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                  <label className="text-xs text-gray-700">Gider Hesabı</label>
                </div>
                <div className="col-span-3 bg-white px-2 py-1.5">
                  <input
                    type="text"
                    value={formData.expenseItemCode || ''}
                    onChange={(e) => handleInputChange('expenseItemCode', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                  <label className="text-xs text-gray-700">Masraf Merkezi</label>
                </div>
                <div className="col-span-3 bg-white px-2 py-1.5">
                  <input
                    type="text"
                    value={formData.costCenterCode || ''}
                    onChange={(e) => handleInputChange('costCenterCode', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                  <label className="text-xs text-gray-700">Genel Muhasebe Kodu</label>
                </div>
                <div className="col-span-3 bg-white px-2 py-1.5">
                  <input
                    type="text"
                    value={formData.accountCode || ''}
                    onChange={(e) => handleInputChange('accountCode', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ek-bilgi' && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('additionalInfo')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Açıklama</label>
                  </div>
                  <div className="col-span-9 bg-white px-2 py-1.5">
                    <textarea
                      rows={3}
                      value={formData.description || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Teknik Bilgiler</label>
                  </div>
                  <div className="col-span-9 bg-white px-2 py-1.5">
                    <textarea
                      rows={2}
                      value={formData.technicalSpecs || ''}
                      onChange={(e) => handleInputChange('technicalSpecs', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Kullanım Notu</label>
                  </div>
                  <div className="col-span-9 bg-white px-2 py-1.5">
                    <textarea
                      rows={2}
                      value={formData.usageInfo || ''}
                      onChange={(e) => handleInputChange('usageInfo', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* SEO */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">SEO Ve E-Ticaret</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">SEO Başlık</label>
                  </div>
                  <div className="col-span-9 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.seoTitle || ''}
                      onChange={(e) => handleInputChange('seoTitle', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">Keywords</label>
                  </div>
                  <div className="col-span-9 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.metaKeywords || ''}
                      onChange={(e) => handleInputChange('metaKeywords', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'resim' && (
            <div className="bg-white border border-gray-300 h-[400px]">
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                <span className="text-xs text-gray-700">{tm('image')}</span>
              </div>
              <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
                {formData.image_url ? (
                  <div className="relative group">
                    <img
                      src={formData.image_url}
                      alt="Service"
                      className="w-64 h-64 object-contain border-2 border-gray-200 rounded-2xl shadow-lg"
                    />
                    <button
                      onClick={() => handleInputChange('image_url', '')}
                      className="absolute -top-3 -right-3 p-2 bg-red-600 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-64 h-64 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center bg-gray-50 hover:bg-white hover:border-blue-400 transition-all cursor-pointer relative">
                    <input
                      type="file"
                      onChange={handleImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      accept="image/*"
                    />
                    <ImageIcon className="w-12 h-12 text-gray-300 mb-4" />
                    <p className="text-xs font-bold text-gray-500">{tm('clickToUpload')}</p>
                    <p className="text-[10px] text-gray-400 mt-2">{tm('imageFormatHint')}</p>
                  </div>
                )}
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowImageSearchModal(true)}
                    className="flex items-center gap-2 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all border border-gray-300"
                  >
                    <Search className="w-4 h-4" />
                    İnternetten Resim Seç
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selection Modals */}
      {selectionModal.show && (
        selectionModal.useTree ? (
          <TreeSelectionModal
            onClose={() => setSelectionModal(prev => ({ ...prev, show: false }))}
            onSelect={handleTreeSelect}
            items={selectionModal.items as any}
            title={selectionModal.title}
            currentValue={selectionModal.currentValue as string}
          />
        ) : (
          <MasterDataSelectionModal
            onClose={() => setSelectionModal(prev => ({ ...prev, show: false }))}
            onSelect={handleSelectionSelect}
            items={selectionModal.items}
            title={selectionModal.title}
            currentValue={selectionModal.currentValue}
            isMulti={selectionModal.isMulti}
          />
        )
      )}

      {showImageSearchModal && (
        <ImageSearchModal
          onClose={() => setShowImageSearchModal(false)}
          onSelect={(url) => {
            handleInputChange('image_url', url);
            setShowImageSearchModal(false);
          }}
          initialQuery={formData.description_tr}
        />
      )}
    </div>
  );
});

ServiceFormPage.displayName = 'ServiceFormPage';
