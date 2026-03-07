import { useState } from 'react';
import { ScaleManagement } from './ScaleManagement';
import { ScaleDeviceModal } from './ScaleDeviceModal';
import { ScaleScannerModal } from './ScaleScannerModal';
import { ScaleProductSyncModal } from './ScaleProductSyncModal';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import type { Product } from '../../App';

interface ScaleManagementWrapperProps {
  products: Product[];
}

export function ScaleManagementWrapper({ products }: ScaleManagementWrapperProps) {
  const [devices, setDevices] = useState<ScaleDevice[]>(() => {
    const saved = localStorage.getItem('retailos_scale_devices');
    return saved ? JSON.parse(saved) : [];
  });

  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ScaleDevice | undefined>();
  const [syncDevice, setSyncDevice] = useState<ScaleDevice | undefined>();

  const handleSaveDevice = (device: ScaleDevice) => {
    if (editingDevice) {
      // Update existing device
      setDevices(devices.map(d => d.id === device.id ? device : d));
    } else {
      // Add new device
      setDevices([...devices, device]);
    }
    
    // Save to localStorage
    const updatedDevices = editingDevice
      ? devices.map(d => d.id === device.id ? device : d)
      : [...devices, device];
    localStorage.setItem('retailos_scale_devices', JSON.stringify(updatedDevices));
    
    setShowDeviceModal(false);
    setEditingDevice(undefined);
  };

  const handleAddDevice = () => {
    setEditingDevice(undefined);
    setShowDeviceModal(true);
  };

  const handleEditDevice = (device: ScaleDevice) => {
    setEditingDevice(device);
    setShowDeviceModal(true);
  };

  const handleScanNetwork = () => {
    setShowScannerModal(true);
  };

  const handleDevicesFound = (foundDevices: ScaleDevice[]) => {
    const updatedDevices = [...devices, ...foundDevices];
    setDevices(updatedDevices);
    localStorage.setItem('retailos_scale_devices', JSON.stringify(updatedDevices));
    setShowScannerModal(false);
  };

  const handleSyncProducts = (device: ScaleDevice) => {
    setSyncDevice(device);
    setShowSyncModal(true);
  };

  const handleSyncComplete = (updatedDevice: ScaleDevice) => {
    setDevices(devices.map(d => d.id === updatedDevice.id ? updatedDevice : d));
    localStorage.setItem('retailos_scale_devices', JSON.stringify(
      devices.map(d => d.id === updatedDevice.id ? updatedDevice : d)
    ));
    setShowSyncModal(false);
    setSyncDevice(undefined);
  };

  return (
    <>
      <ScaleManagement
        onScanNetwork={handleScanNetwork}
        onAddDevice={handleAddDevice}
        onEditDevice={handleEditDevice}
        onSyncProducts={handleSyncProducts}
      />

      {showDeviceModal && (
        <ScaleDeviceModal
          device={editingDevice}
          onSave={handleSaveDevice}
          onClose={() => {
            setShowDeviceModal(false);
            setEditingDevice(undefined);
          }}
        />
      )}

      {showScannerModal && (
        <ScaleScannerModal
          onDevicesFound={handleDevicesFound}
          onClose={() => setShowScannerModal(false)}
        />
      )}

      {showSyncModal && syncDevice && (
        <ScaleProductSyncModal
          device={syncDevice}
          products={products}
          onSyncComplete={handleSyncComplete}
          onClose={() => {
            setShowSyncModal(false);
            setSyncDevice(undefined);
          }}
        />
      )}
    </>
  );
}



