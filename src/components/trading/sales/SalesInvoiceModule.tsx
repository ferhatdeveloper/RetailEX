import { useState, useRef, useEffect } from 'react';
import { FileText, FileCheck, Plus, Search, Printer, Send, Eye, Edit, Trash2, X, Save, Calendar, User, MoreVertical, AlertCircle, CheckCircle2, Barcode } from 'lucide-react';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import type { Customer, Product } from '../../../App';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useAutoJournal, formatJournalResult } from '../../../hooks/useAutoJournal';
import { toast } from 'sonner';
import { formatNumber } from '../../../utils/formatNumber';
import { DocumentManager } from '../../shared/DocumentManager';

interface SalesInvoiceModuleProps {
  customers: Customer[];
  products: Product[];
  onCreateInvoice?: () => void; // UnifiedInvoiceModule'den gelen callback
  onSwitchTab?: () => void; // Diğer sekmeye geçiş
  activeTab?: 'sales' | 'purchase'; // Aktif sekme
  onInvoiceClick?: (invoice: any) => void;
}

interface InvoiceItem {
  id: string;
  type: string;
  code: string;
  description: string;
  description2: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPercent: number;
  amount: number;
  netAmount: number;
}

// Mock Products
const mockProducts = [
  { code: 'GID-001', name: 'Süt 1L', unit: 'Adet', price: 3500, vat: 0, barcode: '8690000000001' },
  { code: 'GID-002', name: 'Ekmek Beyaz', unit: 'Adet', price: 1500, vat: 0, barcode: '8690000000002' },
  { code: 'GID-003', name: 'Pirinç 1Kg', unit: 'Kg', price: 4000, vat: 0, barcode: '8690000000003' },
  { code: 'GID-004', name: 'Yağ 1L', unit: 'Litre', price: 8500, vat: 0, barcode: '8690000000004' },
  { code: 'GID-005', name: 'Şeker 1Kg', unit: 'Kg', price: 3000, vat: 0, barcode: '8690000000005' },
  { code: 'GID-006', name: 'Çay 500g', unit: 'Paket', price: 12000, vat: 0, barcode: '8690000000006' },
  { code: 'GID-007', name: 'Makarna 500g', unit: 'Paket', price: 2500, vat: 0, barcode: '8690000000007' },
  { code: 'ICE-001', name: 'Coca Cola 1.5L', unit: 'Adet', price: 2500, vat: 0, barcode: '8690000000008' },
  { code: 'ICE-002', name: 'Su 1.5L', unit: 'Adet', price: 1000, vat: 0, barcode: '8690000000009' },
  { code: 'TEM-001', name: 'Deterjan 3Kg', unit: 'Paket', price: 15000, vat: 0, barcode: '8690000000010' },
];

