import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProductStore } from '../../../store';
import { productVariantAPI, invoicesAPI } from '../../../services/api/index';
import { productUnitsAPI } from '../../../services/api/productUnitsAPI';
import { unitSetAPI, type UnitSet } from '../../../services/unitSetAPI';
import {
  Share2, Trash2, Plus, X, Search, Database, LayoutGrid, Save, MoreVertical,
  Barcode as BarcodeIcon, Tag, Calculator, Check, Download,
  Image as ImageIcon, FileText, Globe, Building, Ruler, Weight,
  Calendar, Layers, ChevronDown, ChevronRight, Printer, Package, Upload, DollarSign
} from 'lucide-react';
import { currencyAPI, categoryAPI, brandAPI, productGroupAPI, unitAPI, taxRateAPI, specialCodeAPI, type Currency, type Category, type Brand, type ProductGroup, type Unit, type TaxRate, type SpecialCode } from '../../../services/api/masterData';
import { definitionAPI } from '../../../services/api/masterData';
import { MasterDataSelectionModal, type MasterDataItem } from '../../shared/MasterDataSelectionModal';
import { TreeSelectionModal, type TreeDataItem } from '../../shared/TreeSelectionModal';
import { ImageSearchModal } from '../../shared/ImageSearchModal';
import { translate, type Language } from '../../../shared/i18n/translations';
import { useLanguage } from '../../../contexts/LanguageContext';
import { toast } from 'sonner';
import type { Product, ProductVariant, Invoice } from '../../../core/types';
import { ProductLabelPrint } from './ProductLabelPrint';
import { translateToAllLanguages } from '../../../services/translationService';
import { compressImage, formatBytes, getBase64Size } from '../../../utils/imageUtils';
import { imageSearchService } from '../../../services/imageSearchService';

// BARKOD VE VARYANT KOD ÜRETİCİ UTILITY FONKSIYONLARI
const generateEAN13 = (baseCode: string, index: number): string => {
  // EAN13: 13 haneli sayısal barkod
  // Format: [3 hane ülke kodu][4-5 hane üretici kodu][3-4 hane ürün kodu][1 hane check digit]

  // Base code'u sadece sayılara çevir
  const numericBase = baseCode.replace(/\D/g, '').slice(0, 8);
  const paddedBase = numericBase.padStart(8, '0');

  // Index'i 4 haneye tamamla (0001, 0002, vb.)
  const variantCode = String(index).padStart(4, '0');

  // 12 hanelik kodu oluştur
  const code12 = paddedBase + variantCode;

  // Check digit hesapla (EAN13 algoritması)
  let oddSum = 0;
  let evenSum = 0;

  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code12[i]);
    if (i % 2 === 0) {
      oddSum += digit;
    } else {
      evenSum += digit;
    }
  }

  const total = oddSum + (evenSum * 3);
  const checkDigit = (10 - (total % 10)) % 10;

  return code12 + checkDigit;
};

const generateCODE128 = (productCode: string, variantCode: string): string => {
  // CODE128: Alfanumerik barkod - daha esnek format
  // Format: [Ürün Kodu]-[Varyant Kodu]
  const cleanProductCode = productCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
  const cleanVariantCode = variantCode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8);

  return `${cleanProductCode}-${cleanVariantCode}`;
};

const createVariantShortCode = (attributes: Record<string, string>): string => {
  // Varyant özelliklerinden kısa kod oluştur
  // Örnek: {Beden: "Small", Renk: "Beyaz"} -> "S-BYZ"

  const shortCodes: string[] = [];

  Object.entries(attributes).forEach(([key, value]) => {
    const cleanValue = value.trim();

    // Beden/Size için özel kısaltmalar
    if (key === 'Beden' || key === 'Size') {
      // Zaten kısa ise olduğu gibi kullan (S, M, L, XL, vb.)
      if (cleanValue.length <= 3) {
        shortCodes.push(cleanValue.toUpperCase());
      } else {
        // Uzun bedenler için ilk 2 harf (Small -> SM)
        shortCodes.push(cleanValue.slice(0, 2).toUpperCase());
      }
    }
    // Renk için kısaltmalar
    else if (key === 'Renk' || key === 'Color') {
      const colorMap: Record<string, string> = {
        'Beyaz': 'BYZ',
        'Siyah': 'SYH',
        'Kırmızı': 'KRM',
        'Mavi': 'MAV',
        'Yeşil': 'YSL',
        'Sarı': 'SAR',
        'Turuncu': 'TRN',
        'Mor': 'MOR',
        'Pembe': 'PMB',
        'Gri': 'GRI',
        'Kahverengi': 'KHV',
        'Lacivert': 'LAC',
      };

      shortCodes.push(colorMap[cleanValue] || cleanValue.slice(0, 3).toUpperCase());
    }
    // Diğer özellikler için ilk 3 harf
    else {
      shortCodes.push(cleanValue.slice(0, 3).toUpperCase());
    }
  });

  return shortCodes.join('-');
};

interface ProductFormPageProps {
  productId?: string;
  onClose?: () => void;
  onSave?: (product: Product) => void;
}

interface Barcode {
  id: string;
  code: string;
  unit: string; // Hangi birime ait (Adet, Koli, Paket vb.)
  price?: number;
  isPrimary: boolean; // Ana barkod mu?
}

interface VariantAttribute {
  id: string;
  name: string;
  values: string[];
}

interface FormVariant {
  id: string;
  attributes: Record<string, string>;
  barcode: string;
  code: string;
  stock: number;
  purchasePrice: number;
  salePrice: number;
  enabled: boolean;
  purchaseQuantity?: number; // Alış adedi
}

interface UnitConversion {
  id: string;
  fromUnit: string;
  toUnit: string;
  factor: number; // 1 Koli = 12 Adet gibi
}

type TabType = 'genel' | 'fiyat' | 'stok' | 'birim-barkod' | 'varyant' | 'muhasebe' | 'ek-bilgi' | 'resim';

