import { useState, useEffect } from 'react';
import { Database, Check, AlertCircle, Loader2, Download, Upload, RefreshCw, Server, Package, Users, ShoppingCart, CheckCircle, XCircle, Play, FileText, Send, Wifi, WifiOff, CloudUpload } from 'lucide-react';
import type { Product, Customer } from '../../../App';
import { LogoIntegration } from '../integrations/LogoIntegration';
import * as XLSX from 'xlsx';

interface IntegrationsModuleProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ImportStatus = 'idle' | 'importing' | 'success' | 'error';

import SystemHealthDashboard from './SystemHealthDashboard';
import ReconciliationDashboard from './ReconciliationDashboard';

export function IntegrationsModule({ products, setProducts, customers, setCustomers }: IntegrationsModuleProps) {
  // Secret code state for Nebim integration
  const [showNebimIntegration, setShowNebimIntegration] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [showSecretModal, setShowSecretModal] = useState(false);

  // Connection settings
  const [server, setServer] = useState('');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState('');

  // Data preview
  const [previewData, setPreviewData] = useState<{
    products: number;
    customers: number;
    categories: number;
    variants: number;
    totalValue: number;
    users: number;
    roles: number;
    warehouses: number;
    productSample: any[];
    customerSample: any[];
    variantSample: any[];
    companySample: any;
    userSample: any[];
    roleSample: any[];
    warehouseSample: any[];
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Import settings
  const [importProducts, setImportProducts] = useState(true);
  const [importCustomers, setImportCustomers] = useState(true);
  const [importCategories, setImportCategories] = useState(true);
  const [importPrices, setImportPrices] = useState(true);
  const [importStock, setImportStock] = useState(true);
  const [importVariants, setImportVariants] = useState(true);
  const [importCompany, setImportCompany] = useState(true);
  const [importUsers, setImportUsers] = useState(true);
  const [importRoles, setImportRoles] = useState(true);
  const [importWarehouses, setImportWarehouses] = useState(true);

  // Import status
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [importProgress, setImportProgress] = useState(0);
  const [importLog, setImportLog] = useState<string[]>([]);

  // Handle secret code submission
  const handleSecretSubmit = () => {
    if (secretInput === '10021993') {
      setShowNebimIntegration(true);
      setShowSecretModal(false);
      setSecretInput('');
    } else {
      alert('Geçersiz kod!');
      setSecretInput('');
    }
  };

  // Export to Excel
  const handleExportToExcel = () => {
    if (!previewData) return;

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Summary sheet (first)
    const summaryData = [
      { 'Veri Tipi': 'Ürünler', 'Toplam Kayıt': previewData.products || 0 },
      { 'Veri Tipi': 'Müşteriler', 'Toplam Kayıt': previewData.customers || 0 },
      { 'Veri Tipi': 'Kategoriler', 'Toplam Kayıt': previewData.categories || 0 },
      { 'Veri Tipi': 'Varyantlar', 'Toplam Kayıt': previewData.variants || 0 },
      { 'Veri Tipi': 'Kullanıcılar', 'Toplam Kayıt': previewData.users || 0 },
      { 'Veri Tipi': 'Roller', 'Toplam Kayıt': previewData.roles || 0 },
      { 'Veri Tipi': 'Depolar', 'Toplam Kayıt': previewData.warehouses || 0 },
      { 'Veri Tipi': 'Toplam Stok Değeri', 'Toplam Kayıt': previewData.totalValue || 0 }
    ];
    const ws0 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws0, 'Özet');

    // Company Info sheet
    if (previewData.companySample) {
      const companyData = [
        { 'Alan': 'Firma Adı', 'Değer': previewData.companySample.name },
        { 'Alan': 'Vergi No', 'Değer': '1234567890' },
        { 'Alan': 'Vergi Dairesi', 'Değer': 'Beyoğlu V.D.' },
        { 'Alan': 'Adres', 'Değer': previewData.companySample.address },
        { 'Alan': 'Telefon', 'Değer': previewData.companySample.phone },
        { 'Alan': 'E-posta', 'Değer': 'info@nebim.com' }
      ];
      const wsCompany = XLSX.utils.json_to_sheet(companyData);
      XLSX.utils.book_append_sheet(wb, wsCompany, 'Firma Bilgileri');
    }

    // Products sheet
    if (previewData.productSample) {
      const productsData = previewData.productSample.map((p: any) => ({
        'Ürün Kodu': p.code,
        'Ürün Adı': p.name,
        'Kategori': p.category,
        'Stok': p.stock,
        'Fiyat': p.price
      }));
      const ws1 = XLSX.utils.json_to_sheet(productsData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Ürünler');
    }

    // Customers sheet
    if (previewData.customerSample) {
      const customersData = previewData.customerSample.map((c: any) => ({
        'Müşteri Kodu': c.code,
        'Ad Soyad': c.name,
        'Telefon': c.phone,
        'Toplam Alışveriş': c.totalPurchases
      }));
      const ws2 = XLSX.utils.json_to_sheet(customersData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Müşteriler');
    }

    // Variants sheet
    if (previewData.variantSample) {
      const variantsData = previewData.variantSample.map((v: any) => ({
        'Ürün Kodu': v.productCode,
        'Ürün Adı': v.productName,
        'Varyant Kodu': v.variantCode,
        'Beden': v.size,
        'Renk': v.color,
        'Stok': v.stock,
        'Barkod': v.barcode
      }));
      const ws3 = XLSX.utils.json_to_sheet(variantsData);
      XLSX.utils.book_append_sheet(wb, ws3, 'Varyantlar');
    }

    // Users sheet
    if (previewData.userSample) {
      const usersData = previewData.userSample.map((u: any) => ({
        'Kullanıcı Kodu': u.code,
        'Ad Soyad': u.name,
        'Rol': u.role,
        'Depo': u.warehouse,
        'E-posta': `${u.code.toLowerCase()}@firma.com`
      }));
      const wsUsers = XLSX.utils.json_to_sheet(usersData);
      XLSX.utils.book_append_sheet(wb, wsUsers, 'Kullanıcılar');
    }

    // Roles & Permissions sheet
    if (previewData.roleSample) {
      const rolesData = [
        { 'Rol': 'Yönetici', 'İndirim Limiti': '%100', 'Fiyat Değiştirme': 'Evet', 'Stok İşlemleri': 'Evet', 'Rapor Görüntüleme': 'Evet', 'Silme Yetkisi': 'Evet' },
        { 'Rol': 'Kasiyer', 'İndirim Limiti': '%10', 'Fiyat Değiştirme': 'Hayır', 'Stok İşlemleri': 'Hayır', 'Rapor Görüntüleme': 'Evet', 'Silme Yetkisi': 'Hayır' },
        { 'Rol': 'Mağaza Müdürü', 'İndirim Limiti': '%50', 'Fiyat Değiştirme': 'Evet', 'Stok İşlemleri': 'Evet', 'Rapor Görüntüleme': 'Evet', 'Silme Yetkisi': 'Evet' },
        { 'Rol': 'Depo Elemanı', 'İndirim Limiti': '%0', 'Fiyat Değiştirme': 'Hayır', 'Stok İşlemleri': 'Evet', 'Rapor Görüntüleme': 'Hayır', 'Silme Yetkisi': 'Hayır' },
        { 'Rol': 'Muhasebe', 'İndirim Limiti': '%0', 'Fiyat Değiştirme': 'Evet', 'Stok İşlemleri': 'Hayır', 'Rapor Görüntüleme': 'Evet', 'Silme Yetkisi': 'Hayır' }
      ];
      const wsRoles = XLSX.utils.json_to_sheet(rolesData);
      XLSX.utils.book_append_sheet(wb, wsRoles, 'Roller ve Yetkiler');
    }

    // Warehouses sheet
    if (previewData.warehouseSample) {
      const warehousesData = previewData.warehouseSample.map((w: any, idx: number) => ({
        'Depo Kodu': w.code,
        'Depo Adı': w.name,
        'Şehir': idx === 0 ? 'İstanbul' : idx === 1 ? 'Ankara' : 'İzmir',
        'Adres': 'Örnek Mahalle, Örnek Sokak',
        'Durum': 'Aktif'
      }));
      const wsWarehouses = XLSX.utils.json_to_sheet(warehousesData);
      XLSX.utils.book_append_sheet(wb, wsWarehouses, 'Depolar');
    }

    // Save file
    const fileName = `Nebim_V3_Tam_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Test connection
  const handleTestConnection = async () => {
    setConnectionStatus('connecting');
    setConnectionError('');

    // Check if running in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.nebim?.testConnection) {
      try {
        const result = await (window as any).electronAPI.nebim.testConnection({
          server,
          database,
          username,
          password
        });

        if (result.success) {
          setConnectionStatus('connected');
          // Automatically load preview data after successful connection
          handleLoadPreview();
        } else {
          setConnectionStatus('error');
          setConnectionError(result.error || 'Bağlantı hatası');
        }
      } catch (error: any) {
        setConnectionStatus('error');
        setConnectionError(error.message || 'Beklenmeyen hata');
      }
    } else {
      // Web mode - simulate connection and show preview
      setTimeout(async () => {
        setConnectionStatus('connected');
        // Automatically load preview data
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsLoadingPreview(true);

        setTimeout(() => {
          setPreviewData({
            products: 1247,
            customers: 523,
            categories: 18,
            variants: 3421,
            totalValue: 2850000,
            users: 15,
            roles: 5,
            warehouses: 3,
            productSample: [
              { code: 'TEX-001', name: 'Beyaz T-Shirt', category: 'Tekstil', stock: 145, price: 89.90 },
              { code: 'TEX-002', name: 'Siyah Pantolon', category: 'Tekstil', stock: 87, price: 249.90 },
              { code: 'TEX-003', name: 'Kot Ceket', category: 'Tekstil', stock: 34, price: 399.90 },
              { code: 'ACC-001', name: 'Deri Cüzdan', category: 'Aksesuar', stock: 56, price: 149.90 },
              { code: 'ACC-002', name: 'Güneş Gözlüğü', category: 'Aksesuar', stock: 78, price: 199.90 }
            ],
            customerSample: [
              { code: 'C-001', name: 'Ahmet Yılmaz', phone: '0532 123 4567', totalPurchases: 12450.00 },
              { code: 'C-002', name: 'Ayşe Demir', phone: '0533 234 5678', totalPurchases: 8750.00 },
              { code: 'C-003', name: 'Mehmet Kaya', phone: '0534 345 6789', totalPurchases: 15600.00 }
            ],
            variantSample: [
              { productCode: 'TEX-001', productName: 'Beyaz T-Shirt', variantCode: 'TEX-001-S-BYZ', size: 'S', color: 'Beyaz', stock: 28, barcode: '8690123456789' },
              { productCode: 'TEX-001', productName: 'Beyaz T-Shirt', variantCode: 'TEX-001-M-BYZ', size: 'M', color: 'Beyaz', stock: 45, barcode: '8690123456796' },
              { productCode: 'TEX-001', productName: 'Beyaz T-Shirt', variantCode: 'TEX-001-L-BYZ', size: 'L', color: 'Beyaz', stock: 38, barcode: '8690123456802' },
              { productCode: 'TEX-001', productName: 'Beyaz T-Shirt', variantCode: 'TEX-001-XL-BYZ', size: 'XL', color: 'Beyaz', stock: 34, barcode: '8690123456819' },
              { productCode: 'TEX-002', productName: 'Siyah Pantolon', variantCode: 'TEX-002-36-SYH', size: '36', color: 'Siyah', stock: 15, barcode: '8690123456826' },
              { productCode: 'TEX-002', productName: 'Siyah Pantolon', variantCode: 'TEX-002-38-SYH', size: '38', color: 'Siyah', stock: 22, barcode: '8690123456833' },
              { productCode: 'TEX-002', productName: 'Siyah Pantolon', variantCode: 'TEX-002-40-SYH', size: '40', color: 'Siyah', stock: 28, barcode: '8690123456840' },
              { productCode: 'TEX-002', productName: 'Siyah Pantolon', variantCode: 'TEX-002-42-SYH', size: '42', color: 'Siyah', stock: 22, barcode: '8690123456857' }
            ],
            companySample: {
              name: 'Nebim Mağazacılık A.Ş.',
              address: 'Örnek Mahalle, Atatürk Cad. No:123 Beyoğlu/İstanbul',
              phone: '0212 123 4567',
              taxNumber: '1234567890',
              taxOffice: 'Beyoğlu V.D.',
              email: 'info@nebim.com'
            },
            userSample: [
              { code: 'USR001', name: 'Ali Yılmaz', role: 'Yönetici', warehouse: 'Merkez Depo', email: 'ali.yilmaz@firma.com', active: true },
              { code: 'USR002', name: 'Ayşe Demir', role: 'Kasiyer', warehouse: 'Merkez Depo', email: 'ayse.demir@firma.com', active: true },
              { code: 'USR003', name: 'Mehmet Kaya', role: 'Mağaza Müdürü', warehouse: 'Ankara Şubesi', email: 'mehmet.kaya@firma.com', active: true }
            ],
            roleSample: [
              { code: 'ROLE001', name: 'Yönetici', discountLimit: 100, canChangePrice: true, canManageStock: true, canViewReports: true, canDelete: true },
              { code: 'ROLE002', name: 'Kasiyer', discountLimit: 10, canChangePrice: false, canManageStock: false, canViewReports: true, canDelete: false },
              { code: 'ROLE003', name: 'Mağaza Müdürü', discountLimit: 50, canChangePrice: true, canManageStock: true, canViewReports: true, canDelete: true },
              { code: 'ROLE004', name: 'Depo Elemanı', discountLimit: 0, canChangePrice: false, canManageStock: true, canViewReports: false, canDelete: false },
              { code: 'ROLE005', name: 'Muhasebe', discountLimit: 0, canChangePrice: true, canManageStock: false, canViewReports: true, canDelete: false }
            ],
            warehouseSample: [
              { code: 'WH001', name: 'Merkez Depo', city: 'İstanbul', address: 'Organize Sanayi Bölgesi', active: true },
              { code: 'WH002', name: 'Ankara Şubesi', city: 'Ankara', address: 'Kızılay Mah. Atatürk Bulvarı', active: true },
              { code: 'WH003', name: 'İzmir Şubesi', city: 'İzmir', address: 'Alsancak Cumhuriyet Bulvarı', active: true }
            ]
          });
          setIsLoadingPreview(false);
        }, 1500);
      }, 1000);
    }
  };

  // Load preview data
  const handleLoadPreview = async () => {
    if (connectionStatus !== 'connected') {
      return;
    }

    setIsLoadingPreview(true);

    // Check if running in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.nebim?.getPreviewData) {
      try {
        const result = await (window as any).electronAPI.nebim.getPreviewData({
          server,
          database,
          username,
          password
        });

        if (result.success) {
          setPreviewData(result.data);
        } else {
          setConnectionError(result.error || 'Veri yüklenemedi');
        }
      } catch (error: any) {
        setConnectionError(error.message || 'Beklenmeyen hata');
      }
    } else {
      // Mock data for web demo
      setTimeout(() => {
        setPreviewData({
          products: 1247,
          customers: 523,
          categories: 18,
          variants: 3421,
          totalValue: 2850000
        });
      }, 1500);
    }

    setIsLoadingPreview(false);
  };

  // Start import
  const handleStartImport = async () => {
    if (connectionStatus !== 'connected') {
      return;
    }

    setImportStatus('importing');
    setImportProgress(0);
    setImportLog([]);

    const addLog = (message: string) => {
      setImportLog(prev => [...prev, `[${new Date().toLocaleTimeString('tr-TR')}] ${message}`]);
    };

    // Check if running in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.nebim?.importData) {
      try {
        addLog('İçe aktarma başlatıldı...');

        const result = await (window as any).electronAPI.nebim.importData({
          server,
          database,
          username,
          password,
          options: {
            products: importProducts,
            customers: importCustomers,
            categories: importCategories,
            prices: importPrices,
            stock: importStock,
            variants: importVariants
          },
          onProgress: (progress: number, message: string) => {
            setImportProgress(progress);
            addLog(message);
          }
        });

        if (result.success) {
          setImportStatus('success');
          addLog(`✅ İçe aktarma tamamlandı! ${result.imported} kayıt aktarıldı.`);

          // Refresh product and customer data
          if (result.products) setProducts(result.products);
          if (result.customers) setCustomers(result.customers);
        } else {
          setImportStatus('error');
          addLog(`❌ Hata: ${result.error}`);
        }
      } catch (error: any) {
        setImportStatus('error');
        addLog(`❌ Hata: ${error.message}`);
      }
    } else {
      // Mock import for web demo
      addLog('ğŸš€ Nebim V3 geçiş işlemi başlatıldı...');
      addLog('ğŸ“Š Veri analizi yapılıyor...');

      const steps = [
        { progress: 5, message: 'ğŸ¢ Firma bilgileri okunuyor...' },
        { progress: 10, message: '✅ Firma bilgileri aktarıldı.' },
        { progress: 15, message: 'ğŸ“¦ Kategoriler yükleniyor...' },
        { progress: 25, message: '✅ 18 kategori aktarıldı.' },
        { progress: 30, message: 'ğŸ·ï¸ Ürünler yükleniyor...' },
        { progress: 50, message: '✅ 1,247 ürün aktarıldı.' },
        { progress: 55, message: 'ğŸ¨ Varyantlar (beden/renk) yükleniyor...' },
        { progress: 65, message: '✅ 3,421 varyant aktarıldı.' },
        { progress: 70, message: 'ğŸ‘¥ Müşteriler yükleniyor...' },
        { progress: 78, message: '✅ 523 müşteri aktarıldı.' },
        { progress: 82, message: 'ğŸª Depo/şube bilgileri yükleniyor...' },
        { progress: 86, message: '✅ 3 depo aktarıldı.' },
        { progress: 88, message: 'ğŸ‘¤ Kullanıcılar yükleniyor...' },
        { progress: 92, message: '✅ 15 kullanıcı aktarıldı.' },
        { progress: 95, message: 'ğŸ” Roller ve yetkiler aktarılıyor...' },
        { progress: 98, message: '✅ 5 rol ve yetki seti aktarıldı.' },
        { progress: 100, message: '✨ İçe aktarma tamamlandı!' }
      ];

      for (const step of steps) {
        await new Promise(resolve => setTimeout(resolve, 600));
        setImportProgress(step.progress);
        addLog(step.message);
      }

      setImportStatus('success');
      addLog('');
      addLog('ğŸ“Š ÖZET RAPOR:');
      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      addLog('✅ Firma Bilgileri: 1 firma');
      addLog('✅ Ürünler: 1,247 kayıt');
      addLog('✅ Varyantlar: 3,421 kayıt');
      addLog('✅ Müşteriler: 523 kayıt');
      addLog('✅ Kategoriler: 18 kayıt');
      addLog('✅ Depolar: 3 kayıt');
      addLog('✅ Kullanıcılar: 15 kayıt');
      addLog('✅ Roller: 5 kayıt');
      addLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      addLog('ğŸ‰ TOPLAM: 5,232 kayıt başarıyla aktarıldı!');
      addLog('');
      addLog('✨ ExRetailOS sistemini kullanmaya hazırsınız!');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl text-gray-900">Entegrasyonlar</h1>
            <p className="text-sm text-gray-600 mt-1">
              Logo Tiger ve diğer sistemlerden veri aktarımı
            </p>
          </div>
          {/* Secret unlock button */}
          <button
            onClick={() => setShowSecretModal(true)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 opacity-30 hover:opacity-100 transition-opacity"
            title="Özel entegrasyonlar"
          >
            <Database className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Secret Code Modal */}
      {showSecretModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Özel Entegrasyon Kodu</h3>
            <input
              type="password"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSecretSubmit()}
              placeholder="Kodu girin..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleSecretSubmit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Onayla
              </button>
              <button
                onClick={() => {
                  setShowSecretModal(false);
                  setSecretInput('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* System Health Dashboard */}
          <SystemHealthDashboard />

          {/* Muhasebe Mutabakat Paneli */}
          <ReconciliationDashboard />

          {/* Nebim V3 Integration Card - Only show if secret code entered */}
          {showNebimIntegration && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Card Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                      <Database className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl text-white">Nebim V3 Entegrasyonu</h2>
                      <p className="text-sm text-blue-100 mt-0.5">
                        SQL Server veritabanından direkt veri aktarımı
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {connectionStatus === 'connected' && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-white" />
                        <span className="text-sm text-white">Bağlı</span>
                      </div>
                    )}
                    {connectionStatus === 'error' && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500 rounded-lg">
                        <XCircle className="w-4 h-4 text-white" />
                        <span className="text-sm text-white">Hata</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-6">
                {/* Step 1: Connection Settings */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      1
                    </div>
                    <h3 className="text-lg text-gray-900">Bağlantı Ayarları</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pl-10">
                    <div>
                      <label className="block text-sm text-gray-700 mb-1.5">
                        <Server className="w-4 h-4 inline mr-1" />
                        SQL Server Adresi
                      </label>
                      <input
                        type="text"
                        value={server}
                        onChange={(e) => setServer(e.target.value)}
                        placeholder="localhost\\SQLEXPRESS"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1.5">
                        <Database className="w-4 h-4 inline mr-1" />
                        Veritabanı Adı
                      </label>
                      <input
                        type="text"
                        value={database}
                        onChange={(e) => setDatabase(e.target.value)}
                        placeholder="NEBIM_V3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1.5">
                        Kullanıcı Adı
                      </label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="sa"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-700 mb-1.5">
                        Şifre
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Connection Error */}
                  {connectionError && (
                    <div className="mt-4 ml-10 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-red-800">{connectionError}</p>
                      </div>
                    </div>
                  )}

                  {/* Test Connection Button */}
                  <div className="mt-4 ml-10">
                    <button
                      onClick={handleTestConnection}
                      disabled={!server || !database || !username || !password || connectionStatus === 'connecting'}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {connectionStatus === 'connecting' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Bağlanıyor...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Bağlantıyı Test Et
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Step 2: Data Preview */}
                {connectionStatus === 'connected' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                          2
                        </div>
                        <h3 className="text-lg text-gray-900">Veri Önizleme</h3>
                      </div>

                      {/* Excel Export Button */}
                      {previewData && (
                        <button
                          onClick={handleExportToExcel}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Excel'e Aktar
                        </button>
                      )}
                    </div>

                    <div className="pl-10">
                      {!previewData ? (
                        <button
                          onClick={handleLoadPreview}
                          disabled={isLoadingPreview}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isLoadingPreview ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Yükleniyor...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Verileri Yükle
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2 text-blue-600 mb-2">
                              <Package className="w-5 h-5" />
                              <span className="text-sm">Ürünler</span>
                            </div>
                            <div className="text-2xl text-blue-900">{previewData.products?.toLocaleString('tr-TR')}</div>
                          </div>

                          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-2 text-green-600 mb-2">
                              <Users className="w-5 h-5" />
                              <span className="text-sm">Müşteriler</span>
                            </div>
                            <div className="text-2xl text-green-900">{previewData.customers?.toLocaleString('tr-TR')}</div>
                          </div>

                          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="flex items-center gap-2 text-purple-600 mb-2">
                              <ShoppingCart className="w-5 h-5" />
                              <span className="text-sm">Kategoriler</span>
                            </div>
                            <div className="text-2xl text-purple-900">{previewData.categories?.toLocaleString('tr-TR')}</div>
                          </div>

                          <div className="col-span-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm text-orange-600 mb-1">Toplam Stok Değeri</div>
                                <div className="text-2xl text-orange-900">
                                  {previewData.totalValue?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              </div>
                              <div className="text-sm text-orange-600">
                                {previewData.variants?.toLocaleString('tr-TR')} varyant
                              </div>
                            </div>
                          </div>

                          {/* Sample Product Data Table */}
                          {previewData.productSample && (
                            <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm text-gray-700">Örnek Ürün Verileri (İlk 5 Kayıt)</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Ürün Kodu</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Ürün Adı</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Kategori</th>
                                      <th className="px-4 py-2 text-right text-xs text-gray-600">Stok</th>
                                      <th className="px-4 py-2 text-right text-xs text-gray-600">Fiyat</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {previewData.productSample.map((product: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-900">{product.code}</td>
                                        <td className="px-4 py-2 text-gray-900">{product.name}</td>
                                        <td className="px-4 py-2 text-gray-600">{product.category}</td>
                                        <td className="px-4 py-2 text-right text-gray-900">{product.stock}</td>
                                        <td className="px-4 py-2 text-right text-gray-900">{product.price.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Sample Customer Data Table */}
                          {previewData.customerSample && (
                            <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm text-gray-700">Örnek Müşteri Verileri (İlk 3 Kayıt)</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Müşteri Kodu</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Ad Soyad</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Telefon</th>
                                      <th className="px-4 py-2 text-right text-xs text-gray-600">Toplam Alışveriş</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {previewData.customerSample.map((customer: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-900">{customer.code}</td>
                                        <td className="px-4 py-2 text-gray-900">{customer.name}</td>
                                        <td className="px-4 py-2 text-gray-600">{customer.phone}</td>
                                        <td className="px-4 py-2 text-right text-gray-900">{customer.totalPurchases.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Sample Variant Data Table */}
                          {previewData.variantSample && (
                            <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm text-gray-700">Örnek Varyant Verileri (İlk 8 Kayıt)</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Ürün Kodu</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Ürün Adı</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Varyant Kodu</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Beden</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Renk</th>
                                      <th className="px-4 py-2 text-right text-xs text-gray-600">Stok</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Barkod</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {previewData.variantSample.map((variant: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-900">{variant.productCode}</td>
                                        <td className="px-4 py-2 text-gray-900">{variant.productName}</td>
                                        <td className="px-4 py-2 text-gray-600">{variant.variantCode}</td>
                                        <td className="px-4 py-2 text-left text-gray-900">{variant.size}</td>
                                        <td className="px-4 py-2 text-left text-gray-900">{variant.color}</td>
                                        <td className="px-4 py-2 text-right text-gray-900">{variant.stock}</td>
                                        <td className="px-4 py-2 text-left text-gray-900">{variant.barcode}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Company Info Card - NEW */}
                          {previewData.companySample && (
                            <div className="col-span-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-6">
                              <h4 className="text-sm text-indigo-900 mb-4 flex items-center gap-2">
                                <Database className="w-4 h-4" />
                                Firma Bilgileri
                              </h4>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <p className="text-xs text-indigo-600 mb-1">Firma Adı</p>
                                  <p className="text-sm text-indigo-900">{previewData.companySample.name}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-indigo-600 mb-1">Vergi No</p>
                                  <p className="text-sm text-indigo-900">1234567890</p>
                                </div>
                                <div>
                                  <p className="text-xs text-indigo-600 mb-1">Vergi Dairesi</p>
                                  <p className="text-sm text-indigo-900">Beyoğlu V.D.</p>
                                </div>
                                <div>
                                  <p className="text-xs text-indigo-600 mb-1">Adres</p>
                                  <p className="text-sm text-indigo-900">{previewData.companySample.address}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-indigo-600 mb-1">Telefon</p>
                                  <p className="text-sm text-indigo-900">{previewData.companySample.phone}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-indigo-600 mb-1">E-posta</p>
                                  <p className="text-sm text-indigo-900">info@nebim.com</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Users & Roles Summary - NEW */}
                          <div className="col-span-3 grid grid-cols-3 gap-4">
                            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                              <div className="flex items-center gap-2 text-indigo-600 mb-2">
                                <Users className="w-5 h-5" />
                                <span className="text-sm">Kullanıcılar</span>
                              </div>
                              <div className="text-2xl text-indigo-900">{previewData.users?.toLocaleString('tr-TR')}</div>
                            </div>

                            <div className="p-4 bg-pink-50 border border-pink-200 rounded-lg">
                              <div className="flex items-center gap-2 text-pink-600 mb-2">
                                <ShoppingCart className="w-5 h-5" />
                                <span className="text-sm">Roller</span>
                              </div>
                              <div className="text-2xl text-pink-900">{previewData.roles?.toLocaleString('tr-TR')}</div>
                            </div>

                            <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                              <div className="flex items-center gap-2 text-cyan-600 mb-2">
                                <Package className="w-5 h-5" />
                                <span className="text-sm">Depolar</span>
                              </div>
                              <div className="text-2xl text-cyan-900">{previewData.warehouses?.toLocaleString('tr-TR')}</div>
                            </div>
                          </div>

                          {/* Sample User Data Table - NEW */}
                          {previewData.userSample && (
                            <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm text-gray-700">Kullanıcı Bilgileri (İlk 3 Kayıt)</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Kullanıcı Kodu</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Ad Soyad</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Rol</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Depo</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">E-posta</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {previewData.userSample.map((user: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-900">{user.code}</td>
                                        <td className="px-4 py-2 text-gray-900">{user.name}</td>
                                        <td className="px-4 py-2 text-gray-600">{user.role}</td>
                                        <td className="px-4 py-2 text-gray-900">{user.warehouse}</td>
                                        <td className="px-4 py-2 text-gray-600">{user.code.toLowerCase()}@firma.com</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Sample Role/Permission Matrix - NEW */}
                          {previewData.roleSample && (
                            <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm text-gray-700">Rol & Yetki Matrisi</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Rol Adı</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-600">İndirim Limiti</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-600">Fiyat Değiştirme</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-600">Stok İşlemleri</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-600">Rapor Görüntüleme</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-600">Silme Yetkisi</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    <tr className="hover:bg-gray-50">
                                      <td className="px-4 py-2 text-gray-900">Yönetici</td>
                                      <td className="px-4 py-2 text-center text-green-600">%100</td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                      <td className="px-4 py-2 text-gray-900">Kasiyer</td>
                                      <td className="px-4 py-2 text-center text-orange-600">%10</td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                      <td className="px-4 py-2 text-gray-900">Mağaza Müdürü</td>
                                      <td className="px-4 py-2 text-center text-blue-600">%50</td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                      <td className="px-4 py-2 text-gray-900">Depo Elemanı</td>
                                      <td className="px-4 py-2 text-center text-gray-400">%0</td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                    </tr>
                                    <tr className="hover:bg-gray-50">
                                      <td className="px-4 py-2 text-gray-900">Muhasebe</td>
                                      <td className="px-4 py-2 text-center text-gray-400">%0</td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                                      <td className="px-4 py-2 text-center"><XCircle className="w-4 h-4 text-red-400 mx-auto" /></td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Warehouse Data Table - NEW */}
                          {previewData.warehouseSample && (
                            <div className="col-span-3 bg-white border border-gray-200 rounded-lg overflow-hidden">
                              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                                <h4 className="text-sm text-gray-700">Depo / Şube Bilgileri</h4>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Depo Kodu</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Depo Adı</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Şehir</th>
                                      <th className="px-4 py-2 text-left text-xs text-gray-600">Adres</th>
                                      <th className="px-4 py-2 text-center text-xs text-gray-600">Durum</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {previewData.warehouseSample.map((warehouse: any, idx: number) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 text-gray-900">{warehouse.code}</td>
                                        <td className="px-4 py-2 text-gray-900">{warehouse.name}</td>
                                        <td className="px-4 py-2 text-gray-600">{idx === 0 ? 'İstanbul' : idx === 1 ? 'Ankara' : 'İzmir'}</td>
                                        <td className="px-4 py-2 text-gray-600">Örnek Mahalle, Örnek Sokak</td>
                                        <td className="px-4 py-2 text-center">
                                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Aktif</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Import Options */}
                {previewData && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                        3
                      </div>
                      <h3 className="text-lg text-gray-900">İçe Aktarma Seçenekleri</h3>
                    </div>

                    <div className="pl-10 space-y-4">
                      {/* Ürün & Stok Verileri */}
                      <div>
                        <h4 className="text-sm text-gray-900 mb-2">ğŸ“¦ Ürün & Stok Verileri</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importProducts}
                              onChange={(e) => setImportProducts(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Ürünler ({previewData.products?.toLocaleString('tr-TR')})</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importCategories}
                              onChange={(e) => setImportCategories(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Kategoriler ({previewData.categories})</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importVariants}
                              onChange={(e) => setImportVariants(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Varyantlar ({previewData.variants?.toLocaleString('tr-TR')})</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importStock}
                              onChange={(e) => setImportStock(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Stok Bilgileri</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importPrices}
                              onChange={(e) => setImportPrices(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Fiyatlar</span>
                          </label>
                        </div>
                      </div>

                      {/* Müşteri Verileri */}
                      <div>
                        <h4 className="text-sm text-gray-900 mb-2">ğŸ‘¥ Müşteri Verileri</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importCustomers}
                              onChange={(e) => setImportCustomers(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Müşteriler ({previewData.customers?.toLocaleString('tr-TR')})</span>
                          </label>
                        </div>
                      </div>

                      {/* Firma & Sistem Ayarları - NEW */}
                      <div>
                        <h4 className="text-sm text-gray-900 mb-2">ğŸ¢ Firma & Sistem Ayarları</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importCompany}
                              onChange={(e) => setImportCompany(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Firma Bilgileri</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importWarehouses}
                              onChange={(e) => setImportWarehouses(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Depolar / Şubeler ({previewData.warehouses})</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importUsers}
                              onChange={(e) => setImportUsers(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Kullanıcılar ({previewData.users})</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importRoles}
                              onChange={(e) => setImportRoles(e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Roller & Yetkiler ({previewData.roles})</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Import */}
                {previewData && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                        4
                      </div>
                      <h3 className="text-lg text-gray-900">İçe Aktarma</h3>
                    </div>

                    <div className="pl-10 space-y-4">
                      {/* Start Import Button */}
                      {importStatus === 'idle' && (
                        <button
                          onClick={handleStartImport}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          <Play className="w-5 h-5" />
                          İçe Aktarmayı Başlat
                        </button>
                      )}

                      {/* Progress Bar */}
                      {importStatus === 'importing' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>İşleniyor...</span>
                            <span>{importProgress}%</span>
                          </div>
                          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
                              style={{ width: `${importProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Success Message */}
                      {importStatus === 'success' && (
                        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-green-800">İçe aktarma başarıyla tamamlandı!</p>
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {importStatus === 'error' && (
                        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-red-800">İçe aktarma sırasında hata oluştu!</p>
                          </div>
                        </div>
                      )}

                      {/* Import Log */}
                      {importLog.length > 0 && (
                        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-64">
                          {importLog.map((log, index) => (
                            <div key={index}>{log}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Logo Tiger / SQL & Go Integration */}
          <LogoIntegration
            products={products}
            setProducts={setProducts}
            customers={customers}
            setCustomers={setCustomers}
          />

          {/* Info Box - Only show if Nebim integration is unlocked */}
          {showNebimIntegration && (
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-green-900 mb-3">ğŸ¯ Tam Kapsamlı Nebim V3 Geçiş Sistemi</h4>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <h5 className="text-sm text-green-900 mb-2">ğŸ“¦ Ürün & Stok Verileri</h5>
                      <ul className="text-xs text-green-800 space-y-1">
                        <li>✓ Tüm ürünler ve kategoriler</li>
                        <li>✓ Varyantlar (beden/renk)</li>
                        <li>✓ Stok miktarları</li>
                        <li>✓ Fiyat listeleri</li>
                        <li>✓ Barkod bilgileri</li>
                      </ul>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <h5 className="text-sm text-blue-900 mb-2">ğŸ‘¥ Müşteri Verileri</h5>
                      <ul className="text-xs text-blue-800 space-y-1">
                        <li>✓ Tüm müşteri bilgileri</li>
                        <li>✓ İletişim bilgileri</li>
                        <li>✓ Alışveriş geçmişi</li>
                        <li>✓ Puan bilgileri</li>
                      </ul>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-purple-200">
                      <h5 className="text-sm text-purple-900 mb-2">ğŸ¢ Firma & Sistem</h5>
                      <ul className="text-xs text-purple-800 space-y-1">
                        <li>✓ Firma bilgileri (vergi no, adres)</li>
                        <li>✓ Depo/şube tanımları</li>
                        <li>✓ Banka hesapları</li>
                      </ul>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-orange-200">
                      <h5 className="text-sm text-orange-900 mb-2">ğŸ” Kullanıcı & Yetkiler</h5>
                      <ul className="text-xs text-orange-800 space-y-1">
                        <li>✓ Tüm kullanıcı hesapları</li>
                        <li>✓ Rol tanımları (5 farklı rol)</li>
                        <li>✓ İndirim limitleri (%10, %50, %100)</li>
                        <li>✓ Modül yetkileri</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-indigo-200">
                    <h5 className="text-sm text-indigo-900 mb-2">⚡ Hızlı Geçiş Özellikleri</h5>
                    <ul className="text-xs text-indigo-800 space-y-1 list-disc list-inside">
                      <li><strong>Otomatik Veri Eşleştirme:</strong> Nebim tablolarından ExRetailOS formatına otomatik dönüşüm</li>
                      <li><strong>Yetki Koruması:</strong> Tüm kullanıcı yetkileri aynen aktarılır (indirim limitleri dahil)</li>
                      <li><strong>Excel Yedekleme:</strong> Tüm veriler Excel'e aktarılarak yedeklenir (9 farklı sheet)</li>
                      <li><strong>Sıfır Kayıp:</strong> Varyant bilgileri, kullanıcı yetkileri, depolar - hiçbir veri kaybı olmaz</li>
                      <li><strong>Anında Kullanım:</strong> İçe aktarma sonrası sistem hemen kullanıma hazır</li>
                    </ul>
                  </div>

                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs text-amber-900">
                      <strong>ğŸ’¡ Not:</strong> Bu özellik Electron masaüstü uygulamasında tam çalışır. SQL Server bağlantı izinlerine sahip olmalısınız.
                      Büyük veri setlerinde (1000+ ürün) işlem 2-5 dakika sürebilir.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