export function SalesInvoiceModule({ customers, products, onCreateInvoice, onSwitchTab, activeTab: externalActiveTab, onInvoiceClick }: SalesInvoiceModuleProps) {
  // ===== CONTEXT & HOOKS =====
  // ===== CONTEXT & HOOKS =====
  const { selectedFirm, selectedPeriod } = useFirmaDonem();

  // Mappings for backward compatibility
  const selectedFirma = selectedFirm ? {
    ...selectedFirm,
    id: selectedFirm.logicalref.toString(),
    firma_adi: selectedFirm.name
  } : null;

  const selectedDonem = selectedPeriod ? {
    ...selectedPeriod,
    id: selectedPeriod.logicalref.toString(),
    donem_adi: `Dönem ${selectedPeriod.nr} (${selectedPeriod.beg_date.substring(0, 4)})`
  } : null;

  const isPeriodOpen = () => {
    const result = selectedPeriod?.active ?? false;
    console.log('[SalesInvoiceModule] isPeriodOpen check:', {
      selectedPeriod,
      active: selectedPeriod?.active,
      result
    });
    return result;
  };

  const isTransactionAllowed = (date: any, type: any) => {
    const result = selectedPeriod?.active ?? false;
    console.log('[SalesInvoiceModule] isTransactionAllowed check:', {
      date,
      type,
      selectedPeriod,
      active: selectedPeriod?.active,
      result
    });
    return result;
  };

  const { isReady, createSalesJournal } = useAutoJournal();

  const [invoiceType, setInvoiceType] = useState<'all' | 'standard' | 'earsiv' | 'efatura' | 'proforma'>('all');
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [activeTab, setActiveTab] = useState<'fatura' | 'detaylar' | 'ekliDosyalar'>('fatura');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearchModal, setCustomerSearchModal] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Invoice list state - category ve invoiceTypeCode alanları eklendi
  const [invoices, setInvoices] = useState([
    {
      id: 'SAT-2025-0001',
      customer: 'Ahmad Hassan',
      date: '2025-12-04',
      type: 'Standart',
      category: 'Satis', // Satış faturaları için
      invoiceTypeCode: 0, // Satış Faturası
      total: 12500000,
      tax: 0,
      grandTotal: 12500000,
      status: 'Ödendi',
    },
    {
      id: 'SAT-2025-0002',
      customer: 'Fatima Ali',
      date: '2025-12-03',
      type: 'Standart',
      category: 'Satis', // Satış faturaları için
      invoiceTypeCode: 1, // Perakende Satış
      total: 8750000,
      tax: 0,
      grandTotal: 8750000,
      status: 'Beklemede',
    }
  ]);

  // Sadece Satış kategorisine ait faturaları filtrele ve invoiceType filtresini uygula
  const filteredInvoices = invoices.filter(inv => {
    // Kategori filtresi - sadece Satış kategorisi
    if (inv.category !== 'Satis') return false;

    // Fatura türü filtresi (eğer 'all' değilse)
    if (invoiceType !== 'all') {
      // invoiceType'a göre filtreleme
      if (invoiceType === 'standard') {
        // Standart fatura = invoiceTypeCode 0 (Satış Faturası)
        if (inv.invoiceTypeCode !== 0) return false;
      } else if (invoiceType === 'proforma') {
        // Proforma fatura = type alanında 'Proforma' geçiyorsa
        if (!inv.type || !inv.type.toLowerCase().includes('proforma')) return false;
      }
      // Diğer türler (earsiv, efatura) için gerekirse eklenebilir
    }

    return true;
  });

  // CRUD Functions
  const handleSaveInvoice = async () => {
    // ===== 1. FIRMA/DÖNEM KONTROLÜ =====
    if (!selectedFirma || !selectedDonem) {
      toast.error('❌ Lütfen firma ve dönem seçiniz!', {
        description: 'Satış faturası için firma ve dönem seçimi zorunludur.',
        duration: 5000,
      });
      return;
    }

    // ===== 2. DÖNEM AÇIK MI KONTROLÜ =====
    const periodOpen = isPeriodOpen();

    // DEBUG: Dönem durumunu göster
    if (!periodOpen) {
      alert(`DEBUG - Dönem Durumu:
      
selectedPeriod: ${JSON.stringify(selectedPeriod, null, 2)}
selectedPeriod.active: ${selectedPeriod?.active}
isPeriodOpen(): ${periodOpen}

Lütfen bu bilgiyi ekran görüntüsü olarak paylaşın!`);
    }

    if (!periodOpen) {
      toast.error('❌ Dönem kapalıdır!', {
        description: `${selectedDonem?.donem_adi} kapalı. Kapalı dönemde fatura kesilemez.`,
        duration: 5000,
      });
      return;
    }

    // ===== 3. TARİH KONTROLÜ =====
    const invoiceDate = new Date();
    if (!isTransactionAllowed(invoiceDate, 'SALES_INVOICE')) {
      toast.error('❌ Bu tarihte işlem yapılamaz!', {
        description: 'Dönem kapalı veya ay kapalı olabilir.',
        duration: 5000,
      });
      return;
    }

    // ===== 4. MÜŞTERİ KONTROLÜ =====
    if (!customerTitle) {
      toast.error('❌ Müşteri seçilmedi!', {
        description: 'Lütfen bir müşteri seçiniz.',
        duration: 3000,
      });
      return;
    }

    // ===== 5. KALEMLER KONTROLÜ =====
    const validItems = items.filter(item => item.quantity > 0 && item.unitPrice > 0);
    if (validItems.length === 0) {
      toast.error('❌ Fatura kalemi yok!', {
        description: 'En az bir ürün ekleyiniz.',
        duration: 3000,
      });
      return;
    }

    // ===== 6. TUTARLARI HESAPLA =====
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const tax = 0; // Iraq'ta TAX yok
    const grandTotal = items.reduce((sum, item) => sum + item.netAmount, 0);

    if (grandTotal <= 0) {
      toast.error('❌ Fatura tutarı 0 olamaz!', {
        description: 'Geçerli tutar giriniz.',
        duration: 3000,
      });
      return;
    }

    // ===== 7. FATURA OBJESI OLUŞTUR =====
    const newInvoice = {
      id: invoiceNo || `SAT-${Date.now()}`,
      customer: customerTitle,
      date: transactionDate,
      type: 'Standart Fatura',
      category: 'Satis', // Satış faturaları için
      invoiceTypeCode: 0, // Satış Faturası (varsayılan)
      total,
      tax,
      grandTotal,
      status: 'Beklemede',
      // Firma/Dönem bilgileri
      firma_id: selectedFirma.id,
      firma_name: selectedFirma.firma_adi,
      donem_id: selectedDonem.id,
      donem_name: selectedDonem.donem_adi,
    };

    try {
      // ===== 8. FATURAYI KAYDET (Unified API) =====
      const { invoicesAPI } = await import('../../../services/api/invoices');

      // API'ye uygun format
      const apiInvoice = {
        invoice_no: invoiceNo || `SAT-${Date.now()}`,
        invoice_category: 'Satis',
        customer_id: customers.find(c => c.title === customerTitle)?.id,
        subtotal: total,
        tax: tax,
        discount: 0,
        total_amount: grandTotal,

        status: 'approved',
        notes: 'Satış Faturası',

        items: items.filter(i => i.quantity > 0).map(item => ({
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          price: item.unitPrice,
          total: item.amount,
          netAmount: item.netAmount,
          tax: 0,
          discount: 0
        }))
      };

      console.log('Saving invoice via API:', apiInvoice);
      const result = await invoicesAPI.create(apiInvoice as any);

      if (result) {
        toast.success('✅ Fatura Başarıyla Kaydedildi', {
          description: `Fatura No: ${result.invoice_no}`,
          duration: 5000,
        });

        // 9. MUHASEBELEŞTİRME (Otomatik)
        if (isReady && customers.find(c => c.title === customerTitle)?.id) {
          // Auto journal logic can remain here or move to API later.
        }

        // Reset form
        setItems([{
          id: '1', type: 'hizmet', code: '', description: '', description2: '',
          quantity: 1, unit: 'Adet', unitPrice: 0, discountPercent: 0, amount: 0, netAmount: 0
        }]);
        setCustomerTitle('');
        setInvoiceNo('');
        if (onSwitchTab) onSwitchTab();
      }
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('❌ Kaydetme Hatası', {
        description: error.message || 'Veritabanı hatası oluştu',
        duration: 5000,
      });
    }
  };



  const handleDeleteInvoice = (invoiceId: string) => {
    if (confirm('Bu faturayı silmek istediğinizden emin misiniz?')) {
      setInvoices(invoices.filter(inv => inv.id !== invoiceId));
      alert('Fatura başarıyla silindi!');
    }
  };

  const handleEditInvoice = (invoice: typeof invoices[0]) => {
    setEditingInvoiceId(invoice.id);
    setInvoiceNo(invoice.id);
    setCustomerTitle(invoice.customer);
    setTransactionDate(invoice.date);

    // Set customer code based on customer name
    const customer = customers.find(c => c.title === invoice.customer);
    if (customer) {
      setCustomerCode(customer.code || '');
    } else {
      setCustomerCode('MUS-001');
    }

    // Set cash register
    setCashRegister('001.01 Baghdad Central Kasa');

    // Set special code
    setSpecialCode('SALE-' + invoice.id.split('-')[2]);

    // Populate with mock items
    setItems([
      {
        id: '1',
        type: 'Malzeme',
        code: 'GID-001',
        description: 'Süt 1L',
        description2: 'Fresh Milk',
        quantity: 50,
        unit: 'Adet',
        unitPrice: 3500,
        discountPercent: 0,
        amount: 175000,
        netAmount: 175000
      },
      {
        id: '2',
        type: 'Malzeme',
        code: 'GID-003',
        description: 'Pirinç 1Kg',
        description2: 'Premium Rice',
        quantity: 100,
        unit: 'Kg',
        unitPrice: 4000,
        discountPercent: 5,
        amount: 380000,
        netAmount: 380000
      },
      {
        id: '3',
        type: 'Malzeme',
        code: 'ICE-001',
        description: 'Coca Cola 1.5L',
        description2: '',
        quantity: 120,
        unit: 'Adet',
        unitPrice: 2500,
        discountPercent: 10,
        amount: 270000,
        netAmount: 270000
      },
      {
        id: '4',
        type: 'Malzeme',
        code: 'GID-006',
        description: 'Çay 500g',
        description2: 'Black Tea',
        quantity: 30,
        unit: 'Paket',
        unitPrice: 12000,
        discountPercent: 0,
        amount: 360000,
        netAmount: 360000
      },
      {
        id: '5',
        type: 'Malzeme',
        code: 'TEM-001',
        description: 'Deterjan 3Kg',
        description2: 'Laundry Detergent',
        quantity: 25,
        unit: 'Paket',
        unitPrice: 15000,
        discountPercent: 3,
        amount: 363750,
        netAmount: 363750
      }
    ]);

    setShowNewInvoice(true);
  };

  const resetForm = () => {
    // Generate new invoice number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    setInvoiceNo(`${year}${month}${day}${random}`);

    // Reset all form fields
    setCustomerCode('');
    setCustomerTitle('');
    setSpecialCode('');
    setCashRegister('001.01 Baghdad Central Kasa');
    setTransactionDate(new Date().toLocaleDateString('tr-TR'));
    setEditDate(new Date().toLocaleDateString('tr-TR'));
    setTransactionNo('0000004');
    setTradingGroup('');

    // Reset items to single empty row
    setItems([{
      id: '1',
      type: 'Malzeme',
      code: '',
      description: '',
      description2: '',
      quantity: 0,
      unit: 'Brüt',
      unitPrice: 0,
      discountPercent: 0,
      amount: 0,
      netAmount: 0
    }]);
  };

  // Autocomplete states
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProductIndex, setSelectedProductIndex] = useState(-1);
  const [searchingRowIndex, setSearchingRowIndex] = useState(-1);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);

  // Dropdown states for cash register and customer
  const [showCashRegisterDropdown, setShowCashRegisterDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');

  // Refs
  const gridRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const cashRegisterDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Form States
  const [cashRegister, setCashRegister] = useState('001.01 Baghdad Central Kasa');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [editDate, setEditDate] = useState(new Date().toLocaleDateString('tr-TR'));
  const [transactionNo, setTransactionNo] = useState('0000004');
  const [transactionDate, setTransactionDate] = useState(new Date().toLocaleDateString('tr-TR'));
  const [specialCode, setSpecialCode] = useState('');
  const [customerCode, setCustomerCode] = useState('');
  const [customerTitle, setCustomerTitle] = useState('');
  const [tradingGroup, setTradingGroup] = useState('');

  // Invoice Items
  const [items, setItems] = useState<InvoiceItem[]>([{
    id: '1',
    type: 'Malzeme',
    code: '',
    description: '',
    description2: '',
    quantity: 0,
    unit: 'Brüt',
    unitPrice: 0,
    discountPercent: 0,
    amount: 0,
    netAmount: 0
  }]);

  // Filter products
  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const search = productSearch.toLowerCase();
    return mockProducts.filter(p =>
      p.code.toLowerCase().includes(search) ||
      p.name.toLowerCase().includes(search) ||
      (p.barcode && p.barcode.includes(search))
    );
  };

  // Handle barcode input
  const handleBarcodeSubmit = () => {
    if (!barcodeInput.trim()) return;

    const barcode = barcodeInput.trim();
    const product = mockProducts.find(p => p.barcode === barcode);

    if (product && items.length > 0 && currentRowIndex >= 0) {
      // Add to current row
      const updatedItems = [...items];
      const item = updatedItems[currentRowIndex];
      item.code = product.code;
      item.description = product.name;
      item.unit = product.unit;
      item.unitPrice = product.price;
      item.quantity = item.quantity || 1;

      const subtotal = item.quantity * item.unitPrice;
      const afterDiscount = subtotal * (1 - item.discountPercent / 100);
      item.amount = afterDiscount;
      item.netAmount = afterDiscount;

      setItems(updatedItems);
      setBarcodeInput('');
      barcodeInputRef.current?.focus();
      toast.success(`${product.name} eklendi`);
    } else if (product) {
      // Add new row
      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        type: 'Malzeme',
        code: product.code,
        description: product.name,
        description2: '',
        quantity: 1,
        unit: product.unit,
        unitPrice: product.price,
        discountPercent: 0,
        amount: product.price,
        netAmount: product.price
      };
      setItems([...items, newItem]);
      setBarcodeInput('');
      setCurrentRowIndex(items.length);
      barcodeInputRef.current?.focus();
      toast.success(`${product.name} eklendi`);
    } else {
      toast.error('Ürün bulunamadı!');
      setBarcodeInput('');
    }
  };

  // Update item
  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };

    const item = updatedItems[index];
    const subtotal = item.quantity * item.unitPrice;
    const afterDiscount = subtotal * (1 - item.discountPercent / 100);
    item.amount = afterDiscount;
    item.netAmount = afterDiscount; // TAX kaldırıldı, net = tutar

    setItems(updatedItems);
  };

  // Select product from dropdown
  const selectProduct = (product: typeof mockProducts[0], rowIndex: number) => {
    const updatedItems = [...items];
    const item = updatedItems[rowIndex];

    item.code = product.code;
    item.description = product.name;
    item.unit = product.unit;
    item.unitPrice = product.price;
    item.quantity = 1;

    const subtotal = item.quantity * item.unitPrice;
    const afterDiscount = subtotal * (1 - item.discountPercent / 100);
    item.amount = afterDiscount;
    item.netAmount = afterDiscount; // TAX kaldırıldı, net = tutar

    setItems(updatedItems);
    setShowProductDropdown(false);
    setProductSearch('');

    // Add new empty row
    setTimeout(() => {
      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        type: 'Malzeme',
        code: '',
        description: '',
        description2: '',
        quantity: 0,
        unit: 'Brüt',
        unitPrice: 0,
        discountPercent: 0,
        amount: 0,
        netAmount: 0
      };
      setItems(prev => [...prev, newItem]);

      setTimeout(() => {
        setCurrentRowIndex(rowIndex + 1);
        gridRefs.current[`code-${rowIndex + 1}`]?.focus();
      }, 50);
    }, 50);
  };

  // Handle product search
  const handleProductSearchChange = (value: string, rowIndex: number) => {
    setProductSearch(value);
    setSearchingRowIndex(rowIndex);
    updateItem(rowIndex, 'code', value);
    setShowProductDropdown(value.length >= 1);
    setSelectedProductIndex(-1);

    // Eğer barkod uzunluğu 8 veya daha fazlaysa (barkod gibi görünüyorsa) direkt ara
    if (value.length >= 8) {
      const product = mockProducts.find(p => p.barcode === value.trim());
      if (product) {
        selectProduct(product, rowIndex);
        return;
      }
    }
  };

  // Keyboard navigation
  const handleProductKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
    if (!showProductDropdown) return;

    const filtered = getFilteredProducts();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedProductIndex(prev =>
        prev < filtered.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedProductIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedProductIndex >= 0 && filtered[selectedProductIndex]) {
        selectProduct(filtered[selectedProductIndex], rowIndex);
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
      setProductSearch('');
    }
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
      if (cashRegisterDropdownRef.current && !cashRegisterDropdownRef.current.contains(event.target as Node)) {
        setShowCashRegisterDropdown(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate totals
  const calculateTotals = () => {
    let totalDiscount = 0;
    let subtotal = 0;

    items.forEach(item => {
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscount = itemSubtotal * (item.discountPercent / 100);
      const itemAfterDiscount = itemSubtotal - itemDiscount;

      subtotal += itemAfterDiscount;
      totalDiscount += itemDiscount;
    });

    const net = subtotal; // TAX kaldırıldı, net = subtotal

    return { totalExpenses: 0, totalDiscount, subtotal, net };
  };

  const totals = calculateTotals();

  const columnHelper = createColumnHelper<any>();

  const columns = [
    columnHelper.accessor('id', {
      header: 'Fatura No',
      cell: info => <span className="text-blue-600">{info.getValue()}</span>
    }),
    columnHelper.accessor('customer', {
      header: 'Müşteri',
    }),
    columnHelper.accessor('date', {
      header: 'Tarih',
    }),
    columnHelper.accessor('type', {
      header: 'Tip',
      cell: info => {
        const type = info.getValue();
        const colors: Record<string, string> = {
          'E-Fatura': 'bg-blue-100 text-blue-700',
          'E-Arşiv': 'bg-green-100 text-green-700',
          'Standart': 'bg-gray-100 text-gray-700',
          'Proforma': 'bg-purple-100 text-purple-700'
        };
        return <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors[type]}`}>{type}</span>;
      }
    }),
    columnHelper.accessor('total', {
      header: 'Tutar',
      cell: info => {
        const value = info.getValue();
        return value ? `${formatNumber(value, 2, true)} IQD` : '0,00 IQD';
      }
    }),
    columnHelper.accessor('grandTotal', {
      header: 'Toplam',
      cell: info => {
        const value = info.getValue();
        return <span>{value ? `${formatNumber(value, 2, true)} IQD` : '0,00 IQD'}</span>;
      }
    }),
    columnHelper.accessor('status', {
      header: 'Durum',
      cell: info => {
        const status = info.getValue();
        const colors: Record<string, string> = {
          'Ödendi': 'bg-green-100 text-green-700',
          'Beklemede': 'bg-yellow-100 text-yellow-700',
        };
        return <span className={`px-1.5 py-0.5 rounded text-[10px] ${colors[status]}`}>{status}</span>;
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İşlemler',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditInvoice(row.original);
            }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Düzenle"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteInvoice(row.original.id);
            }}
            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Sil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    })
  ];

  // Handle row double-click
  const handleRowDoubleClick = (invoice: any) => {
    // Fatura tıklanıldığında işlemler modalını aç
    if (onInvoiceClick) {
      onInvoiceClick(invoice);
    } else {
      // Fallback: eski davranış (edit modu)
      setEditingInvoiceId(invoice.id);
      setShowNewInvoice(true);
    }
  };

  if (showNewInvoice) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {/* Header with Tabs */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 flex-shrink-0">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-white" />
              <h2 className="text-lg text-white">Fatura - {invoiceNo}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-white hover:bg-white/10 rounded p-1.5">
                <span className="text-sm">−</span>
              </button>
              <button className="text-white hover:bg-white/10 rounded p-1.5">
                <span className="text-sm">□</span>
              </button>
              <button
                onClick={() => setShowNewInvoice(false)}
                className="text-white hover:bg-white/10 rounded p-1.5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-t border-blue-500">
            <button
              onClick={() => setActiveTab('fatura')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'fatura'
                ? 'bg-white text-blue-600'
                : 'text-white hover:bg-blue-500'
                }`}
            >
              Fatura
            </button>
            <button
              onClick={() => setActiveTab('detaylar')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'detaylar'
                ? 'bg-white text-blue-600'
                : 'text-white hover:bg-blue-500'
                }`}
            >
              Detaylar
            </button>
            <button
              onClick={() => setActiveTab('ekliDosyalar')}
              className={`px-6 py-2 text-sm transition-colors ${activeTab === 'ekliDosyalar'
                ? 'bg-white text-blue-600'
                : 'text-white hover:bg-blue-500'
                }`}
            >
              Ekli Dosyalar
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="p-6">
            {/* Barkod Okutma */}
            {activeTab === 'fatura' && (
              <div className="bg-white rounded border border-gray-200 p-3 mb-3">
                <div className="flex items-center gap-3">
                  <Barcode className="w-5 h-5 text-blue-600" />
                  <label className="text-sm font-medium text-gray-700">Barkod Okut:</label>
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBarcodeSubmit();
                      }
                    }}
                    placeholder="Barkod okutun veya girin..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleBarcodeSubmit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    Ekle
                  </button>
                </div>
              </div>
            )}

            {/* Top Form */}
            {activeTab === 'fatura' && (
              <>
                <div className="bg-white rounded border border-gray-200 p-3 mb-3">
                  <div className="grid grid-cols-12 gap-3">
                    {/* Left Column */}
                    <div className="col-span-3 space-y-3">
                      <div className="relative">
                        <label className="block mb-1 text-gray-700 text-sm">Kasa Kodu</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={cashRegister}
                            onChange={(e) => setCashRegister(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#2196F3] focus:ring-1 focus:ring-[#2196F3] transition-colors"
                          />
                          <button
                            onClick={() => setShowCashRegisterDropdown(!showCashRegisterDropdown)}
                            className="w-7 h-7 bg-[#2196F3] hover:bg-[#1976D2] text-white rounded flex items-center justify-center transition-colors"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {showCashRegisterDropdown && (
                          <div
                            ref={cashRegisterDropdownRef}
                            className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-64 overflow-auto"
                          >
                            {[
                              { code: '001.01', name: 'Baghdad Central Kasa' },
                              { code: '001.02', name: 'Baghdad Branch Kasa' },
                              { code: '002.01', name: 'Erbil Central Kasa' },
                              { code: '002.02', name: 'Erbil Branch Kasa' },
                              { code: '003.01', name: 'Basra Central Kasa' },
                              { code: '003.02', name: 'Basra Branch Kasa' },
                              { code: '004.01', name: 'Mosul Central Kasa' },
                              { code: '005.01', name: 'Kirkuk Central Kasa' },
                              { code: '006.01', name: 'Sulaymaniyah Central Kasa' },
                              { code: '007.01', name: 'Najaf Central Kasa' },
                            ].map(kasa => (
                              <div
                                key={kasa.code}
                                onClick={() => {
                                  setCashRegister(`${kasa.code} ${kasa.name}`);
                                  setShowCashRegisterDropdown(false);
                                }}
                                className="px-3 py-2 cursor-pointer text-sm transition-colors hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                              >
                                <div className="font-medium text-gray-900">{kasa.code}</div>
                                <div className="text-xs text-gray-600">{kasa.name}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block mb-1 text-gray-700 text-sm">Fatura No.</label>
                        <input
                          type="text"
                          value={invoiceNo}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 text-gray-700 text-sm">Düzenleme Tarihi</label>
                        <input
                          type="text"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#2196F3] focus:ring-1 focus:ring-[#2196F3]"
                        />
                      </div>
                    </div>

                    {/* Middle Column */}
                    <div className="col-span-3 space-y-3">
                      <div>
                        <label className="block mb-1 text-gray-700 text-sm">İşlem No.</label>
                        <input
                          type="text"
                          value={transactionNo}
                          onChange={(e) => setTransactionNo(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#2196F3] focus:ring-1 focus:ring-[#2196F3]"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 text-gray-700 text-sm">Tarih</label>
                        <input
                          type="text"
                          value={transactionDate}
                          onChange={(e) => setTransactionDate(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#2196F3] focus:ring-1 focus:ring-[#2196F3]"
                        />
                      </div>

                      <div>
                        <label className="block mb-1 text-gray-700 text-sm">Özel Kod</label>
                        <input
                          type="text"
                          value={specialCode}
                          onChange={(e) => setSpecialCode(e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#2196F3] focus:ring-1 focus:ring-[#2196F3]"
                        />
                      </div>
                    </div>

                    {/* Right Column - Cari */}
                    <div className="col-span-6">
                      <div className="border-2 border-[#2196F3] rounded p-3 h-full bg-blue-50">
                        <div className="text-[#2196F3] mb-2 flex items-center gap-2 text-sm">
                          <User className="w-4 h-4" />
                          Cari Hesap
                        </div>
                        <div className="space-y-2">
                          <div className="relative">
                            <label className="block mb-1 text-gray-700 text-sm">Kodu</label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={customerCode}
                                readOnly
                                placeholder="Seçin..."
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm bg-white cursor-pointer"
                                onClick={() => setShowCustomerModal(true)}
                              />
                              <button
                                onClick={() => setShowCustomerModal(true)}
                                className="w-7 h-7 bg-[#2196F3] hover:bg-[#1976D2] text-white rounded flex items-center justify-center transition-colors"
                              >
                                <Search className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block mb-1 text-gray-700 text-sm">Ünvanı</label>
                            <input
                              type="text"
                              value={customerTitle}
                              onChange={(e) => setCustomerTitle(e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                            />
                          </div>

                          <div>
                            <label className="block mb-1 text-gray-700 text-sm">Ticari İşlem Grubu</label>
                            <input
                              type="text"
                              value={tradingGroup}
                              onChange={(e) => setTradingGroup(e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Grid & Totals - Side by Side */}
                <div className="space-y-3">
                  {/* Items Grid - Full Width */}
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <div className="overflow-auto" style={{ height: '400px' }}>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                          <tr>
                            <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-20">Tür</th>
                            <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-32">Kodu</th>
                            <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-48">Açıklama</th>
                            <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-32">Açıklama2</th>
                            <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-20">Miktar</th>
                            <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-16">Birim</th>
                            <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-24">Fiyat</th>
                            <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-14">%</th>
                            <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-24">Tutar</th>
                            <th className="px-2 py-2 text-right text-gray-700 w-24">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, index) => (
                            <tr
                              key={item.id}
                              className={`border-b border-gray-100 transition-colors ${currentRowIndex === index ? 'bg-blue-50' : 'hover:bg-gray-50'
                                }`}
                            >
                              {/* Type */}
                              <td className="border-r border-gray-100 p-0">
                                <select
                                  value={item.type}
                                  onChange={(e) => updateItem(index, 'type', e.target.value)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                >
                                  <option>Malzeme</option>
                                  <option>Hizmet</option>
                                  <option>İndirim</option>
                                </select>
                              </td>

                              {/* Code with Autocomplete */}
                              <td className="border-r border-gray-100 p-0 relative">
                                <input
                                  ref={(el) => { gridRefs.current[`code-${index}`] = el; }}
                                  type="text"
                                  value={item.code}
                                  onChange={(e) => handleProductSearchChange(e.target.value, index)}
                                  onKeyDown={(e) => handleProductKeyDown(e, index)}
                                  onFocus={() => {
                                    setCurrentRowIndex(index);
                                    if (item.code) {
                                      setProductSearch(item.code);
                                      setSearchingRowIndex(index);
                                      setShowProductDropdown(true);
                                    }
                                  }}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                  placeholder="Kod/ad..."
                                />

                                {/* Dropdown */}
                                {showProductDropdown && searchingRowIndex === index && (
                                  <div
                                    ref={productDropdownRef}
                                    className="absolute top-full left-0 w-96 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-64 overflow-auto"
                                  >
                                    {getFilteredProducts().map((product, pIndex) => (
                                      <div
                                        key={product.code}
                                        onClick={() => selectProduct(product, index)}
                                        className={`px-3 py-2 cursor-pointer text-sm transition-colors ${pIndex === selectedProductIndex
                                          ? 'bg-[#2196F3] text-white'
                                          : 'hover:bg-gray-50'
                                          }`}
                                      >
                                        <div className="font-medium">{product.code}</div>
                                        <div className="text-xs opacity-90">{product.name}</div>
                                        <div className="text-xs opacity-75 mt-0.5">{product.unit} • {product.price} IQD</div>
                                      </div>
                                    ))}
                                    {getFilteredProducts().length === 0 && (
                                      <div className="px-3 py-2 text-sm text-gray-500">Ürün bulunamadı</div>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Description */}
                              <td className="border-r border-gray-100 p-0">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                />
                              </td>

                              {/* Description2 */}
                              <td className="border-r border-gray-100 p-0">
                                <input
                                  type="text"
                                  value={item.description2}
                                  onChange={(e) => updateItem(index, 'description2', e.target.value)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                />
                              </td>

                              {/* Quantity */}
                              <td className="border-r border-gray-100 p-0">
                                <input
                                  type="number"
                                  value={item.quantity || ''}
                                  onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                />
                              </td>

                              {/* Unit */}
                              <td className="border-r border-gray-100 p-0">
                                <select
                                  value={item.unit}
                                  onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                >
                                  <option>Brüt</option>
                                  <option>Adet</option>
                                  <option>Teneke</option>
                                  <option>Set</option>
                                </select>
                              </td>

                              {/* Price */}
                              <td className="border-r border-gray-100 p-0">
                                <input
                                  type="number"
                                  value={item.unitPrice || ''}
                                  onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  step="0.01"
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                />
                              </td>

                              {/* Discount % */}
                              <td className="border-r border-gray-100 p-0">
                                <input
                                  type="number"
                                  value={item.discountPercent || ''}
                                  onChange={(e) => updateItem(index, 'discountPercent', parseFloat(e.target.value) || 0)}
                                  onFocus={() => setCurrentRowIndex(index)}
                                  className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                />
                              </td>

                              {/* Amount (read-only) */}
                              <td className="border-r border-gray-100 px-2 py-1 bg-gray-50 text-sm text-right">
                                {formatNumber(item.amount, 2, false)}
                              </td>

                              {/* Net (read-only) */}
                              <td className="px-2 py-1 bg-gray-50 text-sm text-right">
                                {formatNumber(item.netAmount, 2, false)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Totals Box - Below Table, Right Aligned */}
                  <div className="flex justify-end">
                    <div className="w-72 bg-white rounded border border-gray-200 p-3 shadow-lg">
                      <div className="text-sm text-[#2196F3] mb-2">Toplam</div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Masraf</span>
                          <span>{formatNumber(totals.totalExpenses, 2, false)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">İndirim</span>
                          <span>{formatNumber(totals.totalDiscount, 2, false)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Ara Toplam</span>
                          <span className="text-[#2196F3]">{formatNumber(totals.subtotal, 2, false)}</span>
                        </div>
                        <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                          <span className="text-gray-900">Net</span>
                          <span className="text-[#2196F3] text-xl">{formatNumber(totals.net, 2, false)}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleSaveInvoice}
                          className="flex-1 px-4 py-1.5 bg-[#2196F3] hover:bg-[#1976D2] text-white rounded text-sm transition-colors flex items-center justify-center gap-2">
                          <Save className="w-4 h-4" />
                          {editingInvoiceId ? 'Güncelle' : 'Kaydet'}
                        </button>
                        <button
                          onClick={() => {
                            setShowNewInvoice(false);
                            setEditingInvoiceId(null);
                            resetForm();
                          }}
                          className="w-9 h-9 bg-gray-800 hover:bg-gray-900 text-white rounded-full transition-colors flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Detaylar Sekmesi */}
            {activeTab === 'detaylar' && (
              <div className="bg-white rounded border border-gray-200 p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Açıklama</label>
                    <textarea
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Fatura açıklaması..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Teslimat Adresi</label>
                      <textarea
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="Teslimat adresi..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Notlar</label>
                      <textarea
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        placeholder="Ek notlar..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Ekli Dosyalar Sekmesi */}
            {activeTab === 'ekliDosyalar' && (
              <div className="bg-white rounded border border-gray-200 p-6">
                <DocumentManager />
              </div>
            )}
          </div>
        </div>

        {/* Customer Selection Modal */}
        {showCustomerModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
            <div className="bg-white w-[95vw] max-w-[1400px] h-[85vh] flex flex-col shadow-2xl">
              {/* Modal Header - Flat Blue */}
              <div className="bg-[#2196F3] px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <User className="w-6 h-6 text-white" />
                  <h3 className="text-xl text-white">Müşteri Seçimi</h3>
                </div>
                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setCustomerSearchModal('');
                  }}
                  className="text-white hover:bg-white/20 rounded p-2 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Search Bar - Flat */}
              <div className="px-8 py-5 border-b border-gray-200 bg-gray-50">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={customerSearchModal}
                    onChange={(e) => setCustomerSearchModal(e.target.value)}
                    placeholder="Müşteri kodu veya ünvanı ile ara..."
                    className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-300 text-base focus:outline-none focus:border-[#2196F3] transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              {/* Customer List - Full Height Table */}
              <div className="flex-1 overflow-auto bg-white">
                <table className="w-full">
                  <thead className="bg-gray-100 sticky top-0 border-b-2 border-gray-300">
                    <tr>
                      <th className="px-8 py-4 text-left text-sm text-gray-700 uppercase tracking-wide">Kod</th>
                      <th className="px-8 py-4 text-left text-sm text-gray-700 uppercase tracking-wide">Ünvan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers
                      .filter(cust =>
                        (cust?.code?.toLowerCase() || '').includes((customerSearchModal || '').toLowerCase()) ||
                        (cust?.title?.toLowerCase() || '').includes((customerSearchModal || '').toLowerCase())
                      )
                      .map((cust, custIndex) => (
                        <tr
                          key={cust.code || `customer-${custIndex}`}
                          onClick={() => {
                            setCustomerCode(cust.code || '');
                            setCustomerTitle(cust.title || '');
                            setShowCustomerModal(false);
                            setCustomerSearchModal('');
                          }}
                          className="cursor-pointer hover:bg-[#E3F2FD] transition-colors border-b border-gray-200"
                        >
                          <td className="px-8 py-4 text-base text-gray-900 font-medium">{cust.code || ''}</td>
                          <td className="px-8 py-4 text-base text-gray-800">{cust.title || ''}</td>
                        </tr>
                      ))}
                    {customers
                      .filter(cust =>
                        (cust?.code?.toLowerCase() || '').includes((customerSearchModal || '').toLowerCase()) ||
                        (cust?.title?.toLowerCase() || '').includes((customerSearchModal || '').toLowerCase())
                      )
                      .length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-8 py-16 text-center text-gray-500 text-base">
                            <div className="flex flex-col items-center gap-3">
                              <Search className="w-12 h-12 text-gray-300" />
                              <p>Müşteri bulunamadı</p>
                              <p className="text-sm text-gray-400">Farklı bir anahtar kelime deneyin</p>
                            </div>
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer - Flat */}
              <div className="px-8 py-5 border-t-2 border-gray-200 bg-gray-50 flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  {customers.filter(cust =>
                    (cust?.code?.toLowerCase() || '').includes((customerSearchModal || '').toLowerCase()) ||
                    (cust?.title?.toLowerCase() || '').includes((customerSearchModal || '').toLowerCase())
                  ).length} müşteri bulundu
                </div>
                <button
                  onClick={() => {
                    setShowCustomerModal(false);
                    setCustomerSearchModal('');
                  }}
                  className="px-6 py-2.5 bg-gray-600 hover:bg-gray-700 text-white text-base transition-colors"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-teal-600 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <FileText className="w-5 h-5 text-white" />
          <div>
            <h2 className="text-base text-white">Satış Faturaları</h2>
            <p className="text-teal-100 text-xs">RetailOS - Tedarikçi fatura yönetimi</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sekme Değiştirme Butonu */}
          {onSwitchTab && (
            <button
              onClick={onSwitchTab}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <FileCheck className="w-4 h-4" />
              Alış Faturaları
            </button>
          )}

          {/* Fatura Türü Seçin Butonu */}
          <button
            onClick={() => {
              if (onCreateInvoice) {
                onCreateInvoice(); // Fatura türü seçim modalını aç
              } else {
                resetForm();
                setEditingInvoiceId(null);
                setShowNewInvoice(true);
              }
            }}
            className="px-4 py-2 bg-white text-teal-600 rounded hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Fatura Türü Seçin
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Tümü' },
            { value: 'standard', label: 'Standart' },
            { value: 'proforma', label: 'Proforma' }
          ].map(type => (
            <button
              key={type.value}
              onClick={() => setInvoiceType(type.value as any)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${invoiceType === type.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Fatura ara..."
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <DevExDataGrid
          data={filteredInvoices}
          columns={columns}
          enableSorting
          enableFiltering
          enableColumnResizing
          enablePagination
          onRowDoubleClick={handleRowDoubleClick}
        />
      </div>
    </div>
  );
}
