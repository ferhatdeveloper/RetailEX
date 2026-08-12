import { useEffect } from 'react';
import { useVersion } from '../contexts/VersionContext';

/**
 * Hook for automatic version increment on specific operations
 * Usage: Call trackOperation() after major changes
 */
export function useAutoVersion() {
  const { incrementVersion } = useVersion();

  // Track major operations and increment version
  const trackOperation = (operationType: OperationType, details?: string) => {
    const reason = getOperationReason(operationType, details);
    
    // Only increment for major operations
    if (shouldIncrementVersion(operationType)) {
      incrementVersion(reason);
    }
  };

  return { trackOperation };
}

export type OperationType = 
  // Sales operations
  | 'sale_complete'
  | 'sale_return'
  | 'sale_cancel'
  
  // Product operations
  | 'product_create'
  | 'product_update'
  | 'product_delete'
  | 'product_import'
  | 'price_update'
  
  // Customer operations
  | 'customer_create'
  | 'customer_update'
  | 'customer_delete'
  | 'customer_import'
  
  // Inventory operations
  | 'stock_adjustment'
  | 'stock_transfer'
  | 'inventory_count'
  
  // Campaign operations
  | 'campaign_create'
  | 'campaign_update'
  | 'campaign_delete'
  | 'campaign_activate'
  
  // System operations
  | 'settings_change'
  | 'user_create'
  | 'user_update'
  | 'role_change'
  | 'integration_setup'
  | 'report_generate'
  
  // Cash register operations
  | 'cash_register_open'
  | 'cash_register_close'
  | 'cash_count'
  
  // Invoice operations
  | 'invoice_create'
  | 'invoice_cancel'
  | 'einvoice_send'
  
  // Other
  | 'data_export'
  | 'data_import'
  | 'backup_create'
  | 'manual';

function getOperationReason(type: OperationType, details?: string): string {
  const reasons: Record<OperationType, string> = {
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
  return details ? `${baseReason}: ${details}` : baseReason;
}

function shouldIncrementVersion(type: OperationType): boolean {
  // Define which operations should increment version
  const criticalOperations: OperationType[] = [
    // Major sales operations
    'sale_complete',
    'sale_return',
    
    // Major product changes
    'product_create',
    'product_delete',
    'product_import',
    'price_update',
    
    // Major customer changes
    'customer_create',
    'customer_delete',
    'customer_import',
    
    // Major inventory operations
    'stock_adjustment',
    'stock_transfer',
    'inventory_count',
    
    // Campaign operations
    'campaign_create',
    'campaign_activate',
    
    // Critical system changes
    'settings_change',
    'user_create',
    'role_change',
    'integration_setup',
    
    // Cash register operations
    'cash_register_open',
    'cash_register_close',
    
    // Invoice operations
    'invoice_create',
    'einvoice_send',
    
    // Data operations
    'data_import',
    'backup_create',
    
    // Manual
    'manual'
  ];
  
  return criticalOperations.includes(type);
}

/**
 * Auto-track specific operations with event listeners
 */
export function useAutoVersionTracking() {
  const { trackOperation } = useAutoVersion();

  useEffect(() => {
    // Listen for sale completions
    const handleSaleComplete = (e: CustomEvent) => {
      trackOperation('sale_complete', e.detail?.saleId);
    };

    // Listen for product operations
    const handleProductCreate = (e: CustomEvent) => {
      trackOperation('product_create', e.detail?.productName);
    };

    // Listen for settings changes
    const handleSettingsChange = (e: CustomEvent) => {
      trackOperation('settings_change', e.detail?.setting);
    };

    // Add event listeners
    window.addEventListener('retailos:sale:complete' as any, handleSaleComplete);
    window.addEventListener('retailos:product:create' as any, handleProductCreate);
    window.addEventListener('retailos:settings:change' as any, handleSettingsChange);

    return () => {
      window.removeEventListener('retailos:sale:complete' as any, handleSaleComplete);
      window.removeEventListener('retailos:product:create' as any, handleProductCreate);
      window.removeEventListener('retailos:settings:change' as any, handleSettingsChange);
    };
  }, [trackOperation]);
}

/**
 * Emit version tracking events
 */
export function emitVersionEvent(type: OperationType, details?: any) {
  const event = new CustomEvent('retailos:version:increment', {
    detail: { type, details }
  });
  window.dispatchEvent(event);
}
