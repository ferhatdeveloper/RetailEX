import { useState } from 'react';
import { X, Search, Wifi, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import type { ScannedDevice } from '../../utils/scaleScanner';
import { scanNetwork, validateIPRange, getDefaultIPRange } from '../../utils/scaleScanner';

interface ScaleScannerModalProps {
  onDevicesFound: (devices: ScaleDevice[]) => void;
  onClose: () => void;
}

export function ScaleScannerModal({ onDevicesFound, onClose }: ScaleScannerModalProps) {
  const defaultRange = getDefaultIPRange();
  
  const [startIP, setStartIP] = useState(defaultRange.startIP);
  const [endIP, setEndIP] = useState(defaultRange.endIP);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentIP: '' });
  const [foundDevices, setFoundDevices] = useState<ScannedDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleStartScan = async () => {
    setError(null);
    
    // Validate IP range
    if (!validateIPRange(startIP, endIP)) {
      setError('Geçersiz IP aralığı. İlk 3 oktet aynı olmalı ve başlangıç IP bitiş IP\'den küçük olmalıdır.');
      return;
    }

    setScanning(true);
    setFoundDevices([]);
    setSelectedDevices(new Set());
    setProgress({ current: 0, total: 0, currentIP: '' });

    try {
      const devices = await scanNetwork(startIP, endIP, (prog) => {
        setProgress(prog);
      });

      setFoundDevices(devices);
      
      // Auto-select all found devices
      const deviceIPs = new Set(devices.map(d => d.ipAddress));
      setSelectedDevices(deviceIPs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama sırasında hata oluştu');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleDevice = (ipAddress: string) => {
    const newSelected = new Set(selectedDevices);
    if (newSelected.has(ipAddress)) {
      newSelected.delete(ipAddress);
    } else {
      newSelected.add(ipAddress);
    }
    setSelectedDevices(newSelected);
  };

  const handleAddSelected = () => {
    const devicesToAdd: ScaleDevice[] = foundDevices
      .filter(d => selectedDevices.has(d.ipAddress) && d.isResponding)
      .map((d, index) => ({
        id: `scale-${Date.now()}-${index}`,
        name: `${d.brand?.toUpperCase() || 'Terazi'} - ${d.ipAddress}`,
        brand: d.brand || 'generic',
        model: d.model || 'Unknown',
        connectionType: 'tcp' as const,
        ipAddress: d.ipAddress,
        port: d.port,
        status: 'online' as const
      }));

    onDevicesFound(devicesToAdd);
  };

  const progressPercentage = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Ağ Tarama</h2>
              <p className="text-xs text-white/80 mt-0.5">Ağdaki terazileri otomatik olarak bulun</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Scan Settings */}
          <div className="mb-6">
            <h3 className="text-sm text-gray-900 mb-3">IP Aralığı</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">Başlangıç IP</label>
                <input
                  type="text"
                  value={startIP}
                  onChange={(e) => setStartIP(e.target.value)}
                  disabled={scanning}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm disabled:bg-gray-100"
                  placeholder="192.168.1.1"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-2">Bitiş IP</label>
                <input
                  type="text"
                  value={endIP}
                  onChange={(e) => setEndIP(e.target.value)}
                  disabled={scanning}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm disabled:bg-gray-100"
                  placeholder="192.168.1.254"
                />
              </div>
            </div>

            {error && (
              <div className="mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleStartScan}
              disabled={scanning}
              className="mt-4 w-full px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Search className="w-5 h-5" />
              <span>{scanning ? 'Taranıyor...' : 'Taramayı Başlat'}</span>
            </button>
          </div>

          {/* Progress */}
          {scanning && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">Tarama İlerlemesi</span>
                <span className="text-sm text-gray-900">{progressPercentage}%</span>
              </div>
              <div className="w-full bg-white rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              {progress.currentIP && (
                <p className="text-xs text-gray-600 mt-2 font-mono">
                  Taranan: {progress.currentIP}
                </p>
              )}
              <p className="text-xs text-gray-600 mt-1">
                {progress.current} / {progress.total} IP adresi tarandı
              </p>
            </div>
          )}

          {/* Results */}
          {foundDevices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-gray-900">
                  Bulunan Teraziler ({foundDevices.length})
                </h3>
                <button
                  onClick={() => {
                    const allIPs = new Set(foundDevices.map(d => d.ipAddress));
                    setSelectedDevices(selectedDevices.size === foundDevices.length ? new Set() : allIPs);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {selectedDevices.size === foundDevices.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                </button>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {foundDevices.map((device) => (
                  <div
                    key={device.ipAddress}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedDevices.has(device.ipAddress)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => handleToggleDevice(device.ipAddress)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          device.isResponding ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          <Wifi className={`w-5 h-5 ${device.isResponding ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-gray-900">
                              {device.brand?.toUpperCase() || 'Bilinmeyen Terazi'}
                            </h4>
                            {device.isResponding && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                Çevrimiçi
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Model: {device.model || 'Bilinmiyor'}
                          </p>
                          <p className="text-xs text-gray-500 font-mono mt-1">
                            {device.ipAddress}:{device.port}
                          </p>
                        </div>
                      </div>

                      {selectedDevices.has(device.ipAddress) && (
                        <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!scanning && foundDevices.length === 0 && progress.total > 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wifi className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-gray-900 mb-2">Terazi Bulunamadı</h3>
              <p className="text-sm text-gray-600">
                Belirtilen IP aralığında terazi tespit edilemedi.
                <br />
                Farklı bir aralık deneyin veya terazilerin açık ve ağa bağlı olduğundan emin olun.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {foundDevices.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedDevices.size} terazi seçildi
            </span>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAddSelected}
                disabled={selectedDevices.size === 0}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Seçilenleri Ekle ({selectedDevices.size})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

