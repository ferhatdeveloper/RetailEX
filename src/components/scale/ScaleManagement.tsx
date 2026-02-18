import { useState, useEffect } from 'react';
import { Plus, Wifi, WifiOff, Settings, Trash2, RefreshCw, Send, Search, Download, Upload } from 'lucide-react';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import { testScaleConnection, getScaleInfo } from '../../utils/scaleProtocol';

interface ScaleManagementProps {
  onScanNetwork: () => void;
  onAddDevice: () => void;
  onEditDevice: (device: ScaleDevice) => void;
  onSyncProducts: (device: ScaleDevice) => void;
}

export function ScaleManagement({ onScanNetwork, onAddDevice, onEditDevice, onSyncProducts }: ScaleManagementProps) {
  const [devices, setDevices] = useState<ScaleDevice[]>(() => {
    const saved = localStorage.getItem('retailos_scale_devices');
    return saved ? JSON.parse(saved) : [];
  });
  const [testingDevice, setTestingDevice] = useState<string | null>(null);
  const [refreshingDevice, setRefreshingDevice] = useState<string | null>(null);

  // Save devices to localStorage
  useEffect(() => {
    localStorage.setItem('retailos_scale_devices', JSON.stringify(devices));
  }, [devices]);

  // Test connection
  const handleTestConnection = async (device: ScaleDevice) => {
    setTestingDevice(device.id);
    
    try {
      const isConnected = await testScaleConnection(device);
      
      // Update device status
      setDevices(devices.map(d => 
        d.id === device.id 
          ? { ...d, status: isConnected ? 'online' : 'offline' }
          : d
      ));
      
      if (isConnected) {
        // Get device info
        const info = await getScaleInfo(device);
        setDevices(devices.map(d => 
          d.id === device.id 
            ? { 
                ...d, 
                firmwareVersion: info.firmwareVersion,
                productCount: info.productCount
              }
            : d
        ));
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setDevices(devices.map(d => 
        d.id === device.id 
          ? { ...d, status: 'error' }
          : d
      ));
    } finally {
      setTestingDevice(null);
    }
  };

  // Refresh device info
  const handleRefreshDevice = async (device: ScaleDevice) => {
    setRefreshingDevice(device.id);
    
    try {
      const isConnected = await testScaleConnection(device);
      
      if (isConnected) {
        const info = await getScaleInfo(device);
        setDevices(devices.map(d => 
          d.id === device.id 
            ? { 
                ...d, 
                status: 'online',
                firmwareVersion: info.firmwareVersion,
                productCount: info.productCount
              }
            : d
        ));
      } else {
        setDevices(devices.map(d => 
          d.id === device.id 
            ? { ...d, status: 'offline' }
            : d
        ));
      }
    } catch (error) {
      console.error('Refresh device error:', error);
    } finally {
      setRefreshingDevice(null);
    }
  };

  // Delete device
  const handleDeleteDevice = (deviceId: string) => {
    if (confirm('Bu teraziyi silmek istediğinizden emin misiniz?')) {
      setDevices(devices.filter(d => d.id !== deviceId));
    }
  };

  // Test all connections
  const handleTestAllConnections = async () => {
    for (const device of devices) {
      await handleTestConnection(device);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  const getBrandIcon = (brand: ScaleDevice['brand']) => {
    const brandColors = {
      bizerba: 'bg-blue-500',
      toledo: 'bg-green-500',
      mettler: 'bg-purple-500',
      digi: 'bg-orange-500',
      cas: 'bg-red-500',
      dibal: 'bg-cyan-500',
      generic: 'bg-gray-500'
    };
    
    return brandColors[brand] || brandColors.generic;
  };

  const getStatusColor = (status: ScaleDevice['status']) => {
    switch (status) {
      case 'online':
        return 'text-green-600 bg-green-50';
      case 'offline':
        return 'text-gray-600 bg-gray-50';
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'syncing':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusText = (status: ScaleDevice['status']) => {
    switch (status) {
      case 'online':
        return 'Çevrimiçi';
      case 'offline':
        return 'Çevrimdışı';
      case 'error':
        return 'Hata';
      case 'syncing':
        return 'Senkronize Ediliyor';
      default:
        return 'Bilinmiyor';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-blue-50/30 via-gray-50 to-blue-50/20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-gray-900">Terazi Yönetimi</h1>
            <p className="text-sm text-gray-600 mt-1">
              Terazileri yönetin, ürün gönderimi yapın
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestAllConnections}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tümünü Test Et</span>
            </button>
            
            <button
              onClick={onScanNetwork}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <Search className="w-4 h-4" />
              <span>Ağı Tara</span>
            </button>
            
            <button
              onClick={onAddDevice}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Terazi</span>
            </button>
          </div>
        </div>
      </div>

      {/* Device List */}
      <div className="flex-1 overflow-auto p-6">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Wifi className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-gray-900 mb-2">Henüz terazi eklenmemiş</h3>
            <p className="text-sm text-gray-600 mb-6 max-w-md">
              Ağınızdaki terazileri otomatik olarak tarayabilir veya manuel olarak ekleyebilirsiniz
            </p>
            <div className="flex gap-3">
              <button
                onClick={onScanNetwork}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                <Search className="w-5 h-5" />
                <span>Ağı Tara</span>
              </button>
              <button
                onClick={onAddDevice}
                className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Manuel Ekle</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map(device => (
              <div
                key={device.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Device Header */}
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${getBrandIcon(device.brand)} rounded-lg flex items-center justify-center text-white flex-shrink-0`}>
                        <Wifi className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-gray-900 truncate">{device.name}</h3>
                        <p className="text-xs text-gray-600 truncate">
                          {device.brand.toUpperCase()} - {device.model}
                        </p>
                      </div>
                    </div>
                    
                    <div className={`px-2 py-1 rounded text-xs flex-shrink-0 ${getStatusColor(device.status)}`}>
                      {getStatusText(device.status)}
                    </div>
                  </div>
                </div>

                {/* Device Details */}
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bağlantı:</span>
                    <span className="text-gray-900">
                      {device.connectionType === 'tcp' && 'TCP/IP'}
                      {device.connectionType === 'usb' && 'USB'}
                      {device.connectionType === 'serial' && 'Serial Port'}
                    </span>
                  </div>
                  
                  {device.connectionType === 'tcp' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">IP Adresi:</span>
                        <span className="text-gray-900 font-mono text-xs">{device.ipAddress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Port:</span>
                        <span className="text-gray-900">{device.port}</span>
                      </div>
                    </>
                  )}
                  
                  {device.connectionType === 'serial' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-600">COM Port:</span>
                        <span className="text-gray-900">{device.comPort}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Baud Rate:</span>
                        <span className="text-gray-900">{device.baudRate}</span>
                      </div>
                    </>
                  )}
                  
                  {device.firmwareVersion && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Firmware:</span>
                      <span className="text-gray-900">{device.firmwareVersion}</span>
                    </div>
                  )}
                  
                  {device.productCount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ürün Sayısı:</span>
                      <span className="text-gray-900">{device.productCount}</span>
                    </div>
                  )}
                  
                  {device.lastSync && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Son Senkronizasyon:</span>
                      <span className="text-gray-900 text-xs">
                        {new Date(device.lastSync).toLocaleString('tr-TR')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => handleTestConnection(device)}
                    disabled={testingDevice === device.id}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white text-gray-700 rounded border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
                  >
                    {testingDevice === device.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Test Ediliyor...</span>
                      </>
                    ) : device.status === 'online' ? (
                      <>
                        <Wifi className="w-4 h-4 text-green-600" />
                        <span>Bağlı</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-4 h-4 text-gray-400" />
                        <span>Test Et</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={() => handleRefreshDevice(device)}
                    disabled={refreshingDevice === device.id}
                    className="px-3 py-2 bg-white text-gray-700 rounded border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    title="Bilgileri Yenile"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshingDevice === device.id ? 'animate-spin' : ''}`} />
                  </button>
                  
                  <button
                    onClick={() => onSyncProducts(device)}
                    disabled={device.status !== 'online'}
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Ürün Gönder"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => onEditDevice(device)}
                    className="px-3 py-2 bg-white text-gray-700 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                    title="Düzenle"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => handleDeleteDevice(device.id)}
                    className="px-3 py-2 bg-white text-red-600 rounded border border-gray-200 hover:bg-red-50 transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {devices.length > 0 && (
        <div className="bg-white border-t border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-600">
                  Çevrimiçi: <span className="text-gray-900">{devices.filter(d => d.status === 'online').length}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span className="text-gray-600">
                  Çevrimdışı: <span className="text-gray-900">{devices.filter(d => d.status === 'offline').length}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-gray-600">
                  Hata: <span className="text-gray-900">{devices.filter(d => d.status === 'error').length}</span>
                </span>
              </div>
            </div>
            
            <span className="text-gray-600">
              Toplam: <span className="text-gray-900">{devices.length}</span> terazi
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

