import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { APP_VERSION } from '../core/version';

interface VersionContextType {
  version: string;
  fullVersion: string;
  buildNumber: number;
  incrementVersion: (reason?: string) => void;
  versionHistory: VersionHistoryEntry[];
}

interface VersionHistoryEntry {
  version: number;
  timestamp: string;
  reason?: string;
  user?: string;
}

const VersionContext = createContext<VersionContextType | undefined>(undefined);

export function VersionProvider({ children }: { children: React.ReactNode }) {
  const [buildNumber, setBuildNumber] = useState(APP_VERSION.build);
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>(() => {
    const saved = localStorage.getItem('retailos_version_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Load version from localStorage on mount
  useEffect(() => {
    const savedBuild = localStorage.getItem('retailos_build_number');
    if (savedBuild) {
      const build = parseInt(savedBuild, 10);
      if (!isNaN(build)) {
        setBuildNumber(build);
        APP_VERSION.build = build;
      }
    }
  }, []);

  // Auto-increment version on specific actions
  const incrementVersion = useCallback((reason?: string) => {
    const newBuild = buildNumber + 1;
    setBuildNumber(newBuild);
    APP_VERSION.build = newBuild;
    
    // Save to localStorage
    localStorage.setItem('retailos_build_number', newBuild.toString());
    
    // Add to history
    const historyEntry: VersionHistoryEntry = {
      version: newBuild,
      timestamp: new Date().toISOString(),
      reason: reason || 'Manuel güncelleme',
      user: localStorage.getItem('retailos_current_user') || 'System'
    };
    
    const newHistory = [...versionHistory, historyEntry].slice(-50); // Keep last 50 entries
    setVersionHistory(newHistory);
    localStorage.setItem('retailos_version_history', JSON.stringify(newHistory));
    
    console.log(`ğŸ”„ Version updated to ${newBuild} - ${reason || 'No reason provided'}`);
  }, [buildNumber, versionHistory]);

  // Auto-increment on major operations (listen to custom events)
  useEffect(() => {
    const handleVersionEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { type, details } = customEvent.detail || {};
      
      if (type) {
        const reason = getOperationReason(type, details);
        incrementVersion(reason);
      }
    };

    window.addEventListener('retailos:version:increment' as any, handleVersionEvent);
    return () => window.removeEventListener('retailos:version:increment' as any, handleVersionEvent);
  }, [incrementVersion]);

  const value: VersionContextType = {
    version: `Version ${buildNumber}`,
    fullVersion: `${APP_VERSION.major}.${APP_VERSION.minor}.${buildNumber}`,
    buildNumber,
    incrementVersion,
    versionHistory
  };

  return (
    <VersionContext.Provider value={value}>
      {children}
    </VersionContext.Provider>
  );
}

export function useVersion() {
  const context = useContext(VersionContext);
  if (context === undefined) {
    throw new Error('useVersion must be used within a VersionProvider');
  }
  return context;
}

// Helper function to trigger version increment from anywhere
export function triggerVersionIncrement(reason: string) {
  localStorage.setItem('retailos_auto_version_trigger', JSON.stringify({ 
    reason, 
    timestamp: Date.now() 
  }));
  window.dispatchEvent(new Event('storage'));
}

// Helper function to get operation reason
function getOperationReason(type: string, details: any): string {
  const reasons: Record<string, string> = {
    // Sales
    sale_complete: 'Satış tamamlandı',
    sale_return: 'İade işlemi',
    sale_cancel: 'Satış iptal edildi',
    
    // Products
    product_create: 'Ürün oluşturuldu',
    product_update: 'Ürün güncellendi',
    product_delete: 'Ürün silindi',
    product_import: 'Ürünler içe aktarıldı',
    price_update: 'Fiyat güncellendi',
    
    // Customers
    customer_create: 'Müşteri oluşturuldu',
    customer_update: 'Müşteri güncellendi',
    customer_delete: 'Müşteri silindi',
    customer_import: 'Müşteriler içe aktarıldı',
    
    // Inventory
    stock_adjustment: 'Stok düzeltme',
    stock_transfer: 'Stok transferi',
    inventory_count: 'Sayım yapıldı',
    
    // Campaigns
    campaign_create: 'Kampanya oluşturuldu',
    campaign_update: 'Kampanya güncellendi',
    campaign_delete: 'Kampanya silindi',
    campaign_activate: 'Kampanya aktifleştirildi',
    
    // System
    settings_change: 'Ayarlar değiştirildi',
    user_create: 'Kullanıcı oluşturuldu',
    user_update: 'Kullanıcı güncellendi',
    role_change: 'Rol değiştirildi',
    integration_setup: 'Entegrasyon kuruldu',
    report_generate: 'Rapor oluşturuldu',
    
    // Cash register
    cash_register_open: 'Kasa açıldı',
    cash_register_close: 'Kasa kapatıldı',
    cash_count: 'Sayım yapıldı',
    
    // Invoice
    invoice_create: 'Fatura oluşturuldu',
    invoice_cancel: 'Fatura iptal edildi',
    einvoice_send: 'E-Fatura gönderildi',
    
    // Other
    data_export: 'Veri dışa aktarıldı',
    data_import: 'Veri içe aktarıldı',
    backup_create: 'Yedek oluşturuldu',
    manual: 'Manuel güncelleme'
  };
  
  const baseReason = reasons[type] || 'Bilinmeyen işlem';
  
  // Format details if available
  if (details) {
    if (details.saleId) return `${baseReason} (#${details.saleId})`;
    if (details.productName) return `${baseReason}: ${details.productName}`;
    if (details.total) return `${baseReason} (${details.total.toFixed(2)})`;
  }
  
  return baseReason;
}
