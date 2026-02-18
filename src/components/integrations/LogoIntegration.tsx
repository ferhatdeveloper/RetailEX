import { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Download, RefreshCw, Server, Package, Users, CheckCircle, XCircle, Play, FileText, Send, Wifi, WifiOff, CloudUpload, Clock, FileDown } from 'lucide-react';
import type { Product, Customer } from '../../App';
import { exportInvoicesToLogoXML, downloadXMLFile } from '../../shared/logoXmlExport';
import { LogoGo3Integration } from './LogoGo3Integration';

interface LogoIntegrationProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface PendingInvoice {
  id: string;
  invoiceNo: string;
  type: 'sales' | 'purchase' | 'return';
  date: string;
  total: number;
  customerName: string;
  status: 'pending' | 'syncing' | 'synced' | 'error';
}

export function LogoIntegration({ products, setProducts, customers, setCustomers }: LogoIntegrationProps) {
  // Logo Type Selection
  const [logoType, setLogoType] = useState<'tiger' | 'go3'>('go3');
  
  // Logo API Connection settings (Tiger only)
  const [apiUrl, setApiUrl] = useState('');
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [firmCode, setFirmCode] = useState('');
  const [periodCode, setPeriodCode] = useState('');
  
  // SQL Server Connection settings (Go3 only)
  const [sqlServer, setSqlServer] = useState('');
  const [sqlDatabase, setSqlDatabase] = useState('');
  const [sqlUsername, setSqlUsername] = useState('');
  const [sqlPassword, setSqlPassword] = useState('');
  const [sqlFirmNo, setSqlFirmNo] = useState('');
  const [sqlPeriod, setSqlPeriod] = useState('');
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  
  // Preview data
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  // Sync settings
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState(5); // minutes
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // Pending invoices (offline'da kesilen faturalar)
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncLog, setSyncLog] = useState<string[]>([]);
  
  // Check online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Load pending invoices from localStorage
  useEffect(() => {
    const loadPendingInvoices = () => {
      const stored = localStorage.getItem('retailos_pending_invoices');
      if (stored) {
        try {
          const invoices = JSON.parse(stored);
          setPendingInvoices(invoices);
        } catch (error) {
          console.error('Failed to load pending invoices:', error);
        }
      }
    };
    
    loadPendingInvoices();
    
    // Listen for new invoices
    const handleNewInvoice = (event: CustomEvent) => {
      const invoice = event.detail;
      setPendingInvoices(prev => [...prev, invoice]);
      
      // Save to localStorage
      const updated = [...pendingInvoices, invoice];
      localStorage.setItem('retailos_pending_invoices', JSON.stringify(updated));
    };
    
    window.addEventListener('retailos:new-invoice' as any, handleNewInvoice);
    
    return () => {
      window.removeEventListener('retailos:new-invoice' as any, handleNewInvoice);
    };
  }, []);
  
  // Auto sync when online
  useEffect(() => {
    if (autoSync && isOnline && connectionStatus === 'connected' && pendingInvoices.some(i => i.status === 'pending')) {
      const timer = setTimeout(() => {
        handleSyncInvoices();
      }, syncInterval * 60 * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [autoSync, isOnline, connectionStatus, pendingInvoices, syncInterval]);
  
  // Test connection
  const handleTestConnection = async () => {
    setConnectionStatus('connecting');
    setConnectionError('');
    
    // Determine if running in Electron
    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.logo?.testConnection;
    
    try {
      if (isElectron) {
        // Use Electron API (no CORS issues)
        const result = await (window as any).electronAPI.logo.testConnection({
          apiUrl,
          username: apiUsername,
          password: apiPassword,
          firmCode,
          periodCode
        });
        
        if (result.success) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
          setConnectionError(result.error || 'Bağlantı hatası');
        }
      } else {
        // Direct browser API call
        const response = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: apiUsername,
            password: apiPassword,
            firmCode: firmCode
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.token) {
            // Store token for future requests
            sessionStorage.setItem('logo_api_token', data.token);
            setConnectionStatus('connected');
          } else {
            setConnectionStatus('error');
            setConnectionError('Geçersiz yanıt');
          }
        } else {
          setConnectionStatus('error');
          setConnectionError(`HTTP ${response.status}: ${response.statusText}`);
        }
      }
    } catch (error: any) {
      setConnectionStatus('error');
      
      // Check if it's a CORS error
      if (error.message?.includes('CORS') || error.name === 'TypeError') {
        setConnectionError(
          'CORS hatası: Logo API CORS izni vermiyor. Çözüm: (1) Electron uygulamasını kullanın, (2) Logo API\'de CORS ayarlarını yapın, veya (3) Backend proxy sunucu kullanın.'
        );
      } else {
        setConnectionError(error.message || 'Bağlantı hatası');
      }
    }
  };
  
  // Load preview data from Logo
  const handleLoadPreview = async () => {
    if (connectionStatus !== 'connected') {
      return;
    }
    
    setIsLoadingPreview(true);
    
    // Check if running in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.logo?.getPreviewData) {
      try {
        const result = await (window as any).electronAPI.logo.getPreviewData({
          apiUrl,
          username: apiUsername,
          password: apiPassword,
          firmCode,
          periodCode
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
          products: 842,
          customers: 312,
          salesInvoices: 1523,
          purchaseInvoices: 687,
          totalSales: 4250000,
          totalPurchases: 2180000
        });
      }, 1500);
    }
    
    setIsLoadingPreview(false);
  };
  
  // Sync pending invoices to Logo
  const handleSyncInvoices = async () => {
    const pendingItems = pendingInvoices.filter(i => i.status === 'pending');
    
    if (pendingItems.length === 0) {
      return;
    }
    
    if (!isOnline) {
      setConnectionError('İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edin.');
      return;
    }
    
    if (connectionStatus !== 'connected') {
      setConnectionError('Logo bağlantısı yapılandırılmamış. Lütfen önce bağlantı ayarlarını yapın.');
      return;
    }
    
    setSyncStatus('syncing');
    setSyncLog([]);
    
    const addLog = (message: string) => {
      setSyncLog(prev => [...prev, `[${new Date().toLocaleTimeString('tr-TR')}] ${message}`]);
    };
    
    addLog(`${pendingItems.length} fatura Logo'ya gönderiliyor...`);
    
    // Check if running in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.logo?.syncInvoices) {
      try {
        const result = await (window as any).electronAPI.logo.syncInvoices({
          apiUrl,
          username: apiUsername,
          password: apiPassword,
          firmCode,
          periodCode,
          invoices: pendingItems
        });
        
        if (result.success) {
          setSyncStatus('success');
          addLog(`✅ ${result.synced} fatura başarıyla gönderildi!`);
          
          // Update invoice statuses
          setPendingInvoices(prev => prev.map(inv => {
            if (result.syncedIds.includes(inv.id)) {
              return { ...inv, status: 'synced' as const };
            }
            return inv;
          }));
          
          setLastSyncTime(new Date());
          
          // Update localStorage
          localStorage.setItem('retailos_pending_invoices', JSON.stringify(
            pendingInvoices.map(inv => result.syncedIds.includes(inv.id) ? { ...inv, status: 'synced' } : inv)
          ));
        } else {
          setSyncStatus('error');
          addLog(`❌ Hata: ${result.error}`);
        }
      } catch (error: any) {
        setSyncStatus('error');
        addLog(`❌ Hata: ${error.message}`);
      }
    } else {
      // Mock sync for web demo
      for (let i = 0; i < pendingItems.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 800));
        addLog(`Fatura ${pendingItems[i].invoiceNo} gönderiliyor...`);
        
        // Update status
        setPendingInvoices(prev => prev.map(inv => 
          inv.id === pendingItems[i].id ? { ...inv, status: 'synced' as const } : inv
        ));
      }
      
      setSyncStatus('success');
      addLog(`✅ ${pendingItems.length} fatura başarıyla gönderildi!`);
      setLastSyncTime(new Date());
      
      // Update localStorage
      localStorage.setItem('retailos_pending_invoices', JSON.stringify(
        pendingInvoices.map(inv => pendingItems.find(p => p.id === inv.id) ? { ...inv, status: 'synced' } : inv)
      ));
    }
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Card Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-xl text-white">Logo Tiger / SQL & Go Entegrasyonu</h2>
              <p className="text-sm text-orange-100 mt-0.5">
                REST API ile çift yönlü veri senkronizasyonu
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Online Status */}
            {isOnline ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500 rounded-lg">
                <Wifi className="w-4 h-4 text-white" />
                <span className="text-sm text-white">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500 rounded-lg">
                <WifiOff className="w-4 h-4 text-white" />
                <span className="text-sm text-white">Offline</span>
              </div>
            )}
            
            {/* Connection Status */}
            {connectionStatus === 'connected' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 rounded-lg">
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
        {/* Logo Type Selection */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-sm text-gray-700">Logo Tipi:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="logoType"
              value="tiger"
              checked={logoType === 'tiger'}
              onChange={() => setLogoType('tiger')}
              className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-900">Logo Tiger (REST API)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="logoType"
              value="go3"
              checked={logoType === 'go3'}
              onChange={() => setLogoType('go3')}
              className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-900">Logo Go3 / SQL&Go (SQL Server + XML)</span>
          </label>
        </div>
        
        {/* Step 1: Connection Settings */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white">
              1
            </div>
            <h3 className="text-lg text-gray-900">API Bağlantı Ayarları</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pl-10">
            <div className="col-span-2">
              <label className="block text-sm text-gray-700 mb-1.5">
                <Server className="w-4 h-4 inline mr-1" />
                Logo API URL
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://your-logo-server.com:8080/api"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                value={apiUsername}
                onChange={(e) => setApiUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                Şifre
              </label>
              <input
                type="password"
                value={apiPassword}
                onChange={(e) => setApiPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                Firma Kodu
              </label>
              <input
                type="text"
                value={firmCode}
                onChange={(e) => setFirmCode(e.target.value)}
                placeholder="001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            
            <div>
              <label className="block text-sm text-gray-700 mb-1.5">
                Dönem Kodu
              </label>
              <input
                type="text"
                value={periodCode}
                onChange={(e) => setPeriodCode(e.target.value)}
                placeholder="2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
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
              disabled={!apiUrl || !apiUsername || !apiPassword || !firmCode || connectionStatus === 'connecting'}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white">
                2
              </div>
              <h3 className="text-lg text-gray-900">Logo'daki Veriler</h3>
            </div>
            
            <div className="pl-10">
              {!previewData ? (
                <button
                  onClick={handleLoadPreview}
                  disabled={isLoadingPreview}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-center gap-2 text-orange-600 mb-2">
                      <Package className="w-5 h-5" />
                      <span className="text-sm">Ürünler</span>
                    </div>
                    <div className="text-2xl text-orange-900">{previewData.products?.toLocaleString('tr-TR')}</div>
                  </div>
                  
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 text-green-600 mb-2">
                      <Users className="w-5 h-5" />
                      <span className="text-sm">Müşteriler</span>
                    </div>
                    <div className="text-2xl text-green-900">{previewData.customers?.toLocaleString('tr-TR')}</div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-600 mb-2">
                      <FileText className="w-5 h-5" />
                      <span className="text-sm">Satış Faturaları</span>
                    </div>
                    <div className="text-2xl text-blue-900">{previewData.salesInvoices?.toLocaleString('tr-TR')}</div>
                  </div>
                  
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center gap-2 text-purple-600 mb-2">
                      <FileText className="w-5 h-5" />
                      <span className="text-sm">Alış Faturaları</span>
                    </div>
                    <div className="text-2xl text-purple-900">{previewData.purchaseInvoices?.toLocaleString('tr-TR')}</div>
                  </div>
                  
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="flex items-center gap-2 text-teal-600 mb-2">
                      <span className="text-sm">Toplam Satış</span>
                    </div>
                    <div className="text-xl text-teal-900">
                      {previewData.totalSales?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
                    <div className="flex items-center gap-2 text-rose-600 mb-2">
                      <span className="text-sm">Toplam Alış</span>
                    </div>
                    <div className="text-xl text-rose-900">
                      {previewData.totalPurchases?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Step 3: Pending Invoices (Offline Kesilen Faturalar) */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white">
              3
            </div>
            <h3 className="text-lg text-gray-900">Bekleyen Faturalar (Logo'ya Gönderilecek)</h3>
          </div>
          
          <div className="pl-10">
            {logoType === 'go3' ? (
              <LogoGo3Integration
                pendingInvoices={pendingInvoices as any}
                onInvoicesExported={(invoiceIds) => {
                  // Mark as exported
                  setPendingInvoices(prev => prev.map(inv => 
                    invoiceIds.includes(inv.id) ? { ...inv, status: 'synced' as const } : inv
                  ));
                  localStorage.setItem('retailos_pending_invoices', JSON.stringify(
                    pendingInvoices.map(inv => invoiceIds.includes(inv.id) ? { ...inv, status: 'synced' } : inv)
                  ));
                }}
              />
            ) : (
              <>
            {/* Sync Settings */}
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <span className="text-sm text-gray-700">Otomatik Senkronizasyon</span>
                </label>
                
                {autoSync && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Her</label>
                    <select
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(Number(e.target.value))}
                      className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value={1}>1</option>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={30}>30</option>
                    </select>
                    <label className="text-sm text-gray-700">dakikada</label>
                  </div>
                )}
              </div>
              
              {lastSyncTime && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>Son senkronizasyon: {lastSyncTime.toLocaleString('tr-TR')}</span>
                </div>
              )}
            </div>
            
            {/* Pending Invoices List */}
            {pendingInvoices.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>Bekleyen fatura yok</p>
                <p className="text-sm mt-1">Offline kesilen faturalar burada görünecek</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      invoice.status === 'synced'
                        ? 'bg-green-50 border-green-200'
                        : invoice.status === 'error'
                        ? 'bg-red-50 border-red-200'
                        : invoice.status === 'syncing'
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className={`w-5 h-5 ${
                        invoice.status === 'synced' ? 'text-green-600' :
                        invoice.status === 'error' ? 'text-red-600' :
                        invoice.status === 'syncing' ? 'text-blue-600' :
                        'text-yellow-600'
                      }`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900">{invoice.invoiceNo}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            invoice.type === 'sales' ? 'bg-blue-100 text-blue-700' :
                            invoice.type === 'purchase' ? 'bg-purple-100 text-purple-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {invoice.type === 'sales' ? 'Satış' : invoice.type === 'purchase' ? 'Alış' : 'İade'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {invoice.customerName} • {invoice.date} • {invoice.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      {invoice.status === 'synced' && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      {invoice.status === 'error' && (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      {invoice.status === 'syncing' && (
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      )}
                      {invoice.status === 'pending' && (
                        <Clock className="w-5 h-5 text-yellow-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Sync Button */}
            {pendingInvoices.some(i => i.status === 'pending') && (
              <div className="mt-4 space-y-3">
                <button
                  onClick={handleSyncInvoices}
                  disabled={!isOnline || connectionStatus !== 'connected' || syncStatus === 'syncing'}
                  className="w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {syncStatus === 'syncing' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Logo'ya Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <CloudUpload className="w-5 h-5" />
                      Logo'ya Gönder ({pendingInvoices.filter(i => i.status === 'pending').length} Fatura)
                    </>
                  )}
                </button>
                
                {!isOnline && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <WifiOff className="w-5 h-5 text-red-600" />
                    <p className="text-sm text-red-800">İnternet bağlantısı yok. Bağlantı sağlandığında otomatik senkronize edilecek.</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Sync Log */}
            {syncLog.length > 0 && (
              <div className="mt-4 bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-48">
                {syncLog.map((log, index) => (
                  <div key={index}>{log}</div>
                ))}
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
