import { useState, useEffect } from 'react';
import { ScaleManagement } from './ScaleManagement';
import { ScaleDeviceModal } from './ScaleDeviceModal';
import { ScaleScannerModal } from './ScaleScannerModal';
import { ScaleProductSyncModal } from './ScaleProductSyncModal';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import type { Product } from '../../App';
import {
  getScaleBridgeUrl,
  setScaleBridgeUrl,
  getScaleBridgeToken,
  setScaleBridgeToken,
  scaleBridgePing,
  scaleBridgeListDevices,
  scaleBridgeSaveDevice,
  scaleBridgeDeleteDevice,
  isScaleBridgeMode,
} from '../../services/scaleBridgeApi';

interface ScaleManagementWrapperProps {
  products: Product[];
}

function loadLocalDevices(): ScaleDevice[] {
  try {
    const saved = localStorage.getItem('retailos_scale_devices');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function ScaleManagementWrapper({ products }: ScaleManagementWrapperProps) {
  const [devices, setDevices] = useState<ScaleDevice[]>(loadLocalDevices);
  const [bridgeUrl, setBridgeUrl] = useState(getScaleBridgeUrl);
  const [bridgeToken, setBridgeToken] = useState(getScaleBridgeToken);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [showBridgeSettings, setShowBridgeSettings] = useState(false);

  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ScaleDevice | undefined>();
  const [syncDevice, setSyncDevice] = useState<ScaleDevice | undefined>();

  const bridgeMode = isScaleBridgeMode();

  const persistLocal = (list: ScaleDevice[]) => {
    localStorage.setItem('retailos_scale_devices', JSON.stringify(list));
  };

  const refreshFromBridge = async () => {
    if (!getScaleBridgeUrl()) return;
    try {
      const list = await scaleBridgeListDevices();
      setDevices(list);
      persistLocal(list);
      setBridgeOnline(true);
    } catch {
      setBridgeOnline(false);
    }
  };

  useEffect(() => {
    if (bridgeMode) {
      void refreshFromBridge();
    }
  }, [bridgeUrl]);

  const handleSaveBridgeSettings = async () => {
    setScaleBridgeUrl(bridgeUrl);
    setScaleBridgeToken(bridgeToken);
    setShowBridgeSettings(false);
    if (bridgeUrl) {
      const ok = await scaleBridgePing();
      setBridgeOnline(ok);
      if (ok) await refreshFromBridge();
    }
  };

  const handleSaveDevice = async (device: ScaleDevice) => {
    if (bridgeMode) {
      const saved = await scaleBridgeSaveDevice(device);
      const updated = editingDevice
        ? devices.map((d) => (d.id === saved.id ? saved : d))
        : [...devices, saved];
      setDevices(updated);
      persistLocal(updated);
    } else {
      const updated = editingDevice
        ? devices.map((d) => (d.id === device.id ? device : d))
        : [...devices, device];
      setDevices(updated);
      persistLocal(updated);
    }
    setShowDeviceModal(false);
    setEditingDevice(undefined);
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (bridgeMode) {
      await scaleBridgeDeleteDevice(deviceId);
    }
    const updated = devices.filter((d) => d.id !== deviceId);
    setDevices(updated);
    persistLocal(updated);
  };

  const handleSyncComplete = (updatedDevice: ScaleDevice) => {
    const updated = devices.map((d) => (d.id === updatedDevice.id ? updatedDevice : d));
    setDevices(updated);
    persistLocal(updated);
    setShowSyncModal(false);
    setSyncDevice(undefined);
  };

  return (
    <>
      {showBridgeSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg text-gray-900 mb-2">Terazi Köprüsü (Windows Servisi)</h3>
            <p className="text-sm text-gray-600 mb-4">
              Mağaza PC&apos;sindeki köprü URL&apos;si. Merkezden gönderimde bu adrese istek gider;
              uygulama kapalı olsa bile servis teraziye iletir.
            </p>
            <label className="block text-sm text-gray-700 mb-1">Köprü URL</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3 font-mono text-sm"
              placeholder="http://192.168.1.50:3012"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
            />
            <label className="block text-sm text-gray-700 mb-1">Token (isteğe bağlı)</label>
            <input
              className="w-full border rounded px-3 py-2 mb-4 font-mono text-sm"
              placeholder="scale-bridge.json authToken"
              value={bridgeToken}
              onChange={(e) => setBridgeToken(e.target.value)}
            />
            <p className="text-xs text-gray-500 mb-4">
              Yerel config: <code>C:\ProgramData\RetailEX\scale-bridge.json</code>
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
                onClick={() => setShowBridgeSettings(false)}
              >
                İptal
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => void handleSaveBridgeSettings()}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      <ScaleManagement
        devices={devices}
        onDevicesChange={setDevices}
        bridgeMode={bridgeMode}
        bridgeOnline={bridgeOnline}
        onOpenBridgeSettings={() => setShowBridgeSettings(true)}
        onDeleteDevice={(id) => void handleDeleteDevice(id)}
        onScanNetwork={() => setShowScannerModal(true)}
        onAddDevice={() => { setEditingDevice(undefined); setShowDeviceModal(true); }}
        onEditDevice={(device) => { setEditingDevice(device); setShowDeviceModal(true); }}
        onSyncProducts={(device) => { setSyncDevice(device); setShowSyncModal(true); }}
      />

      {showDeviceModal && (
        <ScaleDeviceModal
          device={editingDevice}
          onSave={(d) => void handleSaveDevice(d)}
          onClose={() => { setShowDeviceModal(false); setEditingDevice(undefined); }}
        />
      )}

      {showScannerModal && (
        <ScaleScannerModal
          onDevicesFound={(found) => {
            const updated = [...devices, ...found];
            setDevices(updated);
            persistLocal(updated);
            setShowScannerModal(false);
          }}
          onClose={() => setShowScannerModal(false)}
        />
      )}

      {showSyncModal && syncDevice && (
        <ScaleProductSyncModal
          device={syncDevice}
          products={products}
          onSyncComplete={handleSyncComplete}
          onClose={() => { setShowSyncModal(false); setSyncDevice(undefined); }}
        />
      )}
    </>
  );
}
