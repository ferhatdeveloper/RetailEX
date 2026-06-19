import { useState, useEffect, useCallback } from 'react';
import { ScaleManagement } from './ScaleManagement';
import { ScaleDeviceModal } from './ScaleDeviceModal';
import { ScaleScannerModal } from './ScaleScannerModal';
import { ScaleProductSyncModal } from './ScaleProductSyncModal';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import type { Product } from '../../App';
import { ERP_SETTINGS } from '../../services/postgres';
import { normalizeOptionalScalePort } from '../../utils/scalePort';
import {
  getScaleBridgeUrl,
  setScaleBridgeUrl,
  getScaleBridgeToken,
  setScaleBridgeToken,
  scaleBridgeHealthCheck,
  scaleBridgeListDevices,
  scaleBridgeSaveDevice,
  scaleBridgeDeleteDevice,
  isScaleBridgeMode,
  resolveScaleBridgeSource,
  applyScaleBridgeFromStore,
  autoApplyScaleBridgeForFirm,
  loadStoresWithScaleBridge,
  clearScaleBridgeManualOverride,
  setScaleBridgeStoreId,
  getScaleBridgeStoreId,
  syncScaleBridgeFromWebConfig,
  type StoreScaleBridgeRow,
} from '../../services/scaleBridgeApi';

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

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manuel ayar',
  store: 'Mağaza kaydı',
  tenant: 'Merkez kiracı kaydı',
  none: 'Tanımsız',
};

