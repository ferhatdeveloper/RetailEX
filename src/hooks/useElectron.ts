import { useEffect, useState } from 'react';

interface ElectronAPI {
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    clear: () => Promise<boolean>;
  };
  logo: {
    testConnection: (config: any) => Promise<any>;
    getPreviewData: (config: any) => Promise<any>;
    syncInvoices: (config: any) => Promise<any>;
  };
  nebim: {
    testConnection: (config: any) => Promise<any>;
    getPreviewData: (config: any) => Promise<any>;
    fetchData: (config: any) => Promise<any>;
  };
  barcode: {
    start: (config: any) => Promise<any>;
    stop: () => Promise<any>;
    listPorts: () => Promise<any>;
    onScanned: (callback: (barcode: string) => void) => void;
    removeListener: () => void;
  };
  printer: {
    print: (printData: any) => Promise<any>;
    listPrinters: () => Promise<any>;
  };
  cashDrawer: {
    open: (config: any) => Promise<any>;
  };
  sync: {
    getPendingInvoices: () => Promise<any>;
    addInvoice: (invoice: any) => Promise<any>;
    updateStatus: (invoiceId: string, status: string) => Promise<any>;
  };
  update: {
    install: () => Promise<void>;
    onAvailable: (callback: () => void) => void;
    onDownloaded: (callback: () => void) => void;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
  };
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function useElectron() {
  const [isElectron, setIsElectron] = useState(false);
  const [version, setVersion] = useState<string>('');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    const checkElectron = async () => {
      if (window.electronAPI?.isElectron) {
        setIsElectron(true);
        
        try {
          const appVersion = await window.electronAPI.app.getVersion();
          const appPlatform = await window.electronAPI.app.getPlatform();
          setVersion(appVersion);
          setPlatform(appPlatform);
        } catch (error) {
          console.error('Electron version/platform alınamadı:', error);
        }
      }
    };

    checkElectron();
  }, []);

  return {
    isElectron,
    version,
    platform,
    api: window.electronAPI
  };
}

// Barcode Scanner Hook
export function useBarcodeScanner(onScan: (barcode: string) => void, enabled: boolean = true) {
  const { isElectron, api } = useElectron();

  useEffect(() => {
    if (!isElectron || !enabled || !api?.barcode) {
      return;
    }

    // Start barcode scanner
    const startScanner = async () => {
      try {
        // Get saved port from settings or use default
        const savedPort = await api.store.get('barcode.port');
        const port = savedPort || 'COM3';

        await api.barcode.start({ port });
        console.log('✅ Barkod okuyucu başlatıldı:', port);

        // Listen for scanned barcodes
        api.barcode.onScanned(onScan);
      } catch (error) {
        console.error('❌ Barkod okuyucu başlatılamadı:', error);
      }
    };

    startScanner();

    // Cleanup
    return () => {
      if (api?.barcode) {
        api.barcode.stop();
        api.barcode.removeListener();
      }
    };
  }, [isElectron, enabled, onScan, api]);

  return { isElectron };
}

// Auto-Update Hook
export function useAutoUpdate() {
  const { isElectron, api } = useElectron();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  useEffect(() => {
    if (!isElectron || !api?.update) {
      return;
    }

    api.update.onAvailable(() => {
      setUpdateAvailable(true);
      console.log('ğŸ”” Yeni güncelleme mevcut!');
    });

    api.update.onDownloaded(() => {
      setUpdateDownloaded(true);
      console.log('✅ Güncelleme indirildi!');
    });
  }, [isElectron, api]);

  const installUpdate = async () => {
    if (api?.update) {
      await api.update.install();
    }
  };

  return {
    updateAvailable,
    updateDownloaded,
    installUpdate
  };
}

// Offline Sync Hook
export function useOfflineSync() {
  const { isElectron, api } = useElectron();

  const addInvoice = async (invoice: any) => {
    if (!isElectron || !api?.sync) {
      // Fallback to localStorage
      const existing = localStorage.getItem('retailos_pending_invoices');
      const invoices = existing ? JSON.parse(existing) : [];
      invoices.push({ ...invoice, status: 'pending' });
      localStorage.setItem('retailos_pending_invoices', JSON.stringify(invoices));
      return;
    }

    await api.sync.addInvoice(invoice);
  };

  const getPendingInvoices = async () => {
    if (!isElectron || !api?.sync) {
      // Fallback to localStorage
      const existing = localStorage.getItem('retailos_pending_invoices');
      return existing ? JSON.parse(existing) : [];
    }

    const result = await api.sync.getPendingInvoices();
    return result;
  };

  const updateInvoiceStatus = async (invoiceId: string, status: string) => {
    if (!isElectron || !api?.sync) {
      // Fallback to localStorage
      const existing = localStorage.getItem('retailos_pending_invoices');
      if (existing) {
        const invoices = JSON.parse(existing);
        const updated = invoices.map((inv: any) =>
          inv.id === invoiceId ? { ...inv, status } : inv
        );
        localStorage.setItem('retailos_pending_invoices', JSON.stringify(updated));
      }
      return;
    }

    await api.sync.updateStatus(invoiceId, status);
  };

  return {
    isElectron,
    addInvoice,
    getPendingInvoices,
    updateInvoiceStatus
  };
}