// HAZIR VARYANT PAKETLERİ
const PRESET_ATTRIBUTES = {
  // ── Tekstil / Giyim ───────────────────────────────────────────────
  bedenTextile: {
    name: '👕 Beden (Tekstil — XS→4XL)',
    attributes: [
      { name: 'Beden', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] }
    ]
  },
  sizeColor: {
    name: '👕 Beden + Renk (Standart)',
    attributes: [
      { name: 'Beden', values: ['S', 'M', 'L', 'XL', 'XXL'] },
      { name: 'Renk', values: ['Beyaz', 'Siyah', 'Lacivert', 'Kırmızı', 'Gri'] }
    ]
  },
  sizeColorFull: {
    name: '👕 Beden + Renk (Tam Set)',
    attributes: [
      { name: 'Beden', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
      { name: 'Renk', values: ['Beyaz', 'Siyah', 'Lacivert', 'Kırmızı', 'Mavi', 'Yeşil', 'Gri', 'Kahverengi', 'Pembe', 'Mor'] }
    ]
  },
  bedenShoes: {
    name: '👟 Ayakkabı Bedenleri',
    attributes: [
      { name: 'Beden', values: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] }
    ]
  },
  shoeColorSize: {
    name: '👟 Ayakkabı Beden + Renk',
    attributes: [
      { name: 'Beden', values: ['37', '38', '39', '40', '41', '42', '43', '44'] },
      { name: 'Renk', values: ['Siyah', 'Beyaz', 'Kahverengi', 'Lacivert'] }
    ]
  },
  bedenKids: {
    name: '🧒 Çocuk Bedenleri (Yaş)',
    attributes: [
      { name: 'Yaş', values: ['0-3 Ay', '3-6 Ay', '6-9 Ay', '9-12 Ay', '1-2 Yaş', '2-3 Yaş', '3-4 Yaş', '4-5 Yaş', '5-6 Yaş', '6-7 Yaş', '7-8 Yaş'] }
    ]
  },
  kidsSizeColor: {
    name: '🧒 Çocuk Beden + Renk',
    attributes: [
      { name: 'Beden', values: ['2-3 Yaş', '3-4 Yaş', '4-5 Yaş', '5-6 Yaş', '6-7 Yaş', '7-8 Yaş', '8-9 Yaş', '9-10 Yaş'] },
      { name: 'Renk', values: ['Beyaz', 'Siyah', 'Mavi', 'Kırmızı', 'Sarı'] }
    ]
  },
  // ── Elektronik ────────────────────────────────────────────────────
  electronics: {
    name: '💻 Depolama (Elektronik)',
    attributes: [
      { name: 'Depolama', values: ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'] }
    ]
  },
  phoneColorStorage: {
    name: '📱 Telefon — Renk + Depolama',
    attributes: [
      { name: 'Renk', values: ['Siyah', 'Beyaz', 'Gümüş', 'Mavi', 'Mor'] },
      { name: 'Depolama', values: ['128GB', '256GB', '512GB', '1TB'] }
    ]
  },
  laptopRamStorage: {
    name: '💻 Laptop — RAM + Depolama',
    attributes: [
      { name: 'RAM', values: ['8GB', '16GB', '32GB', '64GB'] },
      { name: 'Depolama', values: ['256GB SSD', '512GB SSD', '1TB SSD', '2TB SSD'] }
    ]
  },
  // ── Gıda & İçecek ─────────────────────────────────────────────────
  beverageSize: {
    name: '🥤 İçecek Hacim',
    attributes: [
      { name: 'Hacim', values: ['200ml', '250ml', '330ml', '500ml', '750ml', '1L', '1.5L', '2L'] }
    ]
  },
  foodWeight: {
    name: '🍽 Gıda Gramaj',
    attributes: [
      { name: 'Ağırlık', values: ['50gr', '100gr', '150gr', '200gr', '250gr', '500gr', '1kg'] }
    ]
  },
  // ── Güzellik & Kozmetik ───────────────────────────────────────────
  beautyVolume: {
    name: '💄 Güzellik Ürün Hacmi',
    attributes: [
      { name: 'Hacim', values: ['30ml', '50ml', '75ml', '100ml', '150ml', '200ml', '250ml', '400ml'] }
    ]
  },
  perfumeSize: {
    name: '🌸 Parfüm Boyutu',
    attributes: [
      { name: 'Boyut', values: ['30ml', '50ml', '75ml', '100ml', '150ml', '200ml'] }
    ]
  },
  // ── Genel ─────────────────────────────────────────────────────────
  colors: {
    name: '🎨 Sadece Renkler',
    attributes: [
      { name: 'Renk', values: ['Beyaz', 'Siyah', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Turuncu', 'Mor', 'Pembe', 'Gri', 'Kahverengi', 'Lacivert'] }
    ]
  },
  capacity: {
    name: '📦 Kapasite / Hacim',
    attributes: [
      { name: 'Kapasite', values: ['250ml', '500ml', '750ml', '1L', '1.5L', '2L', '3L', '5L'] }
    ]
  },
  weight: {
    name: '⚖️ Ağırlık',
    attributes: [
      { name: 'Ağırlık', values: ['100gr', '250gr', '500gr', '1kg', '2kg', '5kg', '10kg', '25kg'] }
    ]
  },
  matSizeColor: {
    name: '🪑 Mobilya Renk + Malzeme',
    attributes: [
      { name: 'Renk', values: ['Beyaz', 'Siyah', 'Ceviz', 'Meşe', 'Gri', 'Bej'] },
      { name: 'Malzeme', values: ['MDF', 'Masif', 'Metal', 'Kumaş', 'Deri'] }
    ]
  },
};

export const ProductFormPage = React.memo(({ productId, onClose, onSave }: ProductFormPageProps) => {
  useEffect(() => {
    console.log('[ProductFormPage] MOUNTED', { productId });
    return () => console.log('[ProductFormPage] UNMOUNTED', { productId });
  }, []);

  const [language] = useState<Language>('tr');
  const products = useProductStore((state) => state.products);
  const addProduct = useProductStore((state) => state.addProduct);
  const updateProduct = useProductStore((state) => state.updateProduct);

  // Voice handle logic
  useEffect(() => {
    const handleVoiceUpdate = (e: any) => {
      const { field, value } = e.detail;
      if (field && value !== undefined) {
        console.log('[VoiceAssistant] Updating field:', field, 'with value:', value);
        handleInputChange(field, value);
        toast.info(`Sesli komutla güncellendi: ${field} = ${value}`);
      }
    };

    window.addEventListener('voiceCommandUpdateForm', handleVoiceUpdate);
    return () => window.removeEventListener('voiceCommandUpdateForm', handleVoiceUpdate);
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('genel');
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  // DETAYLI FORM STATE
  const [formData, setFormData] = useState({
    id: '', // Database UUID
    materialType: 'commercial_goods',
    code: '', // Human readable ERP code
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
    origin: '', // Menşei

    // Özel Kodlar
    specialCode1: '',
    specialCode2: '',
    specialCode3: '',
    specialCode4: '',
    specialCode5: '',
    specialCode6: '',

    // Birimler
    unit: 'Adet',
    unit2: '',
    unit3: '',

    // Vergi
    taxRate: 0,
    taxType: 'TAX',
    withholdingRate: 0,

    // Fiyatlandırma
    currency: 'IQD',
    purchasePrice: 0,
    purchasePriceUSD: 0,
    purchasePriceEUR: 0,
    salePrice: 0,
    salePriceUSD: 0,
    salePriceEUR: 0,

    // Fiyat Listeleri (Nebim tarzı)
    priceList1: 0,
    priceList2: 0,
    priceList3: 0,
    priceList4: 0,
    priceList5: 0,
    priceList6: 0,

    // İskonto
    discount1: 0,
    discount2: 0,
    discount3: 0,

    // Stok
    stock: 0,
    minStock: 0,
    maxStock: 0,
    criticalStock: 0,
    shelfLocation: '', // Raf/Koridor
    warehouseCode: '',

    // Seri/Lot
    serialTracking: false,
    lotTracking: false,
    expiryTracking: false,

    // Boyut/Ağırlık
    width: 0,
    height: 0,
    depth: 0,
    volume: 0,
    weight: 0,
    netWeight: 0,
    grossWeight: 0,

    // Garanti ve Raf Ömrü
    warrantyPeriod: 0, // Ay
    warrantyType: '',
    shelfLife: 0, // Gün

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

    // E-ticaret
    seoTitle: '',
    seoDescription: '',
    metaKeywords: '',
    image_url: '',

    // Durum
    isActive: true,
    isSale: true,
    isPurchase: true,
    isProduction: false,
    isService: false,
    autoCalculateUSD: false,
    customExchangeRate: 0,
  });

  const [usdExchangeRate, setUsdExchangeRate] = useState<number>(1316); // Default 1316 as seen in screenshot

  const [barcodes, setBarcodes] = useState<Barcode[]>([
    { id: '1', code: '', unit: '', price: 0, isPrimary: true }
  ]);

  const [unitConversions, setUnitConversions] = useState<UnitConversion[]>([]);

  const [hasVariants, setHasVariants] = useState(false);
  const [variantAttributes, setVariantAttributes] = useState<VariantAttribute[]>([]);
  const [variants, setVariants] = useState<FormVariant[]>([]);
  const [barcodeType, setBarcodeType] = useState<'EAN13' | 'CODE128'>('EAN13');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<string>(''); // Gruplama tercihi: '' = grupsuz
  const [showLabelPrint, setShowLabelPrint] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const translationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showImageSearchModal, setShowImageSearchModal] = useState(false);

  // Master data states
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [units, setUnits] = useState<MasterDataItem[]>([]);
  const [unitSets, setUnitSets] = useState<UnitSet[]>([]);
  const [showUnitSetPicker, setShowUnitSetPicker] = useState(false);
  const [selectedUnitSetId, setSelectedUnitSetId] = useState<string>('');
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [suppliers, setSuppliers] = useState<MasterDataItem[]>([]);
  const [allSpecialCodes, setAllSpecialCodes] = useState<SpecialCode[]>([]);

  // Selection Modal State
  const [selectionModal, setSelectionModal] = useState<{
    show: boolean;
    title: string;
    type: 'category' | 'brand' | 'productGroup' | 'subGroup' | 'unit' | 'taxRate' | 'model' | 'supplier' | 'specialCode1' | 'specialCode2' | 'specialCode3' | 'specialCode4' | 'specialCode5' | 'specialCode6';
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
        const [currRes, catRes, brandRes, groupRes, unitRes, taxRes, suppRes, specRes, unitSetRes] = await Promise.all([
          currencyAPI.getAll(),
          categoryAPI.getAll(),
          brandAPI.getAll(),
          productGroupAPI.getAll(),
          unitAPI.getAll(),
          taxRateAPI.getAll(),
          definitionAPI.getAll('suppliers'),
          specialCodeAPI.getAll(),
          unitSetAPI.getAll(),
        ]);
        setUnitSets(unitSetRes);
        setCurrencies(currRes);
        setCategories(catRes);
        setBrands(brandRes);
        setProductGroups(groupRes);
        setUnits(unitRes);
        if (unitRes.length > 0) {
          const firstName = unitRes[0].name;
          setFormData(prev => ({
            ...prev,
            unit: unitRes.some((u: any) => u.name === prev.unit) ? prev.unit : firstName,
          }));
          setBarcodes(prev => prev.map(b => ({
            ...b,
            unit: b.unit && unitRes.some((u: any) => u.name === b.unit) ? b.unit : firstName,
          })));
        }
        setTaxRates(taxRes);
        setSuppliers(suppRes);
        setAllSpecialCodes(specRes);
      } catch (error) {
        console.error('Error fetching master data:', error);
      }
    };
    fetchMasterData();
  }, []);

  const openSelectionModal = (type: 'category' | 'brand' | 'productGroup' | 'subGroup' | 'unit' | 'taxRate' | 'model' | 'supplier' | 'specialCode1' | 'specialCode2' | 'specialCode3' | 'specialCode4' | 'specialCode5' | 'specialCode6') => {
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
        title = 'Ürün Grubu Seç';
        items = productGroups;
        currentValue = formData.groupCode || '';
        break;
      case 'subGroup':
        title = 'Alt Grup Seç';
        // Filter sub-groups based on selected parent group
        const selectedGroupId = productGroups.find(g => g.code === formData.groupCode)?.id;
        items = selectedGroupId
          ? productGroups.filter(g => g.parent_id === selectedGroupId)
          : productGroups.filter(g => g.parent_id !== null); // Show all sub-groups if no parent selected
        currentValue = formData.subGroupCode || '';
        break;
      case 'unit':
        title = 'Birim Seç';
        items = units;
        currentValue = formData.unit || '';
        break;
      case 'taxRate':
        title = 'TAX Oranı Seç';
        items = taxRates.map((tr: TaxRate) => ({ id: tr.id, code: `%${tr.rate}`, name: tr.description || `%${tr.rate}` }));
        currentValue = formData.taxRate?.toString() || '';
        break;
      case 'model':
        title = 'Model Seç';
        items = []; // TODO: Load from models master data
        currentValue = formData.model || '';
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
      useTree: type === 'category' || type === 'productGroup' || type === 'subGroup',
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
      case 'subGroup':
        handleInputChange('subGroupCode', item.code);
        break;
      case 'unit':
        handleInputChange('unit', item.name);
        break;
      case 'taxRate':
        const rate = parseFloat(item.code.replace('%', ''));
        handleInputChange('taxRate', rate);
        break;
      case 'model':
        handleInputChange('model', item.name);
        break;
      case 'supplier':
        handleInputChange('supplier', item.name);
        break;
      case 'specialCode1':
      case 'specialCode2':
      case 'specialCode3':
      case 'specialCode4':
      case 'specialCode5':
      case 'specialCode6':
        handleInputChange(selectionModal.type, item.code);
        break;
    }
    setSelectionModal((prev: any) => ({ ...prev, show: false }));
  };

  const handleTreeSelect = (item: TreeDataItem) => {
    switch (selectionModal.type) {
      case 'category':
        handleInputChange('category', item.name);
        handleInputChange('categoryId', item.id);
        handleInputChange('categoryCode', item.code);
        break;
      case 'productGroup':
        handleInputChange('groupCode', item.code);
        break;
      case 'subGroup':
        handleInputChange('subGroupCode', item.code);
        break;
    }
    setSelectionModal((prev: any) => ({ ...prev, show: false }));
  };

  const lastLoadedIdRef = useRef<string | null>(null);

  // Load existing product
  useEffect(() => {
    if (productId && productId !== lastLoadedIdRef.current) {
      const product = products.find((p: Product) => p.id === productId);
      console.log('[ProductFormPage] Loading product data from store:', productId, product);

      if (product) {
        setFormData((prev: any) => ({
          ...prev,
          id: product.id || '',
          code: product.code || '',
          materialType: product.materialType || 'commercial_goods',
          name: product.name || '',
          category: product.category || '',
          categoryId: product.categoryId || '',
          unit: product.unit || 'Adet',
          taxRate: product.taxRate || 0,
          purchasePrice: product.cost || 0,
          salePrice: product.price || 0,
          stock: product.stock || 0,
          // Load multilingual descriptions
          description_tr: product.description_tr || product.name || '',
          description_en: product.description_en || '',
          description_ar: product.description_ar || '',
          description_ku: product.description_ku || '',
          // Load additional metadata if available
          brand: product.brand || '',
          model: product.model || '',
          manufacturer: product.manufacturer || '',
          supplier: product.supplier || '',
          origin: product.origin || '',
          categoryCode: product.categoryCode || '',
          groupCode: product.groupCode || '',
          subGroupCode: product.subGroupCode || '',
          image_url: product.image_url || '',
          specialCode1: product.specialCode1 || '',
          specialCode2: product.specialCode2 || '',
          specialCode3: product.specialCode3 || '',
          specialCode4: product.specialCode4 || '',
          specialCode5: product.specialCode5 || '',
          specialCode6: product.specialCode6 || '',
          priceList1: product.priceList1 || 0,
          priceList2: product.priceList2 || 0,
          priceList3: product.priceList3 || 0,
          priceList4: product.priceList4 || 0,
          priceList5: product.priceList5 || 0,
          priceList6: product.priceList6 || 0,
          salePriceUSD: product.salePriceUSD || 0,
          purchasePriceUSD: product.purchasePriceUSD || 0,
          customExchangeRate: product.customExchangeRate || usdExchangeRate || 0,
          autoCalculateUSD: product.autoCalculateUSD || false,
        }));

        // Restore unitset selection
        setSelectedUnitSetId((product as any).unitsetId || '');

        // Load barcodes from product_barcodes table; fall back to single barcode field
        productUnitsAPI.getBarcodesByProductId(product.id).then(dbBarcodes => {
          if (dbBarcodes.length > 0) {
            setBarcodes(dbBarcodes.map(b => ({
              id: b.id,
              code: b.barcode_code,
              unit: b.unit || product.unit || '',
              isPrimary: b.is_primary,
            })));
          } else if (product.barcode) {
            setBarcodes([{ id: '1', code: product.barcode, unit: product.unit || '', isPrimary: true }]);
          }
        });

        // Load unit conversions from product_unit_conversions table
        productUnitsAPI.getUnitConversionsByProductId(product.id).then(dbConversions => {
          if (dbConversions.length > 0) {
            setUnitConversions(dbConversions.map(c => ({
              id: c.id,
              fromUnit: c.from_unit,
              toUnit: c.to_unit,
              factor: Number(c.factor),
            })));
          }
        });

        // VARYANTLARI YÜKLE - Doğrudan DB'den çek (product store variants içermez!)
        setHasVariants(product.hasVariants || false);
        productVariantAPI.getByProductId(product.id).then(dbVariants => {
          if (dbVariants && dbVariants.length > 0) {
            setHasVariants(true);

            // Varyant özelliklerini tüm attribute alanlarından çıkar
            const attributeMap = new Map<string, Set<string>>();
            dbVariants.forEach((v: ProductVariant & { is_active?: boolean }) => {
              if (v.size) {
                if (!attributeMap.has('Beden')) attributeMap.set('Beden', new Set());
                attributeMap.get('Beden')!.add(v.size);
              }
              if (v.color) {
                if (!attributeMap.has('Renk')) attributeMap.set('Renk', new Set());
                attributeMap.get('Renk')!.add(v.color);
              }
            });

            // Attribute state'ini oluştur
            const loadedAttributes: VariantAttribute[] = [];
            attributeMap.forEach((values, name) => {
              loadedAttributes.push({
                id: Date.now().toString() + Math.random(),
                name,
                values: Array.from(values)
              });
            });
            setVariantAttributes(loadedAttributes);

            // Varyant listesini oluştur
            const loadedVariants: FormVariant[] = dbVariants.map((v: ProductVariant) => ({
              id: v.id,
              attributes: {
                ...(v.size ? { 'Beden': v.size } : {}),
                ...(v.color ? { 'Renk': v.color } : {})
              },
              barcode: v.barcode || '',
              code: v.code || '',
              stock: v.stock || 0,
              purchasePrice: v.cost || product.cost || 0,
              salePrice: v.price || product.price || 0,
              enabled: true
            }));
            setVariants(loadedVariants);
          } else {
            setVariants([]);
            setVariantAttributes([]);
          }
        }).catch(err => {
          console.error('[ProductFormPage] Variant load error:', err);
          setVariants([]);
          setVariantAttributes([]);
        });

        // Mark as loaded
        lastLoadedIdRef.current = productId;
      }
    } else if (!productId) {
      // Clear ref when switching to "Add" mode so that if we return to the same product 
      // later (even with same ID if deleted and recreated, though unlikely here), it works.
      // More importantly, it resets the loading logic state.
      lastLoadedIdRef.current = null;
    }
  }, [productId, products]);

  // Load master data (currencies, etc.)
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const currenciesData = await currencyAPI.getAll();
        setCurrencies(currenciesData);

        // Fetch latest USD exchange rate
        const { exchangeRateAPI } = await import('../../../services/api/masterData');
        const latestRates = await exchangeRateAPI.getLatestRates();
        const usdRate = latestRates.find(r => r.currency_code === 'USD');
        if (usdRate) {
          console.log('[ProductFormPage] USD Exchange Rate loaded:', usdRate.sell_rate);
          setUsdExchangeRate(usdRate.sell_rate);
          
          // Also update formData if customExchangeRate is 0
          setFormData(prev => ({
            ...prev,
            customExchangeRate: prev.customExchangeRate > 0 ? prev.customExchangeRate : usdRate.sell_rate
          }));
        }
      } catch (error) {
        console.error('[ProductFormPage] Failed to load master data:', error);
      }
    };
    loadMasterData();
  }, []);

  // Auto-generate product code
  useEffect(() => {
    if (!productId && !formData.code) {
      // Generate code: PROD-YYYYMMDD-RANDOM
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const generatedCode = `PROD-${dateStr}-${random}`;
      setFormData((prev: any) => ({ ...prev, code: generatedCode }));
    }
  }, [productId]);

  // Auto-translate descriptions when Turkish changes
  useEffect(() => {
    // Clear previous timeout
    if (translationTimeoutRef.current) {
      clearTimeout(translationTimeoutRef.current);
    }

    // Only translate if Turkish description exists and is not empty
    if (formData.description_tr && formData.description_tr.trim() !== '') {
      // Debounce: wait 1 second after user stops typing
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
          toast.success('Çeviri tamamlandı!');
        } catch (error) {
          console.error('Translation failed:', error);
          toast.error('Çeviri başarısız oldu');
        } finally {
          setIsTranslating(false);
        }
      }, 1000); // 1 second debounce
    }

    // Cleanup
    return () => {
      if (translationTimeoutRef.current) {
        clearTimeout(translationTimeoutRef.current);
      }
    };
  }, [formData.description_tr]);



  const handleInputChange = (field: string, value: any) => {
    // Ensure text inputs always have a string value (prevent undefined)
    const safeValue = value === undefined || value === null ? '' : value;
    
    setFormData((prev: any) => {
      const newData = { ...prev, [field]: safeValue };

      // Auto calculation logic
      let effectiveRate = newData.customExchangeRate > 0 ? newData.customExchangeRate : usdExchangeRate;
      
      // IQD Scaling Logic: If currency is IQD and rate is small (e.g., 1.54), scale by 1000
      if (newData.currency === 'IQD' && effectiveRate > 0 && effectiveRate < 10) {
        effectiveRate = effectiveRate * 1000;
      }
      
      if (newData.autoCalculateUSD && effectiveRate > 0) {
        if (field === 'salePriceUSD') {
          newData.salePrice = Math.round(Number(safeValue) * effectiveRate);
        } else if (field === 'purchasePriceUSD') {
          newData.purchasePrice = Math.round(Number(safeValue) * effectiveRate);
        } else if (field === 'customExchangeRate') {
          // If custom rate changed, recalculate both prices based on existing USD values
          // Use effectiveRate which already has scaling applied (e.g. 1.54 -> 1540)
          if (newData.salePriceUSD > 0) newData.salePrice = Math.round(newData.salePriceUSD * effectiveRate);
          if (newData.purchasePriceUSD > 0) newData.purchasePrice = Math.round(newData.purchasePriceUSD * effectiveRate);
        } else if (field === 'autoCalculateUSD' && safeValue === true) {
          // If toggle just turned ON, calculate prices immediately
          if (newData.salePriceUSD > 0) newData.salePrice = Math.round(newData.salePriceUSD * effectiveRate);
          if (newData.purchasePriceUSD > 0) newData.purchasePrice = Math.round(newData.purchasePriceUSD * effectiveRate);
        }
      }

      return newData;
    });

    // Sync salePrice with primary barcode
    if (field === 'salePrice') {
      setTimeout(() => {
        setBarcodes((prev: Barcode[]) => {
          const price = Number(safeValue);
          return prev.map((b: Barcode) => b.isPrimary ? { ...b, price } : b);
        });
      }, 0);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Use the utility to compress and convert to Base64
      // Max 800x800, 70% quality as requested for "best compressed but quality"
      const base64 = await compressImage(file, 800, 800, 0.7);
      handleInputChange('image_url', base64);
      toast.success('Resim yüklendi ve optimize edildi');
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('Resim işlenirken bir hata oluştu');
    }
  };

  const removeImage = () => {
    handleInputChange('image_url', '');
  };

  // Barcode Operations
  const addBarcode = () => {
    setBarcodes((prev: Barcode[]) => [...prev, { id: Date.now().toString(), code: '', unit: formData.unit, price: formData.salePrice, isPrimary: false }]);
  };

  const removeBarcode = (id: string) => {
    if (barcodes.length > 1) {
      setBarcodes((prev: Barcode[]) => prev.filter((b: Barcode) => b.id !== id));
    }
  };

  const addBarcodeWithUnit = (unit: string) => {
    const conversion = unitConversions.find(c => c.fromUnit === unit);
    const multiplier = conversion ? conversion.factor : 1;
    const initialPrice = formData.salePrice * multiplier;
    setBarcodes((prev: Barcode[]) => [...prev, { id: Date.now().toString(), code: '', unit, price: initialPrice, isPrimary: false }]);
  };

  const updateBarcode = (id: string, field: string, value: any) => {
    setBarcodes((prev: Barcode[]) => {
      const updated = prev.map((b: Barcode) => b.id === id ? { ...b, [field]: value } : b);
      const barcode = updated.find(b => b.id === id);

      if (field === 'unit') {
        if (barcode?.isPrimary) {
          handleInputChange('unit', value);
        }
      }

      // If price of primary barcode changes, update global salePrice
      if (field === 'price' && barcode?.isPrimary) {
        setFormData((f: any) => ({ ...f, salePrice: Number(value) }));
      }

      return updated;
    });
  };

  const setPrimaryBarcode = (id: string) => {
    setBarcodes((prev: Barcode[]) => {
      const updated = prev.map((b: Barcode) => ({ ...b, isPrimary: b.id === id }));
      const primary = updated.find(b => b.isPrimary);
      if (primary) {
        handleInputChange('unit', primary.unit);
      }
      return updated;
    });
  };

  // Unit Conversion Operations
  const addUnitConversion = () => {
    setUnitConversions((prev: UnitConversion[]) => [
      ...prev,
      { id: Date.now().toString(), fromUnit: '', toUnit: formData.unit, factor: 1 }
    ]);
  };

  const removeUnitConversion = (id: string) => {
    setUnitConversions((prev: UnitConversion[]) => prev.filter((u: UnitConversion) => u.id !== id));
  };

  const updateUnitConversion = (id: string, field: string, value: any) => {
    setUnitConversions((prev: UnitConversion[]) => {
      const updated = prev.map((u: UnitConversion) =>
        u.id === id ? { ...u, [field]: value } : u
      );

      // If multiplier (factor) changes, we might want to update prices of barcodes using this unit
      // However, the UI already calculates it via (formData.salePrice * conv.factor)
      // if b.price is undefined/0. So we don't strictly need to force an update here
      // unless we want to overwrite existing custom prices.
      
      return updated;
    });
  };

  // Apply a UnitSet as a ready package
  const applyUnitSet = (unitSet: UnitSet) => {
    if (!unitSet.lines || unitSet.lines.length === 0) return;
    const mainLine = unitSet.lines.find(l => l.main_unit);
    if (!mainLine) return;
    const mainUnitName = mainLine.name;

    // Update primary unit
    handleInputChange('unit', mainUnitName);
    setBarcodes(prev => prev.map(b => b.isPrimary ? { ...b, unit: mainUnitName } : b));

    // Build unit conversions from non-main lines
    const newConversions: UnitConversion[] = unitSet.lines
      .filter(l => !l.main_unit)
      .map(l => ({
        id: Date.now().toString() + Math.random(),
        fromUnit: l.name,
        toUnit: mainUnitName,
        factor: l.conv_fact1,
      }));
    setUnitConversions(newConversions);
    setSelectedUnitSetId(unitSet.id);
    setShowUnitSetPicker(false);
  };

  // Variant Operations
  const addAttribute = () => {
    const newAttr: VariantAttribute = {
      id: Date.now().toString(),
      name: '',
      values: []
    };
    setVariantAttributes((prev: VariantAttribute[]) => [...prev, newAttr]);
  };

  const updateAttributeName = (id: string, name: string) => {
    setVariantAttributes((prev: VariantAttribute[]) => prev.map((attr: VariantAttribute) =>
      attr.id === id ? { ...attr, name } : attr
    ));
  };

  const addAttributeValue = (attrId: string, value: string) => {
    if (!value.trim()) return;
    setVariantAttributes((prev: VariantAttribute[]) => prev.map((attr: VariantAttribute) =>
      attr.id === attrId
        ? { ...attr, values: [...attr.values, value.trim()] }
        : attr
    ));
  };

  const removeAttributeValue = (attrId: string, valueIndex: number) => {
    setVariantAttributes((prev: VariantAttribute[]) => prev.map((attr: VariantAttribute) =>
      attr.id === attrId
        ? { ...attr, values: attr.values.filter((_: string, idx: number) => idx !== valueIndex) }
        : attr
    ));
  };

  const removeAttribute = (id: string) => {
    setVariantAttributes((prev: VariantAttribute[]) => prev.filter((attr: VariantAttribute) => attr.id !== id));
  };

  const applyPreset = (presetKey: keyof typeof PRESET_ATTRIBUTES) => {
    const preset = PRESET_ATTRIBUTES[presetKey];
    const newAttributes = preset.attributes.map((attr: any, idx: number) => ({
      id: Date.now().toString() + idx,
      name: attr.name,
      values: [...attr.values]
    }));
    setVariantAttributes(newAttributes);
    setShowPresetMenu(false);
    toast.success(`"${preset.name}" paketi yüklendi`);
  };

  const generateVariantCombinations = () => {
    const activeAttributes = variantAttributes.filter((attr: VariantAttribute) => attr.name && attr.values.length > 0);

    if (activeAttributes.length === 0) {
      toast.error('En az bir özellik ve değer tanımlamalısınız');
      return;
    }

    const combinations: FormVariant[] = [];
    let counter = 1;

    const generate = (index: number, current: Record<string, string>) => {
      if (index === activeAttributes.length) {
        // Mantıklı kısa kod oluştur (S-BYZ, M-SYH gibi)
        const shortCode = createVariantShortCode(current);
        const fullCode = `${formData.code}-${shortCode}`;

        combinations.push({
          id: Date.now().toString() + Math.random(),
          attributes: { ...current },
          barcode: '', // Barkod sonra oluşturulacak
          code: fullCode,
          stock: 0,
          purchasePrice: formData.purchasePrice,
          salePrice: formData.salePrice,
          enabled: true
        });
        counter++;
        return;
      }

      const attr = activeAttributes[index];
      for (const value of attr.values) {
        generate(index + 1, { ...current, [attr.name]: value });
      }
    };

    generate(0, {});
    setVariants(combinations);

    // İlk attribute'u gruplama için otomatik seç
    if (activeAttributes.length > 0) {
      const firstAttr = activeAttributes[0];
      setGroupBy(firstAttr.name);
      setExpandedGroups(new Set(firstAttr.values));
    }

    toast.success(`${combinations.length} varyant oluşturuldu`);
  };

  const updateVariant = (id: string, field: string, value: any) => {
    setVariants(prev => prev.map((v: FormVariant) =>
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const removeVariant = (id: string) => {
    setVariants(prev => prev.filter((v: FormVariant) => v.id !== id));
  };



  const updateVariantPurchasePrice = (id: string, price: number) => {
    setVariants(prev => prev.map((v: FormVariant) => {
      if (v.id === id) {
        return { ...v, purchasePrice: price };
      }
      return v;
    }));
  };

  const applyPriceToAll = () => {
    const price = prompt('Tüm varyantlara uygulanacak alış fiyatı:');
    if (price) {
      setVariants(prev => prev.map((v: FormVariant) => {
        return { ...v, purchasePrice: Number(price) };
      }));
      toast.success('Fiyat tüm varyantlara uygulandı');
    }
  };

  const applyQuantityToAll = () => {
    const quantity = prompt('Tüm varyantlara uygulanacak alış adedi:');
    if (quantity && !isNaN(Number(quantity))) {
      const qty = Number(quantity);
      if (qty < 0) {
        toast.error('Adet negatif olamaz');
        return;
      }
      setVariants(prev => prev.map((v: FormVariant) => {
        if (!v.enabled) return v; // Pasif varyantları atla
        return { ...v, purchaseQuantity: qty };
      }));
      toast.success(`${qty} adet tüm aktif varyantlara uygulandı`);
    }
  };

  const generateBarcodesAuto = () => {
    if (!formData.code) {
      toast.error('Önce ürün kodu girmelisiniz');
      return;
    }

    let counter = 1;
    setVariants(prev => prev.map((v: FormVariant) => {
      if (v.barcode) return v; // Zaten barkodu olanları değiştirme

      let newBarcode = '';
      if (barcodeType === 'EAN13') {
        // EAN13: 13 haneli sayısal barkod
        newBarcode = generateEAN13(formData.code, counter);
      } else {
        // CODE128: Alfanumerik barkod
        const shortCode = createVariantShortCode(v.attributes);
        newBarcode = generateCODE128(formData.code, shortCode);
      }

      counter++;
      return { ...v, barcode: newBarcode };
    }));

    const generatedCount = variants.filter(v => !v.barcode).length;
    toast.success(`${generatedCount} varyant için ${barcodeType} barkod oluşturuldu. Mevcut barkodlar korundu.`);
  };

  const toggleAllVariants = (enabled: boolean) => {
    setVariants(prev => prev.map((v: FormVariant) => ({ ...v, enabled })));
    toast.success(enabled ? 'Tüm varyantlar aktifleştirildi' : 'Tüm varyantlar pasifleştirildi');
  };

  // Varyantları grupla (kullanıcı tercihine göre)
  const getGroupedVariants = () => {
    if (variants.length === 0) return {};

    // Grupsuz göster
    if (!groupBy) {
      return { 'Tüm Varyantlar': variants };
    }

    // Seçilen özelliğe göre grupla
    const grouped: Record<string, FormVariant[]> = {};
    variants.forEach((variant: FormVariant) => {
      const groupKey = variant.attributes[groupBy] || 'Diğer';
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(variant);
    });

    return grouped;
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const toggleAllGroups = (expand: boolean) => {
    if (expand) {
      const allGroups = Object.keys(getGroupedVariants());
      setExpandedGroups(new Set(allGroups));
    } else {
      setExpandedGroups(new Set());
    }
  };

  const handleCreatePurchaseInvoice = async () => {
    // Sadece alış adedi girilmiş varyantları al
    const variantsWithPurchaseQty = variants.filter(v =>
      v.enabled && v.purchaseQuantity && v.purchaseQuantity > 0
    );

    if (variantsWithPurchaseQty.length === 0) {
      toast.error('Lütfen en az bir varyant için alış adedi girin');
      return;
    }

    // Ürün kodu ve adı kontrolü
    if (!formData.code || !formData.description_tr) {
      toast.error('Önce ürün kodunu ve açıklamasını girin');
      return;
    }

    try {
      // ─── ADIM 1: Ürünü önce kaydet (varyantlarla birlikte) ────────────────
      toast.info('Ürün kaydediliyor...', { duration: 1500 });
      await handleSave(false); // Formu kapatma, fatura oluşturma devam edecek

      // ─── ADIM 2: Gerçek ürün kodunu kullanarak fatura oluştur ─────────────
      // NOT: handleSave içinde onClose çağrılabilir, bu yüzden toast'ı burada göster
      const productCode = formData.code;
      const productName = formData.description_tr;

      // Invoice items oluştur - gerçek ürün kodu ile
      const invoiceItems = variantsWithPurchaseQty.map(variant => {
        const variantName = Object.entries(variant.attributes)
          .map(([key, val]) => `${key}: ${val}`)
          .join(', ');

        const quantity = variant.purchaseQuantity!;
        const unitPrice = variant.purchasePrice;
        const total = quantity * unitPrice;

        return {
          code: productCode,              // Gerçek ürün kodu
          productId: productCode,         // Stok güncelleme için
          product_code: productCode,
          description: `${productName} - ${variantName}`,
          productName: `${productName} - ${variantName}`,
          barcode: variant.barcode || '',
          quantity: quantity,
          unitPrice: unitPrice,
          price: unitPrice,
          discount: 0,
          discountPercent: 0,
          tax: 0,
          netAmount: total,
          total: total,
          unit: formData.unit || 'Adet',
          // Varyant bilgisi notlar üzerinden
          notes: variantName,
        };
      });

      // Toplam hesapla
      const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
      const totalItems = invoiceItems.reduce((sum, item) => sum + item.quantity, 0);

      // Fatura numarası oluştur
      const invoiceNo = `PEND-${Date.now()}`;

      // Bekleyen alış faturası oluştur
      const invoice: Invoice = {
        invoice_no: invoiceNo,
        invoice_date: new Date().toISOString(),
        invoice_type: 5, // Alış faturası
        invoice_category: 'Alis' as const,
        supplier_id: undefined,
        supplier_name: 'Bekleyen Tedarikçi',
        total_amount: subtotal,
        subtotal: subtotal,
        discount: 0,
        tax: 0,
        items: invoiceItems,
        firma_id: '1',
        firma_name: 'Ana Firma',
        donem_id: '1',
        donem_name: new Date().getFullYear().toString(),
        status: 'pending',
        notes: `Varyantlı Alış | Ürün: ${productCode} - ${productName}`,
        source: 'invoice' as const
      };

      await invoicesAPI.create(invoice);

      toast.success(
        `✅ ${variantsWithPurchaseQty.length} varyant (${totalItems} adet) alış faturası oluşturuldu. Toplam: ${subtotal.toLocaleString('tr-TR')}`,
        { duration: 5000 }
      );

      // Trigger invoice list refresh
      window.dispatchEvent(new CustomEvent('invoiceCreated', {
        detail: { category: 'Alis', invoiceNo }
      }));

      // Alış adetlerini sıfırla
      setVariants(prev => prev.map(v => ({ ...v, purchaseQuantity: 0 })));
    } catch (error: any) {
      console.error('Alış faturası oluşturma hatası:', error);
      toast.error(error.message || 'Alış faturası oluşturulamadı');
    }
  };

  const handleSave = async (closeAfter = true) => {
    if (!formData.code || !formData.description_tr) {
      toast.error('Ürün kodu ve Türkçe açıklama zorunludur');
      return;
    }

    const primaryBarcode = barcodes[0]?.code || '';

    const productData: Product = {
      id: productId || '', // API will generate UUID for new, use existing for update
      code: formData.code, // SEND THE ACTUAL CODE
      name: formData.description_tr, // Use Turkish description as name
      barcode: primaryBarcode,
      category: formData.categoryId || formData.category, // Send ID to database if available
      price: formData.salePrice,
      cost: formData.purchasePrice,
      stock: formData.stock,
      unit: formData.unit,
      taxRate: formData.taxRate,
      hasVariants: hasVariants,
      materialType: (formData.materialType || 'commercial_goods') as any,
      // Multilingual descriptions
      description_tr: formData.description_tr,
      description_en: formData.description_en,
      description_ar: formData.description_ar,
      description_ku: formData.description_ku,
      // Metadata (will be saved if columns exist)
      brand: formData.brand,
      model: formData.model,
      manufacturer: formData.manufacturer,
      supplier: formData.supplier,
      origin: formData.origin,
      categoryCode: formData.categoryCode,
      groupCode: formData.groupCode,
      subGroupCode: formData.subGroupCode,
      image_url: formData.image_url,
      specialCode1: formData.specialCode1,
      specialCode2: formData.specialCode2,
      specialCode3: formData.specialCode3,
      specialCode4: formData.specialCode4,
      specialCode5: formData.specialCode5,
      specialCode6: formData.specialCode6,
      priceList1: formData.priceList1,
      priceList2: formData.priceList2,
      priceList3: formData.priceList3,
      priceList4: formData.priceList4,
      priceList5: formData.priceList5,
      priceList6: formData.priceList6,
      salePriceUSD: formData.salePriceUSD,
      purchasePriceUSD: formData.purchasePriceUSD,
      customExchangeRate: formData.customExchangeRate,
      autoCalculateUSD: formData.autoCalculateUSD,
      unitsetId: selectedUnitSetId || undefined,
    } as any;

    try {
      // Save product first
      let savedProduct: Product | undefined;
      if (productId) {
        savedProduct = await updateProduct(productId, productData);
      } else {
        savedProduct = await addProduct(productData);
      }

      if (!savedProduct) {
        throw new Error(tm('productSaveError'));
      }

      const dbProductId = savedProduct.id;

      // Save barcodes
      await productUnitsAPI.syncBarcodes(dbProductId, barcodes.map(b => ({
        barcode_code: b.code,
        unit: b.unit,
        sale_price: b.price || (b.isPrimary ? formData.salePrice : 0),
        is_primary: b.isPrimary,
      })));

      // Save unit conversions
      await productUnitsAPI.syncUnitConversions(dbProductId, unitConversions.map(c => ({
        from_unit: c.fromUnit,
        to_unit: c.toUnit,
        factor: c.factor,
      })));

      // Then save variants if product has variants
      if (hasVariants && variants.length > 0) {
        const variantsToSave: Omit<ProductVariant, 'id'>[] = variants
          .filter((v: FormVariant) => v.enabled)
          .map((v: FormVariant) => ({
            code: v.code,
            size: v.attributes['Beden'] || v.attributes['Yaş'] || v.attributes['Kapasite'] || v.attributes['Ağırlık'] || '',
            color: v.attributes['Renk'] || '',
            stock: v.stock,
            barcode: v.barcode,
            price: v.salePrice,
            cost: v.purchasePrice, // Her varyantın kendi alış fiyatı
          }));

        // Sync variants (delete old ones and create new ones)
        await productVariantAPI.syncVariants(dbProductId, variantsToSave);
      } else if (productId) {
        // If product no longer has variants, delete all variants
        await productVariantAPI.deleteByProductId(productId);
      }

      toast.success(productId ? tm('materialCardUpdated') : tm('materialCardCreated'));

      if (closeAfter) {
        if (onSave && savedProduct) {
          onSave(savedProduct);
        }
        if (onClose) {
          onClose();
        }
      }
    } catch (error) {
      console.error('[ProductFormPage] Save error:', error);
      toast.error(tm('saveError'));
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, barcodes, variants, hasVariants]);

  const { tm } = useLanguage();

  const tabs = [
    { id: 'genel' as TabType, label: tm('general'), icon: Package },
    { id: 'fiyat' as TabType, label: tm('price'), icon: Calculator },
    { id: 'stok' as TabType, label: tm('stock'), icon: Layers },
    { id: 'birim-barkod' as TabType, label: tm('unitBarcode'), icon: BarcodeIcon },
    { id: 'varyant' as TabType, label: tm('variant'), icon: Tag },
    { id: 'muhasebe' as TabType, label: tm('accounting'), icon: FileText },
    { id: 'ek-bilgi' as TabType, label: tm('additionalInfo'), icon: Globe },
    { id: 'resim' as TabType, label: tm('image'), icon: ImageIcon },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-gray-900">
            {productId ? tm('editMaterialCard') : tm('newMaterialCard')}
          </span>
          {formData.code && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
              {formData.code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
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

          {/* GENEL SEKME - DETAYLI */}
          {activeTab === 'genel' && (
            <div className="space-y-3">
              {/* Temel Bilgiler */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('basicInformation')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('cardType')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <select
                      value={formData.materialType || 'commercial_goods'}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleInputChange('materialType', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="commercial_goods">{tm('commercialGoods')}</option>
                      <option value="mixed_parcel">{tm('mixedParcel')}</option>
                      <option value="deposit_goods">{tm('depositGoods')}</option>
                      <option value="fixed_asset">{tm('fixedAsset')}</option>
                      <option value="raw_material">{tm('rawMaterial')}</option>
                      <option value="semi_finished">{tm('semiFinished')}</option>
                      <option value="consumable">{tm('consumable')}</option>
                    </select>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('materialCode')} *</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={formData.code || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('code', e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-blue-700"
                        placeholder={tm('autoGeneratedOrManual')}
                      />
                      {!formData.code && (
                        <button
                          onClick={() => {
                            const date = new Date();
                            const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
                            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
                            const generatedCode = `PROD-${dateStr}-${random}`;
                            handleInputChange('code', generatedCode);
                            toast.info(tm('codeGenerated'));
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Kod Üret"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('description_tr', e.target.value)}
                      placeholder={tm('mainDescriptionPlaceholder')}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      disabled={isTranslating}
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('description')} (English)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.description_en || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('description_en', e.target.value)}
                      placeholder={tm('autoTranslatedFromTurkish')}
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('description_ar', e.target.value)}
                      placeholder={tm('autoTranslatedFromTurkish')}
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('description_ku', e.target.value)}
                      placeholder={tm('autoTranslatedFromTurkish')}
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
                  <span className="text-xs text-gray-700">{tm('categoryAndClassification')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('category')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.category || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('category', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => openSelectionModal('category')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                      title={tm('selectCategory')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('categoryCode')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.categoryCode || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('categoryCode', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('groupCode')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.groupCode || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('groupCode', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => openSelectionModal('productGroup')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                      title={tm('selectGroup')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('subGroupCode')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.subGroupCode || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('subGroupCode', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => openSelectionModal('subGroup')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                      title={tm('selectSubGroup')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Marka ve Üretici */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('brandAndManufacturerInfo')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('brand')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.brand || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('brand', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => openSelectionModal('brand')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                      title={tm('selectBrand')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('model')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.model || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('model', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => openSelectionModal('model')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                      title={tm('selectModel')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('manufacturer')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.manufacturer || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('manufacturer', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('supplier')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                    <input
                      type="text"
                      value={formData.supplier || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('supplier', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={tm('multiSelectSearchIcon')}
                    />
                    <button
                      onClick={() => openSelectionModal('supplier')}
                      className="px-2 text-gray-600 hover:text-gray-800 transition-colors"
                      title={tm('selectSupplierMulti')}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('origin')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.origin || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('origin', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={tm('originPlaceholder')}
                    />
                  </div>

                </div>
              </div>

              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('specialCodes')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  {[1, 2, 3, 4, 5, 6].map((num: number) => (
                    <div key={`special-code-${num}`} className="contents">
                      <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                        <label className="text-xs text-gray-700">{tm('specialCode')} {num}</label>
                      </div>
                      <div className="col-span-3 bg-white px-2 py-1.5 flex gap-1">
                        <input
                          type="text"
                          value={String(formData[`specialCode${num}` as keyof typeof formData] || '')}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(`specialCode${num}`, e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => openSelectionModal(`specialCode${num}` as any)}
                          className="px-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title={`${tm('specialCode')} ${num} ${tm('select')}`}
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {productId && (
                    <div className="contents">
                      <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                        <label className="text-xs text-blue-600 font-bold">{tm('systemUUID')}</label>
                      </div>
                      <div className="col-span-9 bg-white px-2 py-1.5 flex items-center gap-1">
                        <input
                          type="text"
                          value={formData.id || ''}
                          readOnly
                          className="flex-1 px-2 py-1 border border-gray-200 text-[10px] bg-gray-50 text-gray-500 font-mono focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(formData.id);
                            toast.success(tm('uuidCopied'));
                          }}
                          className="p-1 hover:bg-gray-100 rounded text-blue-600"
                          title={tm('copy')}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Durum */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('status')}</span>
                </div>
                <div className="p-3 grid grid-cols-5 gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('isActive', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('active')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isSale}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('isSale', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('suitableForSale')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isPurchase}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('isPurchase', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('suitableForPurchase')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isProduction}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('isProduction', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('suitableForProduction')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isService}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('isService', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('service')}</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* FİYAT SEKME - DETAYLI */}
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
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleInputChange('currency', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="IQD">IQD - {tm('iraqiDinar')}</option>
                      <option value="TL">TL - {tm('turkishLira')}</option>
                      <option value="USD">USD - {tm('usDollar')}</option>
                      <option value="EUR">EUR - {tm('euro')}</option>
                      <option value="GBP">GBP - {tm('britishPound')}</option>
                    </select>
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                    <label className="text-xs text-gray-700">{tm('taxType')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <select
                      value={formData.taxType || 'TAX'}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleInputChange('taxType', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="TAX">TAX</option>
                      <option value="ÖTV">ÖTV</option>
                      <option value="TAX+ÖTV">TAX+ÖTV</option>
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
                      value={formData.purchasePrice || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('purchasePrice', Number(e.target.value))}
                      readOnly={formData.autoCalculateUSD}
                      className={`w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${formData.autoCalculateUSD ? 'bg-blue-50 cursor-not-allowed text-blue-700' : ''}`}
                    />
                    {formData.autoCalculateUSD && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold flex items-center gap-1 bg-blue-50/50 px-1 rounded">
                        <DollarSign className="w-2.5 h-2.5" /> {tm('auto')}
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('taxRate', Number(e.target.value))}
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
                      value={formData.salePrice || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('salePrice', Number(e.target.value))}
                      readOnly={formData.autoCalculateUSD}
                      className={`w-full px-2 py-1 border border-green-300 text-xs text-right bg-green-50 font-bold focus:outline-none focus:ring-1 focus:ring-green-500 ${formData.autoCalculateUSD ? 'text-blue-700' : ''}`}
                    />
                    {formData.autoCalculateUSD && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold flex items-center gap-1 bg-blue-50/50 px-1 rounded border border-blue-200">
                        <DollarSign className="w-2.5 h-2.5" /> {tm('auto')}
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('withholdingRate', Number(e.target.value))}
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
                      value={formData.purchasePrice > 0
                        ? ((formData.salePrice - formData.purchasePrice) / formData.purchasePrice * 100).toFixed(2)
                        : '0.00'}
                      readOnly
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right bg-gray-100 text-gray-600 font-medium"
                    />
                  </div>
                  <div className="col-span-6 bg-gray-50 flex items-center px-4">
                    <span className="text-[10px] text-gray-400 italic">{tm('profitMarginNote')}</span>
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
                      title="Otomatik Kur Hesapla"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchasePriceUSD || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('purchasePriceUSD', Number(e.target.value))}
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
                        title="Otomatik Kur Hesapla"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.salePriceUSD || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('salePriceUSD', Number(e.target.value))}
                      className={`w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${formData.autoCalculateUSD ? 'bg-blue-50' : ''}`}
                    />
                  </div>

                  {/* Row 2: Özel Kur */}
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center justify-between">
                    <label className="text-xs text-gray-700">{tm('customExchangeRate')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.customExchangeRate || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('customExchangeRate', Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-6 bg-gray-50 px-2 py-1.5 flex items-center">
                    <span className="text-[10px] text-gray-400 italic">Boş veya 0 ise sistem kuru ({usdExchangeRate}) baz alınır. MarketPOS ve Faturalarda dinamik hesaplanır.</span>
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('purchasePrice')} (EUR)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.purchasePriceEUR || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('purchasePriceEUR', Number(e.target.value))}
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
                      value={formData.salePriceEUR || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('salePriceEUR', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Fiyat Listeleri (Nebim Style) */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('priceList')}s</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  {[1, 2, 3, 4, 5, 6].map((num: number) => (
                    <div key={`price-list-${num}`} className="contents">
                      <div className="col-span-3 bg-gray-100 px-2 py-1.5 flex items-center">
                        <label className="text-xs text-gray-700">{tm('priceList')} {num}</label>
                      </div>
                      <div className="col-span-3 bg-white px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={Number(formData[`priceList${num}` as keyof typeof formData] || 0)}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(`priceList${num}`, Number(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* İskonto */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('discountRates')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('discount')} 1 %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount1}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('discount1', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('discount')} 2 %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount2}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('discount2', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('discount')} 3 %</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.discount3}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('discount3', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-6"></div>
                </div>
              </div>
            </div>
          )}

          {/* STOK SEKME - DETAYLI */}
          {activeTab === 'stok' && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('stockInformation')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('currentStock')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      value={formData.stock || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('stock', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('minStock')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      value={formData.minStock || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('minStock', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('maxStock')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      value={formData.maxStock || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('maxStock', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('criticalStock')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      value={formData.criticalStock || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('criticalStock', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('warehouseCode')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.warehouseCode || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('warehouseCode', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('shelfLocation')}</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="text"
                      value={formData.shelfLocation || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('shelfLocation', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="A-12-3"
                    />
                  </div>
                </div>
              </div>

              {/* Seri/Lot Takibi */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('serialLotTracking')}</span>
                </div>
                <div className="p-3 grid grid-cols-3 gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.serialTracking}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('serialTracking', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('serialTracking')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.lotTracking}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('lotTracking', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('lotTracking')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.expiryTracking}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('expiryTracking', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-xs text-gray-700">{tm('expiryTracking')}</span>
                  </label>
                </div>
              </div>

              {/* Boyut ve Ağırlık */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700">{tm('physicalProperties')}</span>
                </div>
                <div className="grid grid-cols-12 gap-px bg-gray-300">
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('width')} (cm)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.width || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('width', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('height')} (cm)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.height || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('height', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('depth')} (cm)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.depth || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('depth', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('volume')} (cm³)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.volume || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('volume', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('weight')} (kg)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.weight || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('weight', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-3 bg-gray-100 px-2 py-1.5">
                    <label className="text-xs text-gray-700">{tm('netWeight')} (kg)</label>
                  </div>
                  <div className="col-span-3 bg-white px-2 py-1.5">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.netWeight || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('netWeight', Number(e.target.value))}
                      className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BİRİM SEKME - BİRLEŞTİRİLMİŞ DİZAYN */}
          {activeTab === 'birim-barkod' && (
            <div className="space-y-4">
              {/* Birleştirilmiş Birim ve Barkod Listesi */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-1 bg-gray-100 border-b border-gray-300 flex items-center justify-between">
                  <span className="text-[11px] text-gray-700 font-bold">{tm('unitsAndBarcodeList')}</span>
                  <div className="flex gap-2">
                    {/* Hazır Paket */}
                    <div className="relative">
                      <button
                        onClick={() => setShowUnitSetPicker(v => !v)}
                        className="flex items-center gap-1 px-3 py-0.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                      >
                        <Package className="w-3 h-3" />
                        {tm('applyUnitSet') || 'Hazır Paket'}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showUnitSetPicker && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowUnitSetPicker(false)} />
                          <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded shadow-lg min-w-[180px] max-h-60 overflow-y-auto">
                          {unitSets.length === 0 ? (
                            <div className="px-3 py-2 text-[11px] text-gray-400">Henüz birim seti yok</div>
                          ) : (
                            unitSets.map(us => (
                              <button
                                key={us.id}
                                onClick={() => applyUnitSet(us)}
                                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-purple-50 hover:text-purple-700 border-b border-gray-100 last:border-0"
                              >
                                <div className="font-medium">{us.name}</div>
                                {us.lines && us.lines.length > 0 && (
                                  <div className="text-gray-400 mt-0.5">
                                    {us.lines.map(l => `${l.name}${!l.main_unit ? ` (×${l.conv_fact1})` : ''}`).join(' · ')}
                                  </div>
                                )}
                              </button>
                            ))
                          )}
                        </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={addBarcode}
                      className="flex items-center gap-1 px-3 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {tm('addBarcode')}
                    </button>
                    <button
                      onClick={addUnitConversion}
                      className="flex items-center gap-1 px-3 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      {tm('addNewUnitConversion')}
                    </button>
                  </div>
                </div>
                <div className="p-0 overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 w-10 text-center text-[10px]">{tm('main')}</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 text-[10px]">{tm('unit')}</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 w-16 text-center text-[10px]">{tm('multiplier')}</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 w-24 text-[10px]">{tm('baseUnit')}</th>
                        <th className="px-2 py-1.5 text-left font-semibold text-gray-600 border-r border-gray-200 text-[10px]">{tm('barcode')}</th>
                        <th className="px-2 py-1.5 text-center font-semibold text-gray-600 w-10 text-[10px]">{tm('delete')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Ana Birim Barkodları */}
                      {barcodes.filter(b => b.unit === formData.unit).map((b, idx) => (
                        <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-2 py-1 text-center border-r border-gray-200">
                            <button
                              onClick={() => setPrimaryBarcode(b.id)}
                              className={`w-3.5 h-3.5 mx-auto rounded border flex items-center justify-center transition-colors ${b.isPrimary ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                            >
                              {b.isPrimary && <Check className="w-2.5 h-2.5 text-white" />}
                            </button>
                          </td>
                          <td className="px-2 py-1 border-r border-gray-200 bg-blue-50/30">
                            <select
                              value={formData.unit}
                              onChange={(e) => {
                                const newUnit = e.target.value;
                                handleInputChange('unit', newUnit);
                                // Update all barcodes that were using the old unit to use the new unit
                                setBarcodes(prev => prev.map(bc => bc.unit === formData.unit ? { ...bc, unit: newUnit } : bc));
                              }}
                              className="w-full bg-transparent border-0 font-bold text-blue-800 text-[11px] focus:ring-0"
                            >
                              {units.map(u => (
                                <option key={u.id} value={u.name}>{u.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-gray-200 text-gray-400">1</td>
                          <td className="px-2 py-1 text-gray-400 border-r border-gray-200 text-center">-</td>
                          <td className="px-2 py-1 border-r border-gray-200">
                            <div className="flex items-center gap-1">
                              <BarcodeIcon className="w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={b.code}
                                onChange={(e) => updateBarcode(b.id, 'code', e.target.value)}
                                className="w-full px-1 py-0.5 border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-400 text-[11px]"
                                placeholder={tm('enterBarcode')}
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1 text-center">
                            {barcodes.length > 1 && (
                              <button onClick={() => removeBarcode(b.id)} className="text-red-500 hover:text-red-700">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* Çevrim Birimleri */}
                      {unitConversions.map((conv) => {
                        const convBcs = barcodes.filter(b => b.unit === conv.fromUnit);

                        if (convBcs.length === 0) {
                          return (
                            <tr key={conv.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-2 py-1 border-r border-gray-200">-</td>
                              <td className="px-2 py-1 border-r border-gray-200">
                                <select
                                  value={conv.fromUnit}
                                  onChange={(e) => updateUnitConversion(conv.id, 'fromUnit', e.target.value)}
                                  className="w-full bg-transparent border-0 font-medium text-[11px] focus:ring-0"
                                >
                                  <option value="">{tm('select')}...</option>
                                  {units.map(u => (
                                    <option key={u.id} value={u.name}>{u.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1 border-r border-gray-200">
                                <input
                                  type="number"
                                  value={conv.factor}
                                  onChange={(e) => updateUnitConversion(conv.id, 'factor', Number(e.target.value))}
                                  className="w-full text-center bg-transparent border-0 font-bold text-green-700 text-[11px]"
                                />
                              </td>
                              <td className="px-2 py-1 border-r border-gray-200 text-center text-gray-500 text-[11px]">
                                <select
                                  value={conv.toUnit}
                                  onChange={(e) => updateUnitConversion(conv.id, 'toUnit', e.target.value)}
                                  className="w-full bg-transparent border-0 text-center text-gray-500 text-[11px] focus:ring-0"
                                >
                                  {units.map(u => (
                                    <option key={u.id} value={u.name}>{u.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1 border-r border-gray-200">
                                <button
                                  onClick={() => addBarcodeWithUnit(conv.fromUnit)}
                                  className="text-[10px] text-blue-600 hover:underline px-1"
                                >
                                  + {tm('addBarcode')}
                                </button>
                              </td>
                              <td className="px-2 py-1 border-r border-gray-200">
                                <div className="text-right text-gray-400 text-[11px]">
                                  {(formData.salePrice * conv.factor).toFixed(2)}
                                </div>
                              </td>
                              <td className="px-2 py-1 text-center">
                                <button onClick={() => removeUnitConversion(conv.id)} className="text-red-500">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        return convBcs.map((b, bIdx) => (
                          <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-2 py-1 text-center border-r border-gray-200">
                              <button
                                onClick={() => setPrimaryBarcode(b.id)}
                                className={`w-3.5 h-3.5 mx-auto rounded border flex items-center justify-center transition-colors ${b.isPrimary ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                              >
                                {b.isPrimary && <Check className="w-2.5 h-2.5 text-white" />}
                              </button>
                            </td>
                            <td className="px-2 py-1 border-r border-gray-200">
                              {bIdx === 0 ? (
                                <select
                                  value={conv.fromUnit}
                                  onChange={(e) => updateUnitConversion(conv.id, 'fromUnit', e.target.value)}
                                  className="w-full bg-transparent border-0 font-medium text-[11px] focus:ring-0"
                                >
                                  {units.map(u => (
                                    <option key={u.id} value={u.name}>{u.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-gray-300 ml-2">↳</span>
                              )}
                            </td>
                            <td className="px-2 py-1 text-center border-r border-gray-200">
                              {bIdx === 0 ? (
                                <input
                                  type="number"
                                  value={conv.factor}
                                  onChange={(e) => updateUnitConversion(conv.id, 'factor', Number(e.target.value))}
                                  className="w-full text-center bg-transparent border-0 font-bold text-green-700 text-[11px]"
                                />
                              ) : '-'}
                            </td>
                            <td className="px-2 py-1 text-gray-500 border-r border-gray-200 text-center text-[11px]">
                              {bIdx === 0 ? (
                                <select
                                  value={conv.toUnit}
                                  onChange={(e) => updateUnitConversion(conv.id, 'toUnit', e.target.value)}
                                  className="w-full bg-transparent border-0 text-center text-gray-500 text-[11px] focus:ring-0"
                                >
                                  {units.map(u => (
                                    <option key={u.id} value={u.name}>{u.name}</option>
                                  ))}
                                </select>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-1 border-r border-gray-200">
                              <div className="flex items-center gap-1">
                                <BarcodeIcon className="w-3.5 h-3.5 text-gray-400" />
                                <input
                                  type="text"
                                  value={b.code}
                                  onChange={(e) => updateBarcode(b.id, 'code', e.target.value)}
                                  className="w-full px-1 py-0.5 border-0 bg-transparent text-[11px]"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button onClick={() => removeBarcode(b.id)} className="text-red-500">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ));
                      })}

                      {/* Tanımlanmamış Birimlerin Barkodları */}
                      {barcodes.filter(b => b.unit !== formData.unit && !unitConversions.some(c => c.fromUnit === b.unit)).map(b => (
                        <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50 bg-orange-50/10">
                          <td className="px-2 py-1 text-center border-r border-gray-200">-</td>
                          <td className="px-2 py-1 border-r border-gray-200">
                            <select
                              value={b.unit}
                              onChange={(e) => updateBarcode(b.id, 'unit', e.target.value)}
                              className="w-full bg-transparent border-0 text-orange-700 font-medium text-[11px]"
                            >
                              <option value={b.unit}>{b.unit}</option>
                              {unitConversions.map(c => <option key={c.id} value={c.fromUnit}>{c.fromUnit}</option>)}
                              {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1 text-center border-r border-gray-200 text-gray-400">?</td>
                          <td className="px-2 py-1 text-gray-400 border-r border-gray-200 text-center">-</td>
                          <td className="px-2 py-1 border-r border-gray-200">
                            <div className="flex items-center gap-1">
                              <BarcodeIcon className="w-3.5 h-3.5 text-gray-400" />
                              <input
                                type="text"
                                value={b.code}
                                onChange={(e) => updateBarcode(b.id, 'code', e.target.value)}
                                className="w-full px-1 py-0.5 border-0 bg-transparent text-[11px]"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1 border-r border-gray-200">
                            <input
                              type="number"
                              step="0.01"
                              value={b.price || 0}
                              onChange={(e) => updateBarcode(b.id, 'price', Number(e.target.value))}
                              className="w-full bg-transparent border-0 text-right font-bold text-orange-800 text-[11px] focus:bg-white focus:ring-1 focus:ring-blue-400"
                            />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button onClick={() => removeBarcode(b.id)} className="text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VARYANT SEKME - DAHA ÖNCE YAPILMIŞTI */}
          {activeTab === 'varyant' && (
            <div className="space-y-3">
              {/* Kaydet Uyarısı */}
              <div className="bg-amber-50 border border-amber-300 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4 text-amber-600" />
                  <span className="text-xs text-amber-800 font-medium">
                    Varyantları kaybetmemek için kaydedin
                  </span>
                </div>
                <button
                  onClick={() => handleSave()}
                  className="flex items-center gap-1 px-4 py-1.5 bg-green-600 text-white rounded text-xs font-bold hover:bg-green-700 transition-colors shadow"
                >
                  <Save className="w-3.5 h-3.5" />
                  Kaydet (Varyantlarla)
                </button>
              </div>

              <div className="bg-white border border-gray-300 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHasVariants(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-700">{tm('thisIsAVariantProduct')}</span>
                </label>
              </div>

              {hasVariants && (
                <div>
                  <div className="bg-white border border-gray-300">
                    <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 flex items-center justify-between">
                      <span className="text-xs text-gray-700">{tm('attributeDefinitions')}</span>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <button
                            onClick={() => setShowPresetMenu(!showPresetMenu)}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            <Download className="w-3 h-3" />
                            {tm('presetPackage')}
                          </button>

                          {showPresetMenu && (
                            <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-300 rounded shadow-lg z-10">
                              <div className="py-1">
                                {Object.entries(PRESET_ATTRIBUTES).map(([key, preset]) => (
                                  <button
                                    key={key}
                                    onClick={() => applyPreset(key as any)}
                                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 transition-colors"
                                  >
                                    {preset.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={addAttribute}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          <Plus className="w-3 h-3" />
                          {tm('addAttribute')}
                        </button>
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      {variantAttributes.map((attr: VariantAttribute) => (
                        <div key={attr.id} className="border border-gray-200 bg-gray-50 p-2">
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={attr.name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAttributeName(attr.id, e.target.value)}
                              className="w-32 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder={tm('attributeName')}
                            />
                            <input
                              type="text"
                              placeholder={tm('valueEnterToAdd')}
                              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                if (e.key === 'Enter') {
                                  const input = e.target as HTMLInputElement;
                                  addAttributeValue(attr.id, input.value);
                                  input.value = '';
                                }
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => removeAttribute(attr.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {attr.values.map((value: string, idx: number) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                              >
                                {value}
                                <button
                                  onClick={() => removeAttributeValue(attr.id, idx)}
                                  className="hover:text-blue-900"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {variantAttributes.length > 0 && (
                      <div className="px-3 pb-3">
                        <button
                          onClick={generateVariantCombinations}
                          className="w-full px-3 py-2 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                        >
                          <Tag className="w-3.5 h-3.5 inline mr-1" />
                          {tm('generateVariants')} ({variantAttributes.reduce((acc, attr) => acc * (attr.values.length || 1), 1)} {tm('combinations')})
                        </button>
                      </div>
                    )}
                  </div>

                  {variants.length > 0 && (
                    <div className="bg-white border border-gray-300">
                      <div className="px-3 py-2 bg-gray-100 border-b border-gray-300">
                        {/* Üst Satır - Aksiyon Butonları */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-700">
                            {tm('variantList')} ({variants.filter(v => v.enabled).length}/{variants.length} {tm('active')})
                          </span>
                          <div className="flex items-center gap-2">
                            {/* Barkod İşlemleri */}
                            <button
                              onClick={generateBarcodesAuto}
                              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                            >
                              <BarcodeIcon className="w-3.5 h-3.5" />
                              {tm('generateBarcode')}
                            </button>

                            {/* Ayırıcı */}
                            <div className="h-6 w-px bg-gray-300" />

                            {/* Fiyat ve Adet */}
                            <button
                              onClick={applyPriceToAll}
                              className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 flex items-center gap-1"
                            >
                              <Tag className="w-3.5 h-3.5" />
                              {tm('bulkPurchasePrice')}
                            </button>
                            <button
                              onClick={applyQuantityToAll}
                              className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 flex items-center gap-1"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              {tm('bulkQuantity')}
                            </button>

                            {/* Ayırıcı */}
                            <div className="h-6 w-px bg-gray-300" />

                            {/* Alış Faturası */}
                            <button
                              onClick={handleCreatePurchaseInvoice}
                              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
                            >
                              <Package className="w-3.5 h-3.5" />
                              {tm('createPurchaseInvoice')}
                            </button>

                            {/* Ayırıcı */}
                            <div className="h-6 w-px bg-gray-300" />

                            {/* Diğer İşlemler */}
                            <button
                              onClick={() => setShowLabelPrint(true)}
                              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              {tm('printLabel')}
                            </button>
                            <button
                              onClick={() => toggleAllVariants(true)}
                              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              {tm('activateAll')}
                            </button>
                            <button
                              onClick={() => toggleAllVariants(false)}
                              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              {tm('deactivateAll')}
                            </button>
                          </div>
                        </div>

                        {/* Alt Satır - Gruplama ve Görünüm Kontrolleri */}
                        <div className="flex items-center gap-3">
                          {/* Gruplama */}
                          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-300">
                            <Layers className="w-3 h-3 text-gray-600" />
                            <select
                              value={groupBy}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                setGroupBy(e.target.value);
                                // Yeni gruplamaya göre tüm grupları aç
                                if (e.target.value && variants.length > 0) {
                                  const uniqueValues = new Set(
                                    variants.map((v: FormVariant) => v.attributes[e.target.value] || tm('other'))
                                  );
                                  setExpandedGroups(new Set(uniqueValues));
                                } else {
                                  setExpandedGroups(new Set([tm('allVariants')]));
                                }
                              }}
                              className="text-xs border-0 bg-transparent focus:outline-none pr-6"
                            >
                              <option value="">{tm('showWithoutGrouping')}</option>
                              {variantAttributes.map((attr: VariantAttribute) => (
                                <option key={attr.id} value={attr.name}>
                                  {attr.name}'e {tm('groupBy')}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Barkod Tipi */}
                          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-gray-300">
                            <BarcodeIcon className="w-3 h-3 text-gray-600" />
                            <select
                              value={barcodeType}
                              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBarcodeType(e.target.value as 'EAN13' | 'CODE128')}
                              className="text-xs border-0 bg-transparent focus:outline-none pr-6"
                            >
                              <option value="EAN13">EAN13 (13 {tm('digits')})</option>
                              <option value="CODE128">CODE128 ({tm('alphanumeric')})</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                        {(() => {
                          const groupedVariants = getGroupedVariants();
                          const groups = Object.keys(groupedVariants);

                          return (
                            <>
                              {/* Tümünü Genişlet/Daralt Butonları - sadece gerçek gruplama varsa */}
                              {groupBy && groups.length > 1 && (
                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex gap-2">
                                  <button
                                    onClick={() => toggleAllGroups(true)}
                                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                  >
                                    {tm('expandAll')}
                                  </button>
                                  <button
                                    onClick={() => toggleAllGroups(false)}
                                    className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                                  >
                                    {tm('collapseAll')}
                                  </button>
                                </div>
                              )}

                              {groups.map((groupKey: string) => {
                                const groupVariants = groupedVariants[groupKey];
                                const isExpanded = expandedGroups.has(groupKey);
                                const groupEnabledCount = groupVariants.filter((v: FormVariant) => v.enabled).length;
                                const showGroupHeader = groupBy && groups.length > 1; // Grup başlığı göster?

                                return (
                                  <div key={groupKey} className="border-b border-gray-200">
                                    {/* Grup Başlığı - sadece gruplama aktifse */}
                                    {showGroupHeader && (
                                      <div
                                        onClick={() => toggleGroup(groupKey)}
                                        className="px-3 py-2 bg-gradient-to-r from-blue-50 to-blue-100 cursor-pointer hover:from-blue-100 hover:to-blue-150 flex items-center justify-between"
                                      >
                                        <div className="flex items-center gap-2">
                                          {isExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-blue-600" />
                                          ) : (
                                            <ChevronRight className="w-4 h-4 text-blue-600" />
                                          )}
                                          <span className="text-blue-900">{groupKey}</span>
                                          <span className="px-2 py-0.5 bg-blue-200 text-blue-800 rounded text-xs">
                                            {groupEnabledCount}/{groupVariants.length} {tm('active')}
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    {/* Grup İçeriği - grupsuzda her zaman göster, grupluda isExpanded ise göster */}
                                    {(!showGroupHeader || isExpanded) && (
                                      <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-gray-300 sticky top-0">
                                          <tr>
                                            <th className="px-2 py-1.5 text-center text-gray-600">✓</th>
                                            <th className="px-2 py-1.5 text-left text-gray-600">{tm('variantCode')}</th>
                                            <th className="px-2 py-1.5 text-left text-gray-600">{tm('variantAttributes')}</th>
                                            <th className="px-2 py-1.5 text-left text-gray-600">{tm('barcode')} *</th>
                                            <th className="px-2 py-1.5 text-right text-gray-600">{tm('purchasePrice')}</th>

                                            <th className="px-2 py-1.5 text-right text-gray-600">{tm('salePrice')}</th>
                                            <th className="px-2 py-1.5 text-right text-gray-600 bg-orange-50">{tm('purchaseQuantity')}</th>
                                            <th className="px-2 py-1.5 text-right text-gray-600">{tm('stock')}</th>
                                            <th className="px-2 py-1.5"></th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                          {groupVariants.map((variant: FormVariant) => (
                                            <tr key={variant.id} className={`hover:bg-gray-50 ${!variant.enabled ? 'opacity-50' : ''}`}>
                                              <td className="px-2 py-1.5 text-center">
                                                <input
                                                  type="checkbox"
                                                  checked={variant.enabled}
                                                  onChange={(e) => updateVariant(variant.id, 'enabled', e.target.checked)}
                                                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded"
                                                />
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <input
                                                  type="text"
                                                  value={variant.code}
                                                  onChange={(e) => updateVariant(variant.id, 'code', e.target.value)}
                                                  className="w-full px-1.5 py-0.5 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <div className="flex flex-wrap gap-1">
                                                  {Object.entries(variant.attributes).map(([key, val]) => (
                                                    <span key={key} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs whitespace-nowrap">
                                                      {key}: {val}
                                                    </span>
                                                  ))}
                                                </div>
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <input
                                                  type="text"
                                                  value={variant.barcode}
                                                  onChange={(e) => updateVariant(variant.id, 'barcode', e.target.value)}
                                                  readOnly={!!variant.barcode}
                                                  className={`w-full px-1.5 py-0.5 border text-xs focus:outline-none ${variant.barcode
                                                    ? 'border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed'
                                                    : 'border-gray-300 focus:ring-1 focus:ring-blue-500'
                                                    }`}
                                                  placeholder={barcodeType === 'EAN13' ? tm('13Digits') : tm('alphanumeric')}
                                                />
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  value={variant.purchasePrice}
                                                  onChange={(e) => updateVariantPurchasePrice(variant.id, Number(e.target.value))}
                                                  className="w-20 px-1.5 py-0.5 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                              </td>

                                              <td className="px-2 py-1.5">
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  value={variant.salePrice}
                                                  onChange={(e) => updateVariant(variant.id, 'salePrice', Number(e.target.value))}
                                                  className="w-20 px-1.5 py-0.5 border border-gray-300 text-xs text-right bg-green-50 focus:outline-none focus:ring-1 focus:ring-green-500"
                                                />
                                              </td>
                                              <td className="px-2 py-1.5 bg-orange-50">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  value={variant.purchaseQuantity || 0}
                                                  onChange={(e) => updateVariant(variant.id, 'purchaseQuantity', Number(e.target.value))}
                                                  className="w-16 px-1.5 py-0.5 border border-orange-300 text-xs text-right bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                                                  placeholder="0"
                                                />
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <input
                                                  type="number"
                                                  value={variant.stock}
                                                  onChange={(e) => updateVariant(variant.id, 'stock', Number(e.target.value))}
                                                  className="w-16 px-1.5 py-0.5 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                />
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <button
                                                  onClick={() => removeVariant(variant.id)}
                                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                >
                                                  <Trash2 className="w-3 h-3" />
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MUHASEBE SEKME */}
          {activeTab === 'muhasebe' && (
            <div className="space-y-4">
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-2 bg-gray-100 border-b border-gray-300">
                  <span className="text-xs text-gray-700 font-bold">{tm('accountingCodes')}</span>
                </div>
                <div className="p-3 grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-12 items-center">
                    <div className="col-span-9 bg-white px-2 py-1.5">
                      <input
                        type="text"
                        value={formData.accountCode || ''}
                        onChange={(e) => handleInputChange('accountCode', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="150.01.001"
                      />
                    </div>
                    <div className="col-span-3 bg-gray-100 px-2 py-1.5 text-right border-l border-white">
                      <label className="text-xs text-gray-700">{tm('accountingAccountCode')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 items-center">
                    <div className="col-span-9 bg-white px-2 py-1.5">
                      <input
                        type="text"
                        value={formData.costCenterCode || ''}
                        onChange={(e) => handleInputChange('costCenterCode', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-3 bg-gray-100 px-2 py-1.5 text-right border-l border-white">
                      <label className="text-xs text-gray-700">{tm('costCenterCode')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 items-center">
                    <div className="col-span-9 bg-white px-2 py-1.5">
                      <input
                        type="text"
                        value={formData.expenseItemCode || ''}
                        onChange={(e) => handleInputChange('expenseItemCode', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-3 bg-gray-100 px-2 py-1.5 text-right border-l border-white">
                      <label className="text-xs text-gray-700">{tm('expenseItemCode')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 items-center">
                    <div className="col-span-9 bg-white px-2 py-1.5">
                      <input
                        type="text"
                        value={formData.revenueAccountCode || ''}
                        onChange={(e) => handleInputChange('revenueAccountCode', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-500"
                        placeholder="600.01.001"
                      />
                    </div>
                    <div className="col-span-3 bg-gray-100 px-2 py-1.5 text-right border-l border-white">
                      <label className="text-xs text-gray-700">{tm('revenueAccountCode')}</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EK BİLGİ SEKME */}
          {activeTab === 'ek-bilgi' && (
            <div className="space-y-4">
              {/* Garanti Bilgileri */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 text-right">
                  <span className="text-xs text-gray-700 font-bold">{tm('warrantyAndLifeInfo')}</span>
                </div>
                <div className="p-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="grid grid-cols-12 items-center mb-2">
                      <div className="col-span-8">
                        <input
                          type="text"
                          value={formData.warrantyType || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('warrantyType', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder={tm('distributorImporter')}
                        />
                      </div>
                      <div className="col-span-4 text-right pl-2">
                        <label className="text-xs text-gray-700">{tm('warrantyType')}</label>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid grid-cols-12 items-center">
                      <div className="col-span-8">
                        <input
                          type="number"
                          value={formData.warrantyPeriod || 0}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('warrantyPeriod', Number(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-4 text-right pl-2">
                        <label className="text-xs text-gray-700">{tm('warrantyPeriod')} ({tm('months')})</label>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 items-center">
                      <div className="col-span-8">
                        <input
                          type="number"
                          value={formData.shelfLife || 0}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('shelfLife', Number(e.target.value))}
                          className="w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-4 text-right pl-2">
                        <label className="text-xs text-gray-700">{tm('shelfLife')} ({tm('days')})</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Açıklamalar */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 text-right">
                  <span className="text-xs text-gray-700 font-bold">{tm('descriptions')}</span>
                </div>
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-10">
                      <textarea
                        value={formData.description || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('description', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('definitionDescription')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-10">
                      <textarea
                        value={formData.technicalSpecs || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('technicalSpecs', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('technicalSpecs')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-10">
                      <textarea
                        value={formData.usageInfo || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('usageInfo', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('usageInfo')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-10">
                      <textarea
                        value={formData.notes || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('notes', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('notes')}</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* SEO Bilgileri */}
              <div className="bg-white border border-gray-300">
                <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 text-right">
                  <span className="text-xs text-gray-700 font-bold">{tm('ecommerceSeo')}</span>
                </div>
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-10">
                      <input
                        type="text"
                        value={formData.seoTitle || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('seoTitle', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('seoTitle')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-10">
                      <textarea
                        value={formData.seoDescription || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange('seoDescription', e.target.value)}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('seoDescription')}</label>
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-10">
                      <input
                        type="text"
                        value={formData.metaKeywords || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('metaKeywords', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={tm('commaSeparated')}
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <label className="text-xs text-gray-700">{tm('metaKeywords')}</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RESİM SEKME */}
          {activeTab === 'resim' && (
            <div className="bg-white border border-gray-300">
              <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
                <span className="text-xs text-gray-700">{tm('productImage')}</span>
              </div>
              <div className="p-4">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer group">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                    id="product-image-upload"
                  />

                  {formData.image_url ? (
                    <div className="relative">
                      <img
                        src={formData.image_url}
                        alt={tm('product')}
                        className="max-h-64 object-contain rounded-md shadow-sm"
                      />
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleInputChange('image_url', '');
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="product-image-upload" className="flex flex-col items-center cursor-pointer w-full h-full">
                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                        <Upload className="w-8 h-8 text-blue-500" />
                      </div>
                      <span className="text-sm font-medium text-gray-700 mb-1">{tm('clickToUpload')}</span>
                      <span className="text-xs text-gray-500 mb-4">{tm('imageFormatHint')}</span>
                      <div className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-xs rounded-full shadow-sm">
                        {tm('imageOptimizationHint')}
                      </div>
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-4 my-6">
                  <div className="h-px bg-gray-300 flex-1"></div>
                  <span className="text-xs text-gray-500 font-medium">{tm('or')}</span>
                  <div className="h-px bg-gray-300 flex-1"></div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    {tm('searchImageOnline')}
                  </h3>

                  <button
                    onClick={() => setShowImageSearchModal(true)}
                    className="mt-4 w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-blue-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <Search className="w-5 h-5" />
                    {tm('searchImageOnline')}
                  </button>

                  <p className="text-xs text-gray-500 text-center mt-2">
                    {tm('unsplashHint')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Etiket Yazdırma Modal */}
      {
        showLabelPrint && (
          <ProductLabelPrint
            productName={formData.name}
            variants={variants.map((v: FormVariant) => ({
              id: v.id,
              variantCode: v.code,
              barcode: v.barcode,
              attributes: v.attributes,
              salePrice: v.salePrice,
              enabled: v.enabled,
              stock: v.stock,
              cost: v.purchasePrice
            }))}
            currency={formData.currency}
            category={formData.category}
            onClose={() => setShowLabelPrint(false)}
          />
        )
      }

      {/* Selection Modal */}
      {
        selectionModal.show && (
          selectionModal.useTree ? (
            <TreeSelectionModal
              title={selectionModal.title}
              items={selectionModal.items as TreeDataItem[]}
              currentValue={selectionModal.currentValue as string}
              onSelect={handleTreeSelect}
              onClose={() => setSelectionModal((prev: any) => ({ ...prev, show: false }))}
            />
          ) : (
            <MasterDataSelectionModal
              title={selectionModal.title}
              items={selectionModal.items}
              currentValue={selectionModal.currentValue}
              isMulti={selectionModal.isMulti}
              onSelect={handleSelectionSelect}
              onClose={() => setSelectionModal((prev: any) => ({ ...prev, show: false }))}
            />
          )
        )
      }

      {/* Image Search Modal */}
      {
        showImageSearchModal && (
          <ImageSearchModal
            initialQuery={imageSearchService.buildSearchQuery(
              formData.description_tr,
              formData.description_en
            )}
            onSelect={(base64Image) => {
              handleInputChange('image_url', base64Image);
              setShowImageSearchModal(false);
            }}
            onClose={() => setShowImageSearchModal(false)}
          />
        )
      }
    </div >
  );
});

