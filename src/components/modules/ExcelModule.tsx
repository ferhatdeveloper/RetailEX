import { useState } from 'react';
import { FileSpreadsheet, Download, Upload, Table, FileText, AlertCircle, CheckCircle, XCircle, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Product, Customer } from '../App';

interface ExcelModuleProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
}

type TemplateType = 'products' | 'customers' | 'variants' | 'categories' | 'stock';

export function ExcelModule({ products, setProducts, customers, setCustomers }: ExcelModuleProps) {
  const [importResult, setImportResult] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  
  // Download template
  const handleDownloadTemplate = (type: TemplateType) => {
    const wb = XLSX.utils.book_new();
    
    let data: any[] = [];
    let sheetName = '';
    
    switch (type) {
      case 'products':
        sheetName = 'Ürünler';
        data = [
          {
            'Ürün Kodu': 'ORNEK-001',
            'Ürün Adı': 'Örnek Ürün',
            'Kategori': 'Kategori 1',
            'Fiyat': 100.00,
            'Stok': 50,
            'Barkod': '8690000000001',
            'Açıklama': 'Ürün açıklaması'
          },
          {
            'Ürün Kodu': 'ORNEK-002',
            'Ürün Adı': 'Örnek Ürün 2',
            'Kategori': 'Kategori 2',
            'Fiyat': 150.00,
            'Stok': 30,
            'Barkod': '8690000000002',
            'Açıklama': 'Ürün açıklaması 2'
          }
        ];
        break;
        
      case 'customers':
        sheetName = 'Müşteriler';
        data = [
          {
            'Müşteri Kodu': 'M-001',
            'Ad Soyad': 'Ahmed Al-Maliki',
            'Telefon': '+964 750 123 4567',
            'E-posta': 'ahmet@example.com',
            'Adres': 'Örnek Mahalle, Örnek Sokak No:1',
            'Şehir': 'İstanbul',
            'Puan': 0
          },
          {
            'Müşteri Kodu': 'M-002',
            'Ad Soyad': 'Layla Hassan',
            'Telefon': '+964 770 234 5678',
            'E-posta': 'ayse@example.com',
            'Adres': 'Örnek Mahalle, Örnek Sokak No:2',
            'Şehir': 'Ankara',
            'Puan': 0
          }
        ];
        break;
        
      case 'variants':
        sheetName = 'Varyantlar';
        data = [
          {
            'Ürün Kodu': 'ORNEK-001',
            'Varyant Kodu': 'ORNEK-001-S-MAVİ',
            'Beden': 'S',
            'Renk': 'Mavi',
            'Stok': 20,
            'Barkod': '8690000000011'
          },
          {
            'Ürün Kodu': 'ORNEK-001',
            'Varyant Kodu': 'ORNEK-001-M-MAVİ',
            'Beden': 'M',
            'Renk': 'Mavi',
            'Stok': 25,
            'Barkod': '8690000000012'
          },
          {
            'Ürün Kodu': 'ORNEK-001',
            'Varyant Kodu': 'ORNEK-001-L-MAVİ',
            'Beden': 'L',
            'Renk': 'Mavi',
            'Stok': 15,
            'Barkod': '8690000000013'
          }
        ];
        break;
        
      case 'categories':
        sheetName = 'Kategoriler';
        data = [
          {
            'Kategori Kodu': 'KAT-001',
            'Kategori Adı': 'Giyim',
            'Açıklama': 'Tüm giyim ürünleri'
          },
          {
            'Kategori Kodu': 'KAT-002',
            'Kategori Adı': 'Aksesuar',
            'Açıklama': 'Tüm aksesuar ürünleri'
          },
          {
            'Kategori Kodu': 'KAT-003',
            'Kategori Adı': 'Ayakkabı',
            'Açıklama': 'Tüm ayakkabı ürünleri'
          }
        ];
        break;
        
      case 'stock':
        sheetName = 'Stok Hareketleri';
        data = [
          {
            'Ürün Kodu': 'ORNEK-001',
            'İşlem Tipi': 'Giriş',
            'Miktar': 100,
            'Tarih': new Date().toISOString().split('T')[0],
            'Açıklama': 'İlk stok girişi'
          },
          {
            'Ürün Kodu': 'ORNEK-002',
            'İşlem Tipi': 'Çıkış',
            'Miktar': 5,
            'Tarih': new Date().toISOString().split('T')[0],
            'Açıklama': 'Satış'
          }
        ];
        break;
    }
    
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    
    const fileName = `ExRetailOS_${sheetName}_Şablon_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    setImportResult({
      type: 'success',
      message: `${sheetName} şablonu başarıyla indirildi!`
    });
    
    setTimeout(() => setImportResult(null), 3000);
  };
  
  // Export current data
  const handleExportData = (type: 'products' | 'customers') => {
    const wb = XLSX.utils.book_new();
    
    if (type === 'products') {
      const productsData = products.map((p) => ({
        'Ürün Kodu': p.code,
        'Ürün Adı': p.name,
        'Kategori': p.category,
        'Fiyat': p.price,
        'Stok': p.stock,
        'Barkod': p.barcode || '',
        'Açıklama': ''
      }));
      const ws = XLSX.utils.json_to_sheet(productsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Ürünler');
      
      const fileName = `ExRetailOS_Ürünler_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      setImportResult({
        type: 'success',
        message: `${products.length} ürün Excel'e aktarıldı!`
      });
    } else {
      const customersData = customers.map((c) => ({
        'Müşteri Kodu': c.code,
        'Ad Soyad': c.name,
        'Telefon': c.phone,
        'E-posta': c.email || '',
        'Adres': c.address || '',
        'Şehir': '',
        'Puan': c.points
      }));
      const ws = XLSX.utils.json_to_sheet(customersData);
      XLSX.utils.book_append_sheet(wb, ws, 'Müşteriler');
      
      const fileName = `ExRetailOS_Müşteriler_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      setImportResult({
        type: 'success',
        message: `${customers.length} müşteri Excel'e aktarıldı!`
      });
    }
    
    setTimeout(() => setImportResult(null), 3000);
  };
  
  // Import data from Excel
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>, type: 'products' | 'customers') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (type === 'products') {
          const newProducts = jsonData.map((row: any, index: number) => ({
            id: `import-${Date.now()}-${index}`,
            code: row['Ürün Kodu'] || `AUTO-${Date.now()}-${index}`,
            name: row['Ürün Adı'] || 'Adsız Ürün',
            category: row['Kategori'] || 'Genel',
            price: parseFloat(row['Fiyat']) || 0,
            stock: parseInt(row['Stok']) || 0,
            barcode: row['Barkod'] || '',
            variants: []
          }));
          
          setProducts([...products, ...newProducts]);
          
          setImportResult({
            type: 'success',
            message: `${newProducts.length} ürün başarıyla içe aktarıldı!`
          });
        } else {
          const newCustomers = jsonData.map((row: any, index: number) => ({
            id: `import-${Date.now()}-${index}`,
            code: row['Müşteri Kodu'] || `C-${Date.now()}-${index}`,
            name: row['Ad Soyad'] || 'Adsız Müşteri',
            phone: row['Telefon'] || '',
            email: row['E-posta'] || '',
            address: row['Adres'] || '',
            points: parseInt(row['Puan']) || 0,
            totalPurchases: 0
          }));
          
          setCustomers([...customers, ...newCustomers]);
          
          setImportResult({
            type: 'success',
            message: `${newCustomers.length} müşteri başarıyla içe aktarıldı!`
          });
        }
        
        setTimeout(() => setImportResult(null), 3000);
      } catch (error) {
        setImportResult({
          type: 'error',
          message: 'Excel dosyası okunamadı. Lütfen şablon formatına uygun bir dosya kullanın.'
        });
        setTimeout(() => setImportResult(null), 5000);
      }
    };
    
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl text-gray-900">Excel İçe/Dışa Aktarım</h1>
        <p className="text-sm text-gray-600 mt-1">
          Ürün, müşteri ve diğer verileri Excel ile yönetin
        </p>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Notification */}
          {importResult && (
            <div className={`flex items-center gap-2 p-4 rounded-lg border ${
              importResult.type === 'success' ? 'bg-green-50 border-green-200' :
              importResult.type === 'error' ? 'bg-red-50 border-red-200' :
              'bg-blue-50 border-blue-200'
            }`}>
              {importResult.type === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
              {importResult.type === 'error' && <XCircle className="w-5 h-5 text-red-600" />}
              {importResult.type === 'info' && <AlertCircle className="w-5 h-5 text-blue-600" />}
              <p className={`text-sm ${
                importResult.type === 'success' ? 'text-green-800' :
                importResult.type === 'error' ? 'text-red-800' :
                'text-blue-800'
              }`}>
                {importResult.message}
              </p>
            </div>
          )}
          
          {/* Excel Templates Section */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl text-white">Excel Şablonları</h2>
                  <p className="text-sm text-green-100 mt-0.5">
                    Veri girişi için hazır şablonları indirin
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Products Template */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Table className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-gray-900">Ürünler</h3>
                    <p className="text-xs text-gray-600">Ürün bilgileri şablonu</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('products')}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Şablonu İndir
                </button>
              </div>
              
              {/* Customers Template */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Table className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-gray-900">Müşteriler</h3>
                    <p className="text-xs text-gray-600">Müşteri bilgileri şablonu</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('customers')}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Şablonu İndir
                </button>
              </div>
              
              {/* Variants Template */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Table className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-gray-900">Varyantlar</h3>
                    <p className="text-xs text-gray-600">Beden/Renk varyantları</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('variants')}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Şablonu İndir
                </button>
              </div>
              
              {/* Categories Template */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-orange-500 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Table className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-gray-900">Kategoriler</h3>
                    <p className="text-xs text-gray-600">Kategori tanımları</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('categories')}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Şablonu İndir
                </button>
              </div>
              
              {/* Stock Template */}
              <div className="p-4 border border-gray-200 rounded-lg hover:border-red-500 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <Table className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-gray-900">Stok Hareketleri</h3>
                    <p className="text-xs text-gray-600">Giriş/Çıkış hareketleri</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate('stock')}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Şablonu İndir
                </button>
              </div>
            </div>
          </div>
          
          {/* Import/Export Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Products Import/Export */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                <h2 className="text-xl text-white">Ürün Veri İşlemleri</h2>
                <p className="text-sm text-blue-100 mt-0.5">
                  {products.length} ürün mevcut
                </p>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Export Products */}
                <div>
                  <h3 className="text-sm text-gray-700 mb-2">Mevcut Ürünleri Dışa Aktar</h3>
                  <button
                    onClick={() => handleExportData('products')}
                    disabled={products.length === 0}
                    className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Ürünleri Excel'e Aktar ({products.length})
                  </button>
                </div>
                
                {/* Import Products */}
                <div>
                  <h3 className="text-sm text-gray-700 mb-2">Excel'den Ürün İçe Aktar</h3>
                  <label className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer flex items-center justify-center gap-2">
                    <Upload className="w-5 h-5" />
                    Excel Dosyası Seç
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleImportFile(e, 'products')}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-600 mt-2">
                    * Lütfen yukarıdaki şablonu kullanın
                  </p>
                </div>
              </div>
            </div>
            
            {/* Customers Import/Export */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                <h2 className="text-xl text-white">Müşteri Veri İşlemleri</h2>
                <p className="text-sm text-green-100 mt-0.5">
                  {customers.length} müşteri mevcut
                </p>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Export Customers */}
                <div>
                  <h3 className="text-sm text-gray-700 mb-2">Mevcut Müşterileri Dışa Aktar</h3>
                  <button
                    onClick={() => handleExportData('customers')}
                    disabled={customers.length === 0}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Müşterileri Excel'e Aktar ({customers.length})
                  </button>
                </div>
                
                {/* Import Customers */}
                <div>
                  <h3 className="text-sm text-gray-700 mb-2">Excel'den Müşteri İçe Aktar</h3>
                  <label className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer flex items-center justify-center gap-2">
                    <Upload className="w-5 h-5" />
                    Excel Dosyası Seç
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => handleImportFile(e, 'customers')}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-600 mt-2">
                    * Lütfen yukarıdaki şablonu kullanın
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm text-blue-900 mb-1">Kullanım Bilgileri</h4>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>Excel şablonlarını indirerek kolon yapısını görebilirsiniz.</li>
                  <li>İçe aktarım sırasında şablon formatına uymanız gerekmektedir.</li>
                  <li>Dışa aktarım işlemi mevcut tüm verileri Excel dosyasına kaydeder.</li>
                  <li>İçe aktarılan veriler mevcut verilere eklenir (üzerine yazmaz).</li>
                  <li>Büyük veri setlerinde işlem birkaç saniye sürebilir.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
