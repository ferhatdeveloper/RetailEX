/**
 * Backup & Restore System
 * Otomatik yedekleme, cloud backup, 1-click restore
 */

import { logger } from './logger';
import { dbCache } from './indexedDBCache';

export interface BackupData {
  id: string;
  timestamp: number;
  version: string;
  type: 'manual' | 'auto' | 'cloud';
  size: number;
  data: {
    sales: any[];
    products: any[];
    customers: any[];
    settings: any;
    campaigns: any[];
    users: any[];
  };
  compressed?: boolean;
}

class BackupRestoreSystem {
  private autoBackupInterval: number | null = null;

  /**
   * Tam yedek oluştur
   */
  async createBackup(type: 'manual' | 'auto' | 'cloud' = 'manual'): Promise<BackupData> {
    try {
      logger.log('backup', `Creating ${type} backup...`);

      // Tüm verileri topla
      const data = {
        sales: await this.getSalesData(),
        products: await this.getProductsData(),
        customers: await this.getCustomersData(),
        settings: await this.getSettingsData(),
        campaigns: await this.getCampaignsData(),
        users: await this.getUsersData()
      };

      const backup: BackupData = {
        id: `backup_${Date.now()}`,
        timestamp: Date.now(),
        version: '1.0.0',
        type,
        size: JSON.stringify(data).length,
        data
      };

      // IndexedDB'ye kaydet
      await dbCache.set(`backup_${backup.id}`, backup, 'system', Infinity);
      
      // LocalStorage'a son yedek bilgisini kaydet
      localStorage.setItem('retailos_last_backup', JSON.stringify({
        id: backup.id,
        timestamp: backup.timestamp,
        type: backup.type,
        size: backup.size
      }));

      logger.log('backup', `Backup created successfully`, { id: backup.id, size: backup.size });
      
      return backup;
    } catch (error) {
      logger.error('backup', 'Backup creation failed', error);
      throw error;
    }
  }

  /**
   * Yede

ği geri yükle
   */
  async restoreBackup(backupId: string): Promise<void> {
    try {
      logger.log('backup', `Restoring backup ${backupId}...`);

      const backup = await dbCache.get<BackupData>(`backup_${backupId}`, 'system');
      if (!backup) {
        throw new Error('Backup not found');
      }

      // Verileri geri yükle
      await this.restoreSalesData(backup.data.sales);
      await this.restoreProductsData(backup.data.products);
      await this.restoreCustomersData(backup.data.customers);
      await this.restoreSettingsData(backup.data.settings);
      await this.restoreCampaignsData(backup.data.campaigns);
      await this.restoreUsersData(backup.data.users);

      logger.log('backup', 'Backup restored successfully');
    } catch (error) {
      logger.error('backup', 'Backup restore failed', error);
      throw error;
    }
  }

  /**
   * Yedekleri listele
   */
  async listBackups(): Promise<BackupData[]> {
    try {
      const backups: BackupData[] = [];
      
      // IndexedDB'den yedekleri al (simplified version)
      const keys = await this.getBackupKeys();
      for (const key of keys) {
        const backup = await dbCache.get<BackupData>(key, 'system');
        if (backup) {
          backups.push(backup);
        }
      }

      return backups.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      logger.error('backup', 'Failed to list backups', error);
      return [];
    }
  }

  /**
   * Yedek sil
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      await dbCache.delete(`backup_${backupId}`, 'system');
      logger.log('backup', `Backup ${backupId} deleted`);
    } catch (error) {
      logger.error('backup', 'Failed to delete backup', error);
      throw error;
    }
  }

  /**
   * Otomatik yedekleme başlat (her 6 saatte bir)
   */
  startAutoBackup(intervalHours: number = 6): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    this.autoBackupInterval = window.setInterval(async () => {
      try {
        await this.createBackup('auto');
        logger.log('backup', 'Auto backup completed');
      } catch (error) {
        logger.error('backup', 'Auto backup failed', error);
      }
    }, intervalMs);