export function ScaleManagementWrapper({ products }: ScaleManagementWrapperProps) {
  const [devices, setDevices] = useState<ScaleDevice[]>(loadLocalDevices);
  const [bridgeUrl, setBridgeUrl] = useState(getScaleBridgeUrl);
  const [bridgeToken, setBridgeToken] = useState(getScaleBridgeToken);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [bridgeAuthOk, setBridgeAuthOk] = useState(true);
  const [bridgeStatusMessage, setBridgeStatusMessage] = useState<string | undefined>();
  const [bridgeSource, setBridgeSource] = useState(resolveScaleBridgeSource);
  const [showBridgeSettings, setShowBridgeSettings] = useState(false);
  const [storeRows, setStoreRows] = useState<StoreScaleBridgeRow[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(getScaleBridgeStoreId);

  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<ScaleDevice | undefined>();
  const [syncDevice, setSyncDevice] = useState<ScaleDevice | undefined>();

  const bridgeMode = isScaleBridgeMode();

  const persistLocal = (list: ScaleDevice[]) => {
    const normalized = list.map((d) => {
      const port = normalizeOptionalScalePort(d.port);
      return port != null ? { ...d, port } : { ...d, port: undefined };
    });
    localStorage.setItem('retailos_scale_devices', JSON.stringify(normalized));
  };

  const refreshBridgeState = useCallback(() => {
    setBridgeUrl(getScaleBridgeUrl());
    setBridgeToken(getScaleBridgeToken());
    setBridgeSource(resolveScaleBridgeSource());
    setSelectedStoreId(getScaleBridgeStoreId());
  }, []);

  const refreshFromBridge = useCallback(async () => {
    if (!getScaleBridgeUrl()) return;
    try {
      const list = await scaleBridgeListDevices();
      setDevices(list);
      persistLocal(list);
    } catch (e) {
      console.warn('[ScaleBridge] cihaz listesi:', e);
    }
  }, []);

  const applyBridgeHealth = useCallback(async () => {
    if (!getScaleBridgeUrl()) {
      setBridgeOnline(false);
      setBridgeAuthOk(false);
      setBridgeStatusMessage('Köprü URL tanımlı değil — Köprü Ayarlarından mağaza adresini girin');
      return;
    }
    const health = await scaleBridgeHealthCheck();
    setBridgeOnline(health.reachable);
    setBridgeAuthOk(health.authenticated);
    setBridgeStatusMessage(health.message);
    if (health.reachable && health.authenticated) {
      await refreshFromBridge();
    }
  }, [refreshFromBridge]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        syncScaleBridgeFromWebConfig();
        const firmNr = ERP_SETTINGS.firmNr || '001';
        await autoApplyScaleBridgeForFirm(firmNr);
        if (cancelled) return;
        refreshBridgeState();
        const rows = await loadStoresWithScaleBridge(firmNr);
        if (cancelled) return;
        setStoreRows(rows);
        if (getScaleBridgeUrl() && !cancelled) {
          await applyBridgeHealth();
        }
      } catch (e) {
        console.warn('[ScaleBridge] init:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBridgeState, applyBridgeHealth]);

  useEffect(() => {
    if (bridgeMode && bridgeUrl) {
      void applyBridgeHealth();
    }
  }, [bridgeUrl, bridgeMode, applyBridgeHealth]);

  useEffect(() => {
    if (!bridgeMode || !bridgeUrl) return;
    const id = window.setInterval(() => {
      void applyBridgeHealth();
    }, 20_000);
    return () => window.clearInterval(id);
  }, [bridgeMode, bridgeUrl, applyBridgeHealth]);

  const handleStoreBridgeSelect = async (storeId: string) => {
    setSelectedStoreId(storeId);
    const store = storeRows.find((s) => s.id === storeId);
    if (!store) return;
    clearScaleBridgeManualOverride();
    applyScaleBridgeFromStore(store);
    refreshBridgeState();
    await applyBridgeHealth();
  };

  const handleSaveBridgeSettings = async () => {
    setScaleBridgeUrl(bridgeUrl, { manual: true });
    setScaleBridgeToken(bridgeToken, { manual: true });
    setScaleBridgeStoreId('');
    setSelectedStoreId('');
    setShowBridgeSettings(false);
    refreshBridgeState();
    if (bridgeUrl) {
      await applyBridgeHealth();
    }
  };

  const handleResetToTenant = () => {
    clearScaleBridgeManualOverride();
    setScaleBridgeStoreId('');
    setSelectedStoreId('');
    syncScaleBridgeFromWebConfig(true);
    refreshBridgeState();
    setBridgeUrl(getScaleBridgeUrl());
    setBridgeToken(getScaleBridgeToken());
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

  const openLocalBridgeAdmin = () => {
    const url = 'http://127.0.0.1:3012/ui/';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const storesWithBridge = storeRows.filter((s) => (s.scale_bridge_url || '').trim());

  return (
    <>
      {showBridgeSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg text-gray-900 mb-2">Terazi Köprüsü (Windows Servisi)</h3>
            <p className="text-sm text-gray-600 mb-2">
              Mağaza PC&apos;sindeki köprü URL&apos;si. Merkezden gönderimde bu adrese istek gider;
              uygulama kapalı olsa bile servis teraziye iletir.
            </p>
            <p className="text-xs text-blue-700 mb-4">
              Kaynak: {SOURCE_LABELS[bridgeSource] || bridgeSource}
              {bridgeUrl ? ` — ${bridgeUrl}` : ''}
            </p>

            {storesWithBridge.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-1">Mağaza köprüsü</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={selectedStoreId}
                  onChange={(e) => void handleStoreBridgeSelect(e.target.value)}
                >
                  <option value="">— Mağaza seçin —</option>
                  {storesWithBridge.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.scale_bridge_url})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Mağaza kaydındaki URL, merkez kiracı varsayılanının üzerine yazar.
                </p>
              </div>
            )}

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
              <br />
              Mağaza PC yönetim arayüzü:{' '}
              <a
                href="http://127.0.0.1:3012/ui/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                http://127.0.0.1:3012/ui/
              </a>
              {' '}(yalnızca köprü kurulu PC&apos;de)
            </p>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 rounded"
                onClick={handleResetToTenant}
              >
                Merkez kaydına dön
              </button>
              <div className="flex gap-2">
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
        </div>
      )}

      <ScaleManagement
        devices={devices}
        onDevicesChange={setDevices}
        bridgeMode={bridgeMode}
        bridgeOnline={bridgeOnline}
        bridgeAuthOk={bridgeAuthOk}
        bridgeStatusMessage={bridgeStatusMessage}
        bridgeSourceLabel={SOURCE_LABELS[bridgeSource]}
        onRefreshBridge={() => void applyBridgeHealth()}
        onOpenBridgeSettings={() => {
          refreshBridgeState();
          setBridgeUrl(getScaleBridgeUrl());
          setBridgeToken(getScaleBridgeToken());
          setShowBridgeSettings(true);
        }}
        onOpenLocalBridgeAdmin={openLocalBridgeAdmin}
        onDeleteDevice={(id) => void handleDeleteDevice(id)}
        onScanNetwork={() => setShowScannerModal(true)}
        onAddDevice={() => { setEditingDevice(undefined); setShowDeviceModal(true); }}
        onEditDevice={(device) => { setEditingDevice(device); setShowDeviceModal(true); }}
        onSyncProducts={(device) => { setSyncDevice(device); setShowSyncModal(true); }}
      />

      {showDeviceModal && (
        <ScaleDeviceModal
          key={editingDevice?.id ?? 'new-scale-device'}
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
