import { useState, useEffect } from 'react';
import { X, Wifi } from 'lucide-react';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import { getDefaultPort, getDefaultBaudRate, testScaleConnection } from '../../utils/scaleProtocol';
import { RONGTA_DEFAULT_IP } from '../../utils/rongtaRlsProtocol';
import { validateIPAddress } from '../../utils/scaleScanner';
import { formatScalePortInput, normalizeOptionalScalePort } from '../../utils/scalePort';

interface ScaleDeviceModalProps {
  device?: ScaleDevice;
  onSave: (device: ScaleDevice) => void;
  onClose: () => void;
}

export function ScaleDeviceModal({ device, onSave, onClose }: ScaleDeviceModalProps) {
  const [formData, setFormData] = useState<Partial<ScaleDevice>>({
    name: device?.name || '',
    brand: device?.brand || 'rongta',
    model: device?.model || 'RLS1100',
    connectionType: device?.connectionType || 'tcp',
    ipAddress: device?.ipAddress || RONGTA_DEFAULT_IP,
    port: normalizeOptionalScalePort(device?.port),
    comPort: device?.comPort || 'COM1',
    baudRate: device?.baudRate || 9600,
    status: device?.status || 'offline'
  });
  const [portInput, setPortInput] = useState(() => formatScalePortInput(device?.port));

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resolvePortFromInput = (raw: string): number | undefined => normalizeOptionalScalePort(raw);

  // Update defaults when brand changes (new device only)
  useEffect(() => {
    if (formData.brand && !device) {
      const brand = formData.brand as ScaleDevice['brand'];
      const suggestedPort = brand === 'rongta' ? undefined : getDefaultPort(brand);
      setFormData(prev => ({
        ...prev,
        port: suggestedPort,
        baudRate: getDefaultBaudRate(brand),
        ...(brand === 'rongta'
          ? { ipAddress: RONGTA_DEFAULT_IP, model: 'RLS1100', connectionType: 'tcp' as const }
          : {}),
      }));
      setPortInput(suggestedPort != null ? String(suggestedPort) : '');
    }
  }, [formData.brand, device]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Terazi adı gerekli';
    }

    if (!formData.model?.trim()) {
      newErrors.model = 'Model gerekli';
    }

    if (formData.connectionType === 'tcp') {
      if (!formData.ipAddress?.trim()) {
        newErrors.ipAddress = 'IP adresi gerekli';
      } else if (!validateIPAddress(formData.ipAddress)) {
        newErrors.ipAddress = 'Geçersiz IP adresi';
      }

      if (portInput.trim() !== '') {
        const port = resolvePortFromInput(portInput);
        if (port == null || port < 1 || port > 65535) {
          newErrors.port = 'Geçerli port (1-65535) girin veya alanı boş bırakın';
        }
      }
    }

    if (formData.connectionType === 'serial') {
      if (!formData.comPort?.trim()) {
        newErrors.comPort = 'COM port gerekli';
      }

      if (!formData.baudRate || formData.baudRate < 1) {
        newErrors.baudRate = 'Geçersiz baud rate';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) {
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const resolvedPort = resolvePortFromInput(portInput);
      const tempDevice: ScaleDevice = {
        id: device?.id || 'temp',
        name: formData.name!,
        brand: formData.brand!,
        model: formData.model!,
        connectionType: formData.connectionType!,
        ipAddress: formData.ipAddress,
        port: resolvedPort,
        comPort: formData.comPort,
        baudRate: formData.baudRate,
        status: 'offline'
      };

      const isConnected = await testScaleConnection(tempDevice);
      setTestResult(isConnected ? 'success' : 'error');
      
      if (isConnected) {
        setFormData(prev => ({ ...prev, status: 'online' }));
      }
    } catch (error) {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    const resolvedPort = resolvePortFromInput(portInput);
    const newDevice: ScaleDevice = {
      id: device?.id || `scale-${Date.now()}`,
      name: formData.name!,
      brand: formData.brand!,
      model: formData.model!,
      connectionType: formData.connectionType!,
      ipAddress: formData.ipAddress,
      port: resolvedPort,
      comPort: formData.comPort,
      baudRate: formData.baudRate,
      status: formData.status || 'offline',
      lastSync: device?.lastSync,
      productCount: device?.productCount,
      firmwareVersion: device?.firmwareVersion
    };

    onSave(newDevice);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-white">
              {device ? 'Terazi Düzenle' : 'Yeni Terazi Ekle'}
            </h2>
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
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Terazi Adı <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Örn: Meyve Sebze Terazisi"
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">
                  Model <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.model ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Örn: BS-800"
                />
                {errors.model && (
                  <p className="text-xs text-red-500 mt-1">{errors.model}</p>
                )}
              </div>
            </div>

            {/* Brand */}
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Marka <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value as ScaleDevice['brand'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="rongta">Rongta (RLS1000 / RLS1100)</option>
                <option value="bizerba">Bizerba</option>
                <option value="toledo">Toledo</option>
                <option value="mettler">Mettler Toledo</option>
                <option value="digi">Digi</option>
                <option value="cas">CAS</option>
                <option value="dibal">Dibal</option>
                <option value="generic">Genel / Diğer</option>
              </select>
            </div>

            {/* Connection Type */}
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Bağlantı Tipi <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, connectionType: 'tcp' })}
                  className={`px-4 py-3 border-2 rounded text-sm transition-all ${
                    formData.connectionType === 'tcp'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  TCP/IP (Ağ)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, connectionType: 'usb' })}
                  className={`px-4 py-3 border-2 rounded text-sm transition-all ${
                    formData.connectionType === 'usb'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  USB
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, connectionType: 'serial' })}
                  className={`px-4 py-3 border-2 rounded text-sm transition-all ${
                    formData.connectionType === 'serial'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Serial (COM)
                </button>
              </div>
            </div>

            {/* TCP/IP Settings */}
            {formData.connectionType === 'tcp' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    IP Adresi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.ipAddress}
                    onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                      errors.ipAddress ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="192.168.1.100"
                  />
                  {errors.ipAddress && (
                    <p className="text-xs text-red-500 mt-1">{errors.ipAddress}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Port <span className="text-gray-400 text-xs">(isteğe bağlı)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={portInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      setPortInput(raw);
                      setFormData({ ...formData, port: resolvePortFromInput(raw) });
                    }}
                    onBlur={() => {
                      const normalized = formatScalePortInput(portInput);
                      if (normalized !== portInput) {
                        setPortInput(normalized);
                        setFormData({ ...formData, port: resolvePortFromInput(normalized) });
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.port ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Boş = otomatik tarama"
                  />
                  {errors.port && (
                    <p className="text-xs text-red-500 mt-1">{errors.port}</p>
                  )}
                </div>
              </div>
            )}

            {/* Serial Settings */}
            {formData.connectionType === 'serial' && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    COM Port <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.comPort}
                    onChange={(e) => setFormData({ ...formData, comPort: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm ${
                      errors.comPort ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="COM1"
                  />
                  {errors.comPort && (
                    <p className="text-xs text-red-500 mt-1">{errors.comPort}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-2">
                    Baud Rate <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.baudRate}
                    onChange={(e) => setFormData({ ...formData, baudRate: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="9600">9600</option>
                    <option value="19200">19200</option>
                    <option value="38400">38400</option>
                    <option value="57600">57600</option>
                    <option value="115200">115200</option>
                  </select>
                  {errors.baudRate && (
                    <p className="text-xs text-red-500 mt-1">{errors.baudRate}</p>
                  )}
                </div>
              </div>
            )}

            {/* USB Settings */}
            {formData.connectionType === 'usb' && (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-gray-700">
                  USB bağlantısı otomatik olarak tespit edilecektir. Teraziyi USB portuna bağlayın ve test edin.
                </p>
              </div>
            )}

            {formData.brand === 'rongta' && formData.connectionType === 'tcp' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-700">
                <p className="font-medium text-gray-900 mb-1">Rongta RLS1000 / RLS1100</p>
                <p>Windows köprüsünde TeraziRongta ile aynı yöntem: <strong>rtslabelscale.dll</strong> — yalnızca IP yeterli (TCP port DLL modunda kullanılmaz).</p>
                <p className="mt-1">RLS1000 Windows yazılımı gerekmez. Terazi ile PC aynı LAN segmentinde olmalıdır.</p>
                <p className="mt-1">Varsayılan IP: <span className="font-mono">{RONGTA_DEFAULT_IP}</span> — terazi açılış ekranından doğrulayın.</p>
                <p className="mt-1">TCP köprüsü modunda port boş bırakılırsa 20304, 4001, 3001, 3000, 4000, 5000, 8000, 8001, 8080, 9000, 10001 sırayla denenir.</p>
              </div>
            )}

            {/* Test Connection */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm text-gray-900">Bağlantı Testi</h4>
                  <p className="text-xs text-gray-600 mt-1">Terazi ile bağlantıyı test edin</p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {testing ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </button>
              </div>
              
              {testResult && (
                <div className={`px-3 py-2 rounded text-sm ${
                  testResult === 'success' 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {testResult === 'success' 
                    ? '✓ Bağlantı başarılı! Terazi çevrimiçi.' 
                    : '✗ Bağlantı başarısız. Ayarları kontrol edin.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm"
          >
            {device ? 'Güncelle' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  );
}