    logger.log('backup', `Auto backup started (every ${intervalHours} hours)`);
  }

  /**
   * Otomatik yedekleme durdur
   */
  stopAutoBackup(): void {
    if (this.autoBackupInterval) {
      clearInterval(this.autoBackupInterval);
      this.autoBackupInterval = null;
      logger.log('backup', 'Auto backup stopped');
    }
  }

  /**
   * Yedeği dosya olarak indir
   */
  async downloadBackup(backupId: string): Promise<void> {
    try {
      const backup = await dbCache.get<BackupData>(`backup_${backupId}`, 'system');
      if (!backup) {
        throw new Error('Backup not found');
      }

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `retailos_backup_${new Date(backup.timestamp).toISOString().slice(0, 10)}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      
      logger.log('backup', 'Backup downloaded');
    } catch (error) {
      logger.error('backup', 'Download failed', error);
      throw error;
    }
  }

  /**
   * Dosyadan yedek yükle
   */
  async uploadBackup(file: File): Promise<string> {
    try {
      const text = await file.text();
      const backup: BackupData = JSON.parse(text);
      
      // Validate backup
      if (!backup.id || !backup.data) {
        throw new Error('Invalid backup file');
      }

      // Save to IndexedDB
      await dbCache.set(`backup_${backup.id}`, backup, 'system', Infinity);
      
      logger.log('backup', 'Backup uploaded', { id: backup.id });
      
      return backup.id;
    } catch (error) {
      logger.error('backup', 'Upload failed', error);
      throw error;
    }
  }

  // Private helper methods for data collection and restoration

  private async getSalesData(): Promise<any[]> {
    const sales = localStorage.getItem('retailos_sales');
    return sales ? JSON.parse(sales) : [];
  }

  private async getProductsData(): Promise<any[]> {
    return await dbCache.get('products', 'data') || [];
  }

  private async getCustomersData(): Promise<any[]> {
    return await dbCache.get('customers', 'data') || [];
  }

  private async getSettingsData(): Promise<any> {
    return {
      language: localStorage.getItem('retailos_language'),
      theme: localStorage.getItem('retailos_theme'),
      rtlMode: localStorage.getItem('retailos_rtl_mode'),
      fontSize: localStorage.getItem('retailos_font_size'),
      gridColumns: localStorage.getItem('retailos_grid_columns')
    };
  }

  private async getCampaignsData(): Promise<any[]> {
    return await dbCache.get('campaigns', 'data') || [];
  }

  private async getUsersData(): Promise<any[]> {
    return await dbCache.get('users', 'data') || [];
  }

  private async restoreSalesData(sales: any[]): Promise<void> {
    localStorage.setItem('retailos_sales', JSON.stringify(sales));
  }

  private async restoreProductsData(products: any[]): Promise<void> {
    await dbCache.set('products', products, 'data', Infinity);
  }

  private async restoreCustomersData(customers: any[]): Promise<void> {
    await dbCache.set('customers', customers, 'data', Infinity);
  }

  private async restoreSettingsData(settings: any): Promise<void> {
    if (settings.language) localStorage.setItem('retailos_language', settings.language);
    if (settings.theme) localStorage.setItem('retailos_theme', settings.theme);
    if (settings.rtlMode) localStorage.setItem('retailos_rtl_mode', settings.rtlMode);
    if (settings.fontSize) localStorage.setItem('retailos_font_size', settings.fontSize);
    if (settings.gridColumns) localStorage.setItem('retailos_grid_columns', settings.gridColumns);
  }

  private async restoreCampaignsData(campaigns: any[]): Promise<void> {
    await dbCache.set('campaigns', campaigns, 'data', Infinity);
  }

  private async restoreUsersData(users: any[]): Promise<void> {
    await dbCache.set('users', users, 'data', Infinity);
  }

  private async getBackupKeys(): Promise<string[]> {
    // Simplified - in real implementation, would query IndexedDB
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('retailos_backup_')) {
        keys.push(key.replace('retailos_', ''));
      }
    }
    return keys;
  }
}

export const backupRestore = new BackupRestoreSystem();

