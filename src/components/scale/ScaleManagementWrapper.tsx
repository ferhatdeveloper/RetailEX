import { useState } from 'react';
import { ScaleManagement } from './ScaleManagement';
import { ScaleDeviceModal } from './ScaleDeviceModal';
import { ScaleScannerModal } from './ScaleScannerModal';
import { ScaleProductSyncModal } from './ScaleProductSyncModal';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import type { Product } from '../../App';
import { normalizeOptionalScalePort } from '../../utils/scalePort';

interface ScaleManagementWrapperProps {
  products: Product[];
}

function loadLocalDevices(): ScaleDevice[] {
  try {
    const saved = localStorage.getItem('retailos_scale_devices');
    const parsed: ScaleDevice[] = saved ? JSON.parse(saved) : [];
    return parsed.map((d) => {
      const port = normalizeOptionalScalePort(d.port);
      return port != null ? { ...d, port } : { ...d, port: undefined };
    });
  } catch {
    return [];
  }
}

export function ScaleManagementWrapper({ products }: ScaleManagementWrapperProps) {
  const [devices, setDevices] = useState<ScaleDevice[]>(loadLocalDevices);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ScaleDevice | undefined>();
  const [syncDevice, setSyncDevice] = useState<ScaleDevice | undefined>();

  const persistLocal = (list: ScaleDevice[]) => {
    const normalized = list.map((d) => {
      const port = normalizeOptionalScalePort(d.port);
      return port != null ? { ...d, port } : { ...d, port: undefined };
    });
    setDevices(normalized);
    localStorage.setItem('retailos_scale_devices', JSON.stringify(normalized));
  };

  const handleSaveDevice = (device: ScaleDevice) => {
    const updated = editingDevice
      ? devices.map((d) => (d.id === device.id ? device : d))
      : [...devices, device];
    persistLocal(updated);
    setShowDeviceModal(false);
    setEditingDevice(undefined);
  };

  const handleDeleteDevice = (deviceId: string) => {
    persistLocal(devices.filter((d) => d.id !== deviceId));
  };

  const handleSyncComplete = (updatedDevice: ScaleDevice) => {
    persistLocal(devices.map((d) => (d.id === updatedDevice.id ? updatedDevice : d)));
    setShowSyncModal(false);
    setSyncDevice(undefined);
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
        <p className="font-medium">Doğrudan terazi bağlantısı (Rongta TCP)</p>
        <p className="mt-1 text-slate-600">
          Terazi köprüsü (ScaleBridge) bu sürümden kaldırıldı. PLU gönderimi masaüstü uygulamasında
          veya pg_bridge üzerinden doğrudan TCP ile yapılır. Ayrı yerel terazi uygulamanız varsa IP
          ve portu buradan tanımlayıp test edebilirsiniz.
        </p>
      </div>

      <ScaleManagement
        devices={devices}
        onDevicesChange={persistLocal}
        onDeleteDevice={handleDeleteDevice}
        onScanNetwork={() => setShowScannerModal(true)}
        onAddDevice={() => {
          setEditingDevice(undefined);
          setShowDeviceModal(true);
        }}
        onEditDevice={(device) => {
          setEditingDevice(device);
          setShowDeviceModal(true);
        }}
        onSyncProducts={(device) => {
          setSyncDevice(device);
          setShowSyncModal(true);
        }}
      />

      {showDeviceModal && (
        <ScaleDeviceModal
          device={editingDevice}
          onClose={() => {
            setShowDeviceModal(false);
            setEditingDevice(undefined);
          }}
          onSave={handleSaveDevice}
        />
      )}

      {showScannerModal && (
        <ScaleScannerModal
          onClose={() => setShowScannerModal(false)}
          onDevicesFound={(found) => {
            const added = found.map((scanned) => ({
              id: crypto.randomUUID(),
              name: `${(scanned.brand || 'generic').toUpperCase()} ${scanned.ipAddress}`,
              brand: scanned.brand || 'generic',
              model: scanned.model || 'Unknown',
              connectionType: 'tcp' as const,
              ipAddress: scanned.ipAddress,
              port: scanned.port,
              status: 'offline' as const,
            }));
            persistLocal([...devices, ...added]);
            setShowScannerModal(false);
          }}
        />
      )}

      {showSyncModal && syncDevice && (
        <ScaleProductSyncModal
          device={syncDevice}
          products={products}
          onClose={() => {
            setShowSyncModal(false);
            setSyncDevice(undefined);
          }}
          onComplete={handleSyncComplete}
        />
      )}
    </>
  );
}
