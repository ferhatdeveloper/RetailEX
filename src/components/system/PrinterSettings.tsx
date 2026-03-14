import { useState, useEffect } from 'react';
import { Printer, Save, RefreshCw, CheckCircle, XCircle, Wifi, Usb } from 'lucide-react';
import { useElectron } from '../../hooks/useElectron';

interface PrinterConfig {
  enabled: boolean;
  type: 'thermal' | 'standard';
  interface: 'usb' | 'network' | 'serial';
  // Network
  ipAddress?: string;
  port?: number;
  // USB/Serial
  devicePath?: string;
  // Thermal printer settings
  width?: number; // 48 or 80 characters
  encoding?: string;
  // Standard printer
  paperSize?: 'A4' | 'A5' | '80mm';
  orientation?: 'portrait' | 'landscape';
  // Auto print & default language
  autoPrint?: boolean;
  defaultLanguage?: 'tr' | 'en' | 'ar' | 'ku';
}

export function PrinterSettings() {
  const { isElectron, api } = useElectron();
  
  const [config, setConfig] = useState<PrinterConfig>({
    enabled: true,
    type: 'thermal',
    interface: 'network',
    ipAddress: '192.168.1.100',
    port: 9100,
    width: 48,
    encoding: 'PC857_TURKISH',
    paperSize: 'A4',
    orientation: 'portrait',
    autoPrint: false,
    defaultLanguage: 'tr'
  });
  
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [availablePorts, setAvailablePorts] = useState<any[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  
  useEffect(() => {
    loadSettings();
    if (isElectron) {
      loadAvailablePrinters();
      loadAvailablePorts();
    }
  }, [isElectron]);
  
  const loadSettings = () => {
    const saved = localStorage.getItem('retailos-printer-settings');
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load printer settings:', error);
      }
    }
  };
  
  const saveSettings = () => {
    localStorage.setItem('retailos-printer-settings', JSON.stringify(config));
    
    // Save to Electron store if available
    if (api?.store) {
      api.store.set('printer', config);
    }
    
    alert('Yazıcı ayarları kaydedildi!');
  };
  
  const loadAvailablePrinters = async () => {
    if (!api?.printer) return;
    
    try {
      const result = await api.printer.listPrinters();
      if (result.success) {
        setAvailablePrinters(result.printers || []);
      }
    } catch (error) {
      console.error('Failed to load printers:', error);
    }
  };
  
  const loadAvailablePorts = async () => {
    if (!api?.barcode) return;
    
    try {
      const result = await api.barcode.listPorts();
      if (result.success) {
        setAvailablePorts(result.ports || []);
      }
    } catch (error) {
      console.error('Failed to load ports:', error);
    }
  };
  
  const testPrinter = async () => {
    setTestStatus('testing');
    setTestMessage('Bağlantı test ediliyor...');
    
    if (!isElectron || !api?.printer) {
      setTestStatus('error');
      setTestMessage('Yazıcı testi sadece Electron uygulamasında çalışır');
      return;
    }
    
    try {
      const testData = {
        config: {
          type: config.type === 'thermal' ? 'EPSON' : 'STANDARD',
          interface: config.interface === 'network' 
            ? `tcp://${config.ipAddress}:${config.port}`
            : config.interface === 'usb'
            ? 'usb'
            : config.devicePath || 'COM1',
          width: config.width || 48,
          encoding: config.encoding || 'PC857_TURKISH'
        },
        storeName: 'RetailOS Test',
        storeAddress: 'Test Adresi',
        storeTaxNo: '1234567890',
        invoiceNo: 'TEST-' + Date.now(),
        date: new Date().toISOString(),
        cashierName: 'Test Kullanıcı',
        items: [
          {
            productName: 'Test Ürün',
            quantity: 1,
            price: 10.00,
            total: 10.00
          }
        ],
        subtotal: 10.00,
        discount: 0,
        tax: 1.80,
        total: 11.80,
        payment: {
          method: 'Nakit',
          amount: 11.80
        }
      };
      
      const result = await api.printer.print(testData);
      
      if (result.success) {
        setTestStatus('success');
        setTestMessage('Test yazdırma başarılı!');
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Yazdırma başarısız');
      }
    } catch (error: any) {
      setTestStatus('error');
      setTestMessage(error.message || 'Yazıcı bağlantı hatası');
    }
  };
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">Yazıcı Ayarları</h2>
            <p className="text-sm text-gray-600">Fatura ve etiket yazdırma yapılandırması</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={testPrinter}
              disabled={!config.enabled || testStatus === 'testing'}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Test Yazdırma
            </button>
            <button
              onClick={saveSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Kaydet
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Electron Warning */}
          {!isElectron && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                ⚠️ Donanım yazıcı özellikleri sadece Electron desktop uygulamasında çalışır.
                Web uygulamasında standart tarayıcı yazdırma kullanılır.
              </p>
            </div>
          )}
          
          {/* Test Status */}
          {testStatus !== 'idle' && (
            <div className={`rounded-lg p-4 flex items-center gap-3 ${
              testStatus === 'testing' ? 'bg-blue-50 border border-blue-200' :
              testStatus === 'success' ? 'bg-green-50 border border-green-200' :
              'bg-red-50 border border-red-200'
            }`}>
              {testStatus === 'testing' && <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />}
              {testStatus === 'success' && <CheckCircle className="w-5 h-5 text-green-600" />}
              {testStatus === 'error' && <XCircle className="w-5 h-5 text-red-600" />}
              <p className={`text-sm ${
                testStatus === 'testing' ? 'text-blue-800' :
                testStatus === 'success' ? 'text-green-800' :
                'text-red-800'
              }`}>
                {testMessage}
              </p>
            </div>
          )}
          
          {/* General Settings */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg mb-4">Genel Ayarlar</h3>
            
            <div className="space-y-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="rounded"
                />
                <span>Yazıcı etkin</span>
              </label>
              
              <div>
                <label className="block text-sm text-gray-700 mb-2">Yazıcı Tipi</label>
                <select
                  value={config.type}
                  onChange={(e) => setConfig({ ...config, type: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="thermal">Termal Yazıcı (ESC/POS)</option>
                  <option value="standard">Standart Yazıcı (A4/A5)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-700 mb-2">Bağlantı Tipi</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setConfig({ ...config, interface: 'network' })}
                    className={`px-4 py-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                      config.interface === 'network'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Wifi className="w-6 h-6" />
                    <span className="text-sm">Network</span>
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, interface: 'usb' })}
                    className={`px-4 py-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                      config.interface === 'usb'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Usb className="w-6 h-6" />
                    <span className="text-sm">USB</span>
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, interface: 'serial' })}
                    className={`px-4 py-3 border-2 rounded-lg flex flex-col items-center gap-2 ${
                      config.interface === 'serial'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Printer className="w-6 h-6" />
                    <span className="text-sm">Serial</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoPrint}
                    onChange={(e) => setConfig({ ...config, autoPrint: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Otomatik Yazdır</span>
                    <span className="text-xs text-gray-500">Satış sonrası onay sormadan yazdır</span>
                  </div>
                </label>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">Varsayılan Fiş Dili</label>
                  <select
                    value={config.defaultLanguage || 'tr'}
                    onChange={(e) => setConfig({ ...config, defaultLanguage: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                    <option value="ar">العربية (Arapça)</option>
                    <option value="ku">Kurdî (Kürtçe)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          {/* Network Settings */}
          {config.interface === 'network' && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg mb-4">Network Ayarları</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">IP Adresi</label>
                  <input
                    type="text"
                    value={config.ipAddress || ''}
                    onChange={(e) => setConfig({ ...config, ipAddress: e.target.value })}
                    placeholder="192.168.1.100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Port</label>
                  <input
                    type="number"
                    value={config.port || 9100}
                    onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Serial/USB Settings */}
          {(config.interface === 'serial' || config.interface === 'usb') && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg mb-4">
                {config.interface === 'usb' ? 'USB' : 'Serial'} Ayarları
              </h3>
              
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Cihaz {config.interface === 'usb' ? 'Yolu' : 'Port'}
                </label>
                {availablePorts.length > 0 ? (
                  <select
                    value={config.devicePath || ''}
                    onChange={(e) => setConfig({ ...config, devicePath: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">Seçin...</option>
                    {availablePorts.map(port => (
                      <option key={port.path} value={port.path}>
                        {port.path} {port.manufacturer ? `(${port.manufacturer})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.devicePath || ''}
                    onChange={(e) => setConfig({ ...config, devicePath: e.target.value })}
                    placeholder="COM1 veya /dev/ttyUSB0"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                )}
                <button
                  onClick={loadAvailablePorts}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  <RefreshCw className="w-4 h-4 inline mr-1" />
                  Portları Yenile
                </button>
              </div>
            </div>
          )}
          
          {/* Thermal Printer Settings */}
          {config.type === 'thermal' && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg mb-4">Termal Yazıcı Ayarları</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Genişlik (Karakter)</label>
                  <select
                    value={config.width || 48}
                    onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value={48}>48 karakter (58mm)</option>
                    <option value={80}>80 karakter (80mm)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Karakter Seti</label>
                  <select
                    value={config.encoding || 'PC857_TURKISH'}
                    onChange={(e) => setConfig({ ...config, encoding: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="PC857_TURKISH">PC857 (Türkçe)</option>
                    <option value="PC850_MULTILINGUAL">PC850 (Multilingual)</option>
                    <option value="UTF8">UTF-8</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          
          {/* Standard Printer Settings */}
          {config.type === 'standard' && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg mb-4">Standart Yazıcı Ayarları</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Kağıt Boyutu</label>
                  <select
                    value={config.paperSize || 'A4'}
                    onChange={(e) => setConfig({ ...config, paperSize: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="A4">A4 (210x297mm)</option>
                    <option value="A5">A5 (148x210mm)</option>
                    <option value="80mm">80mm Rulo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Yönelim</label>
                  <select
                    value={config.orientation || 'portrait'}
                    onChange={(e) => setConfig({ ...config, orientation: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="portrait">Dikey</option>
                    <option value="landscape">Yatay</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

