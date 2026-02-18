/**
 * Enterprise Central Data Management & Synchronization System
 * Kurumsal seviye merkezi veri yönetimi ve senkronizasyon sistemi
 * v2.0 - Advanced Features Edition
 */

import { logger } from './logger';
import { dbCache } from './indexedDBCache';

export interface BroadcastMessage {
  id: string;
  type: 'product' | 'price' | 'customer' | 'campaign' | 'config' | 'inventory' | 'user' | 'report' | 'notification' | 'bulk' | 'custom';
  action: 'create' | 'update' | 'delete' | 'sync' | 'bulk_sync' | 'partial_sync' | 'force_sync';
  data: any;
  targetDevices: string[]; // ['all'] veya belirli cihaz ID'leri veya grup ID'leri
  targetGroups?: string[]; // Cihaz grupları
  targetStores?: string[]; // Mağaza filtreleme
  targetRegions?: string[]; // Bölge filtreleme
  conditions?: BroadcastCondition[]; // Koşullu yayın
  priority: 'low' | 'normal' | 'high' | 'urgent' | 'critical';
  channel: 'websocket' | 'api' | 'mqtt' | 'signalr' | 'auto'; // Çoklu kanal desteği
  createdAt: number;
  createdBy?: string; // Kullanıcı bilgisi
  scheduledAt?: number; // Zamanlanmış gönderim
  expiresAt?: number; // Geçerlilik süresi
  status: 'pending' | 'scheduled' | 'sending' | 'delivered' | 'partial' | 'failed' | 'expired' | 'cancelled';
  deliveredTo: string[]; // Başarıyla teslim edilen cihazlar
  failedTo: string[]; // Başarısız olan cihazlar
  retryCount: number;
  maxRetries?: number; // Maksimum deneme sayısı
  error?: string;
  metadata?: Record<string, any>; // Ek bilgiler
  deliveryReport?: DeliveryReport; // Detaylı teslimat raporu
  isRecurring?: boolean; // Tekrarlayan görev mi?
  recurringSchedule?: RecurringSchedule; // Tekrarlama programı
  tags?: string[]; // Etiketler (filtreleme için)
}

export interface BroadcastCondition {
  field: string; // 'deviceType', 'storeId', 'region', 'version', vb.
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'in' | 'notIn';
  value: any;
}

export interface RecurringSchedule {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  interval: number; // Her kaç saatte/günde/haftada/ayda bir
  daysOfWeek?: number[]; // Haftanın günleri (0=Pazar, 6=Cumartesi)
  timeOfDay?: string; // 'HH:MM' formatında
  endDate?: number; // Bitiş tarihi
  lastRun?: number; // Son çalıştırma zamanı
}

export interface DeliveryReport {
  totalTargets: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  averageDeliveryTime: number;
  startedAt: number;
  completedAt?: number;
  errors: Array<{
    deviceId: string;
    error: string;
    timestamp: number;
  }>;
}

export interface DeviceStatus {
  deviceId: string;
  deviceName: string;
  deviceType?: 'pos' | 'mobile' | 'tablet' | 'kiosk' | 'server' | 'warehouse' | 'office';
  storeId?: string;
  storeName?: string;
  region?: string;
  groups?: string[]; // Cihazın dahil olduğu gruplar
  lastSeen: number;
  isOnline: boolean;
  version?: string; // Cihaz yazılım versiyonu
  capabilities?: string[]; // Cihaz yetenekleri
  pendingMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  totalDataReceived?: number; // Toplam alınan veri (bytes)
  totalDataSent?: number; // Toplam gönderilen veri (bytes)
  averageResponseTime?: number; // Ortalama yanıt süresi (ms)
  metadata?: Record<string, any>;
}

export interface DeviceGroup {
  id: string;
  name: string;
  description?: string;
  deviceIds: string[];
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BroadcastTemplate {
  id: string;
  name: string;
  description?: string;
  type: BroadcastMessage['type'];
  action: BroadcastMessage['action'];
  dataTemplate: any; // JSON template with placeholders
  targetDevices: string[];
  targetGroups?: string[];
  priority: BroadcastMessage['priority'];
  channel: BroadcastMessage['channel'];
  tags?: string[];
  createdAt: number;
  usageCount: number;
}

export interface BroadcastStats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  pendingBroadcasts: number;
  scheduledBroadcasts: number;
  deliveredBroadcasts: number;
  failedBroadcasts: number;
  totalPendingMessages: number;
  successRate: number; // Başarı oranı (%)
  averageDeliveryTime: number; // Ortalama teslimat süresi (ms)
  totalDataTransferred: number; // Toplam veri transferi (bytes)
  last24hBroadcasts: number;
  last24hSuccess: number;
  last24hFailed: number;
}

const BROADCAST_QUEUE_KEY = 'retailos_broadcast_queue';
const DEVICE_STATUS_KEY = 'retailos_device_status';
const DEVICE_GROUPS_KEY = 'retailos_device_groups';
const BROADCAST_TEMPLATES_KEY = 'retailos_broadcast_templates';
const BROADCAST_HISTORY_KEY = 'retailos_broadcast_history';
const MAX_RETRY_COUNT = 5;
const MAX_HISTORY_SIZE = 1000; // Maksimum geçmiş kayıt sayısı

class CentralDataBroadcast {
  private queue: BroadcastMessage[] = [];
  private devices: Map<string, DeviceStatus> = new Map();
  private deviceGroups: Map<string, DeviceGroup> = new Map();
  private templates: Map<string, BroadcastTemplate> = new Map();
  private history: BroadcastMessage[] = []; // Tamamlanan broadcast geçmişi
  private isBroadcasting = false;
  private callbacks: Array<(status: 'started' | 'progress' | 'completed', queue: BroadcastMessage[]) => void> = [];
  private deviceCallbacks: Array<(devices: DeviceStatus[]) => void> = [];
  private statsCallbacks: Array<(stats: BroadcastStats) => void> = [];

  constructor() {
    this.loadQueue();
    this.loadDeviceStatus();
    this.loadDeviceGroups();
    this.loadTemplates();
    this.loadHistory();
    this.startAutoBroadcast();
    this.startRecurringTaskScheduler();
  }

  /**
   * Ana merkezden queue'yu yükle
   */
  private async loadQueue() {
    try {
      const cached = await dbCache.get('broadcast_queue') as BroadcastMessage[];
      if (cached) {
        this.queue = cached;
        logger.log('broadcast', `Loaded ${this.queue.length} queued broadcasts`);
      }
    } catch (error) {
      logger.error('broadcast', 'Failed to load queue', error);
      const stored = localStorage.getItem(BROADCAST_QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    }
  }

  /**
   * Queue'yu kaydet
   */
  private async saveQueue() {
    try {
      await dbCache.set('broadcast_queue', this.queue);
      localStorage.setItem(BROADCAST_QUEUE_KEY, JSON.stringify(this.queue));
      logger.log('broadcast', `Saved ${this.queue.length} broadcasts to queue`);
    } catch (error) {
      logger.error('broadcast', 'Failed to save queue', error);
    }
  }

  /**
   * Cihaz durumlarını yükle
   */
  private async loadDeviceStatus() {
    try {
      const stored = localStorage.getItem(DEVICE_STATUS_KEY);
      if (stored) {
        const devices: DeviceStatus[] = JSON.parse(stored);
        devices.forEach(device => {
          this.devices.set(device.deviceId, device);
        });
        logger.log('broadcast', `Loaded ${this.devices.size} device statuses`);
      }
    } catch (error) {
      logger.error('broadcast', 'Failed to load device status', error);
    }
  }

  /**
   * Cihaz durumlarını kaydet
   */
  private async saveDeviceStatus() {
    try {
      const devices = Array.from(this.devices.values());
      localStorage.setItem(DEVICE_STATUS_KEY, JSON.stringify(devices));
      this.notifyDeviceCallbacks(devices);
      this.notifyStatsCallbacks();
    } catch (error) {
      logger.error('broadcast', 'Failed to save device status', error);
    }
  }

  /**
   * Cihaz gruplarını yükle
   */
  private async loadDeviceGroups() {
    try {
      const stored = localStorage.getItem(DEVICE_GROUPS_KEY);
      if (stored) {
        const groups: DeviceGroup[] = JSON.parse(stored);
        groups.forEach(group => {
          this.deviceGroups.set(group.id, group);
        });
        logger.log('broadcast', `Loaded ${this.deviceGroups.size} device groups`);
      }
    } catch (error) {
      logger.error('broadcast', 'Failed to load device groups', error);
    }
  }

  /**
   * Cihaz gruplarını kaydet
   */
  private async saveDeviceGroups() {
    try {
      const groups = Array.from(this.deviceGroups.values());
      localStorage.setItem(DEVICE_GROUPS_KEY, JSON.stringify(groups));
      logger.log('broadcast', `Saved ${groups.length} device groups`);
    } catch (error) {
      logger.error('broadcast', 'Failed to save device groups', error);
    }
  }

  /**
   * Şablonları yükle
   */
  private async loadTemplates() {
    try {
      const stored = localStorage.getItem(BROADCAST_TEMPLATES_KEY);
      if (stored) {
        const templates: BroadcastTemplate[] = JSON.parse(stored);
        templates.forEach(template => {
          this.templates.set(template.id, template);
        });
        logger.log('broadcast', `Loaded ${this.templates.size} broadcast templates`);
      }
    } catch (error) {
      logger.error('broadcast', 'Failed to load templates', error);
    }
  }

  /**
   * Şablonları kaydet
   */
  private async saveTemplates() {
    try {
      const templates = Array.from(this.templates.values());
      localStorage.setItem(BROADCAST_TEMPLATES_KEY, JSON.stringify(templates));
      logger.log('broadcast', `Saved ${templates.length} broadcast templates`);
    } catch (error) {
      logger.error('broadcast', 'Failed to save templates', error);
    }
  }

  /**
   * Geçmişi yükle
   */
  private async loadHistory() {
    try {
      const cached = await dbCache.get('broadcast_history') as BroadcastMessage[];
      if (cached) {
        this.history = cached;
        logger.log('broadcast', `Loaded ${this.history.length} history records`);
      }
    } catch (error) {
      logger.error('broadcast', 'Failed to load history', error);
      const stored = localStorage.getItem(BROADCAST_HISTORY_KEY);
      if (stored) {
        this.history = JSON.parse(stored);
      }
    }
  }

  /**
   * Geçmişi kaydet
   */
  private async saveHistory() {
    try {
      // Maksimum boyutu kontrol et
      if (this.history.length > MAX_HISTORY_SIZE) {
        this.history = this.history.slice(-MAX_HISTORY_SIZE);
      }
      await dbCache.set('broadcast_history', this.history);
      localStorage.setItem(BROADCAST_HISTORY_KEY, JSON.stringify(this.history));
    } catch (error) {
      logger.error('broadcast', 'Failed to save history', error);
    }
  }

  /**
   * Yeni broadcast mesajı ekle (Ana Merkez)
   */
  async addBroadcast(
    type: BroadcastMessage['type'],
    action: BroadcastMessage['action'],
    data: any,
    options: {
      targetDevices?: string[];
      targetGroups?: string[];
      targetStores?: string[];
      targetRegions?: string[];
      conditions?: BroadcastCondition[];
      priority?: BroadcastMessage['priority'];
      channel?: BroadcastMessage['channel'];
      scheduledAt?: number;
      expiresAt?: number;
      createdBy?: string;
      maxRetries?: number;
      metadata?: Record<string, any>;
      isRecurring?: boolean;
      recurringSchedule?: RecurringSchedule;
      tags?: string[];
    } = {}
  ): Promise<string> {
    const message: BroadcastMessage = {
      id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      action,
      data,
      targetDevices: options.targetDevices || ['all'],
      targetGroups: options.targetGroups,
      targetStores: options.targetStores,
      targetRegions: options.targetRegions,
      conditions: options.conditions,
      priority: options.priority || 'normal',
      channel: options.channel || 'auto',
      createdAt: Date.now(),
      createdBy: options.createdBy,
      scheduledAt: options.scheduledAt,
      expiresAt: options.expiresAt,
      status: options.scheduledAt && options.scheduledAt > Date.now() ? 'scheduled' : 'pending',
      deliveredTo: [],
      failedTo: [],
      retryCount: 0,
      maxRetries: options.maxRetries || MAX_RETRY_COUNT,
      metadata: options.metadata,
      isRecurring: options.isRecurring,
      recurringSchedule: options.recurringSchedule,
      tags: options.tags,
      deliveryReport: {
        totalTargets: 0,
        successCount: 0,
        failureCount: 0,
        pendingCount: 0,
        averageDeliveryTime: 0,
        startedAt: 0,
        errors: []
      }
    };

    this.queue.push(message);

    // Önceliğe göre sırala (critical > urgent > high > normal > low)
    this.queue.sort((a, b) => {
      const priorityOrder = { critical: 5, urgent: 4, high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    await this.saveQueue();
    this.notifyCallbacks('progress', this.queue);
    this.notifyStatsCallbacks();

    logger.log('broadcast', `Added ${type} broadcast to queue`, {
      id: message.id,
      targets: message.targetDevices,
      priority: message.priority,
      channel: message.channel,
      scheduled: !!message.scheduledAt
    });

    return message.id;
  }

  /**
   * Toplu broadcast ekleme
   */
  async addBulkBroadcasts(broadcasts: Array<{
    type: BroadcastMessage['type'];
    action: BroadcastMessage['action'];
    data: any;
    options?: any;
  }>): Promise<string[]> {
    const ids: string[] = [];
    for (const broadcast of broadcasts) {
      const id = await this.addBroadcast(
        broadcast.type,
        broadcast.action,
        broadcast.data,
        broadcast.options || {}
      );
      ids.push(id);
    }
    logger.log('broadcast', `Added ${ids.length} bulk broadcasts`);
    return ids;
  }

  /**
   * Cihaz kaydı
   */
  async registerDevice(
    deviceId: string,
    deviceName: string,
    options: {
      deviceType?: DeviceStatus['deviceType'];
      storeId?: string;
      storeName?: string;
      region?: string;
      groups?: string[];
      version?: string;
      capabilities?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const device: DeviceStatus = {
      deviceId,
      deviceName,
      deviceType: options.deviceType || 'pos',
      storeId: options.storeId,
      storeName: options.storeName,
      region: options.region,
      groups: options.groups || [],
      lastSeen: Date.now(),
      isOnline: true,
      version: options.version,
      capabilities: options.capabilities || [],
      pendingMessages: 0,
      deliveredMessages: 0,
      failedMessages: 0,
      totalDataReceived: 0,
      totalDataSent: 0,
      averageResponseTime: 0,
      metadata: options.metadata
    };

    this.devices.set(deviceId, device);
    await this.saveDeviceStatus();

    logger.log('broadcast', `Device registered: ${deviceName} (${deviceId})`, {
      type: device.deviceType,
      store: device.storeName,
      groups: device.groups
    });
  }

  /**
   * Cihaz durumu güncelleme (heartbeat)
   */
  async updateDeviceStatus(
    deviceId: string,
    updates?: {
      version?: string;
      capabilities?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const device = this.devices.get(deviceId);
    if (device) {
      device.lastSeen = Date.now();
      device.isOnline = true;
      if (updates) {
        if (updates.version) device.version = updates.version;
        if (updates.capabilities) device.capabilities = updates.capabilities;
        if (updates.metadata) device.metadata = { ...device.metadata, ...updates.metadata };
      }
      await this.saveDeviceStatus();
    }
  }

  /**
   * Çevrimdışı cihazları kontrol et
   */
  private checkOfflineDevices() {
    const now = Date.now();
    const offlineThreshold = 60000; // 1 dakika

    this.devices.forEach(device => {
      if (now - device.lastSeen > offlineThreshold) {
        device.isOnline = false;
      }
    });
  }

  /**
   * Broadcast gönderimi başlat
   */
  async startBroadcast(): Promise<void> {
    if (this.isBroadcasting) {
      logger.log('broadcast', 'Broadcast already in progress');
      return;
    }

    if (this.queue.length === 0) {
      logger.log('broadcast', 'Broadcast queue is empty');
      return;
    }

    this.isBroadcasting = true;
    this.notifyCallbacks('started', this.queue);

    logger.log('broadcast', `Starting broadcast of ${this.queue.length} messages`);

    const now = Date.now();
    this.checkOfflineDevices();

    // Zamanı gelmiş ve süresi dolmamış mesajları işle
    const readyMessages = this.queue.filter(msg =>
      msg.status === 'pending' &&
      (!msg.scheduledAt || msg.scheduledAt <= now) &&
      (!msg.expiresAt || msg.expiresAt > now) &&
      msg.retryCount < MAX_RETRY_COUNT
    );

    for (const message of readyMessages) {
      try {
        message.status = 'sending';
        await this.saveQueue();
        this.notifyCallbacks('progress', this.queue);

        // Hedef cihazları belirle
        const targetDevices = message.targetDevices.includes('all')
          ? Array.from(this.devices.keys())
          : message.targetDevices;

        // Her cihaza gönder
        for (const deviceId of targetDevices) {
          const device = this.devices.get(deviceId);
          if (!device) continue;

          try {
            if (device.isOnline) {
              await this.sendToDevice(deviceId, message);
              message.deliveredTo.push(deviceId);
              device.deliveredMessages++;
              device.pendingMessages = Math.max(0, device.pendingMessages - 1);
            } else {
              // Çevrimdışı cihaz - daha sonra tekrar denenecek
              device.pendingMessages++;
              logger.warn('broadcast', `Device ${deviceId} is offline, message queued`);
            }
          } catch (error) {
            message.failedTo.push(deviceId);
            device.failedMessages++;
            logger.error('broadcast', `Failed to send to device ${deviceId}`, error);
          }
        }

        // Tüm cihazlara başarıyla ulaştıysa tamamlandı olarak işaretle
        if (message.deliveredTo.length === targetDevices.length) {
          message.status = 'delivered';
          // Queue'dan kaldır
          this.queue = this.queue.filter(m => m.id !== message.id);
          logger.log('broadcast', `Broadcast ${message.id} delivered to all devices`);
        } else if (message.failedTo.length > 0 || message.deliveredTo.length < targetDevices.length) {
          message.status = 'failed';
          message.retryCount++;
          message.error = `Delivered to ${message.deliveredTo.length}/${targetDevices.length} devices`;
        }

        await this.saveQueue();
        await this.saveDeviceStatus();
        this.notifyCallbacks('progress', this.queue);

      } catch (error) {
        message.status = 'failed';
        message.retryCount++;
        message.error = error instanceof Error ? error.message : 'Unknown error';
        await this.saveQueue();
        logger.error('broadcast', `Broadcast ${message.id} failed`, error);
      }
    }

    // Süresi dolmuş mesajları temizle
    const expiredCount = this.queue.filter(msg =>
      msg.expiresAt && msg.expiresAt <= now
    ).length;

    if (expiredCount > 0) {
      this.queue = this.queue.filter(msg => !msg.expiresAt || msg.expiresAt > now);
      await this.saveQueue();
      logger.log('broadcast', `Removed ${expiredCount} expired messages`);
    }

    this.isBroadcasting = false;
    this.notifyCallbacks('completed', this.queue);

    logger.log('broadcast', `Broadcast completed. ${this.queue.length} messages remaining`);
  }

  /**
   * Cihaza mesaj gönder (WebSocket veya API)
   */
  private async sendToDevice(deviceId: string, message: BroadcastMessage): Promise<void> {
    // WebSocket kullanımı
    if ('WebSocket' in window && (window as any).retailOSWebSocket) {
      const ws = (window as any).retailOSWebSocket;
      ws.send(JSON.stringify({
        type: 'broadcast',
        deviceId,
        message
      }));
      logger.log('broadcast', `Sent via WebSocket to ${deviceId}`);
      return;
    }

    // API fallback
    const response = await fetch('/api/v1/broadcast/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        message
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logger.log('broadcast', `Sent via API to ${deviceId}`);
  }

  /**
   * Otomatik broadcast başlatıcı (her 10 saniyede bir)
   */
  private startAutoBroadcast() {
    setInterval(() => {
      if (this.queue.length > 0 && !this.isBroadcasting) {
        this.startBroadcast();
      }
      this.checkOfflineDevices();
    }, 10000); // 10 saniye
  }

  /**
   * Tekrarlayan görevleri kontrol et
   */
  private startRecurringTaskScheduler() {
    setInterval(async () => {
      const now = Date.now();
      const recurringMessages = this.queue.filter(msg =>
        msg.isRecurring && msg.recurringSchedule && (msg.recurringSchedule.lastRun || 0) < now
      );

      for (const message of recurringMessages) {
        const schedule = message.recurringSchedule;
        if (!schedule) continue;

        // Son çalıştırma zamanını güncelle
        schedule.lastRun = now;
        await this.saveQueue();

        // Yeni bir broadcast oluştur
        const newMessage: BroadcastMessage = {
          ...message,
          id: `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'pending',
          retryCount: 0,
          failedTo: [],
          deliveryReport: {
            totalTargets: 0,
            successCount: 0,
            failureCount: 0,
            pendingCount: 0,
            averageDeliveryTime: 0,
            startedAt: 0,
            errors: []
          }
        };

        this.queue.push(newMessage);

        // Önceliğe göre sırala (critical > urgent > high > normal > low)
        this.queue.sort((a, b) => {
          const priorityOrder = { critical: 5, urgent: 4, high: 3, normal: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        });

        await this.saveQueue();
        this.notifyCallbacks('progress', this.queue);
        this.notifyStatsCallbacks();

        logger.log('broadcast', `Added ${newMessage.type} broadcast to queue`, {
          id: newMessage.id,
          targets: newMessage.targetDevices,
          priority: newMessage.priority,
          channel: newMessage.channel,
          scheduled: !!newMessage.scheduledAt
        });
      }
    }, 60000); // 1 dakika
  }

  /**
   * Queue durumunu al
   */
  getQueue(): BroadcastMessage[] {
    return [...this.queue];
  }

  /**
   * Cihaz listesini al
   */
  getDevices(): DeviceStatus[] {
    return Array.from(this.devices.values());
  }

  /**
   * İstatistikleri al
   */
  getStats() {
    const devices = Array.from(this.devices.values());
    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter(d => d.isOnline).length,
      offlineDevices: devices.filter(d => !d.isOnline).length,
      pendingBroadcasts: this.queue.filter(m => m.status === 'pending').length,
      scheduledBroadcasts: this.queue.filter(m => m.status === 'scheduled').length,
      deliveredBroadcasts: this.queue.filter(m => m.status === 'delivered').length,
      failedBroadcasts: this.queue.filter(m => m.status === 'failed').length,
      totalPendingMessages: devices.reduce((sum, d) => sum + d.pendingMessages, 0)
    };
  }

  /**
   * Broadcast event listener
   */
  onBroadcast(callback: (status: 'started' | 'progress' | 'completed', queue: BroadcastMessage[]) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Device status listener
   */
  onDeviceUpdate(callback: (devices: DeviceStatus[]) => void): () => void {
    this.deviceCallbacks.push(callback);
    return () => {
      this.deviceCallbacks = this.deviceCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Stats listener
   */
  onStatsUpdate(callback: (stats: BroadcastStats) => void): () => void {
    this.statsCallbacks.push(callback);
    return () => {
      this.statsCallbacks = this.statsCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyCallbacks(status: 'started' | 'progress' | 'completed', queue: BroadcastMessage[]) {
    this.callbacks.forEach(cb => {
      try {
        cb(status, queue);
      } catch (error) {
        logger.error('broadcast', 'Callback error', error);
      }
    });
  }

  private notifyDeviceCallbacks(devices: DeviceStatus[]) {
    this.deviceCallbacks.forEach(cb => {
      try {
        cb(devices);
      } catch (error) {
        logger.error('broadcast', 'Device callback error', error);
      }
    });
  }

  private notifyStatsCallbacks() {
    const stats = this.getAdvancedStats();
    this.statsCallbacks.forEach(cb => {
      try {
        cb(stats);
      } catch (error) {
        logger.error('broadcast', 'Stats callback error', error);
      }
    });
  }

  /**
   * Mesajı tekrar gönder
   */
  async retryBroadcast(messageId: string): Promise<void> {
    const message = this.queue.find(m => m.id === messageId);
    if (message) {
      message.status = 'pending';
      message.retryCount = 0;
      message.failedTo = [];
      await this.saveQueue();
      this.startBroadcast();
    }
  }

  /**
   * Queue'yu temizle
   */
  async clearQueue(filter?: 'delivered' | 'failed' | 'all'): Promise<void> {
    if (filter === 'delivered') {
      this.queue = this.queue.filter(m => m.status !== 'delivered');
    } else if (filter === 'failed') {
      this.queue = this.queue.filter(m => m.status !== 'failed');
    } else {
      this.queue = [];
    }
    await this.saveQueue();
    logger.log('broadcast', `Cleared queue (filter: ${filter || 'all'})`);
  }

  /**
   * Cihaz grubu oluştur
   */
  async createDeviceGroup(name: string, description?: string, deviceIds?: string[], color?: string): Promise<string> {
    const group: DeviceGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      deviceIds: deviceIds || [],
      color: color || '#3B82F6',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.deviceGroups.set(group.id, group);
    await this.saveDeviceGroups();

    logger.log('broadcast', `Device group created: ${name} (${group.id})`);
    return group.id;
  }

  /**
   * Cihaz grubunu güncelle
   */
  async updateDeviceGroup(groupId: string, updates: Partial<Omit<DeviceGroup, 'id' | 'createdAt'>>): Promise<void> {
    const group = this.deviceGroups.get(groupId);
    if (group) {
      Object.assign(group, updates, { updatedAt: Date.now() });
      await this.saveDeviceGroups();
      logger.log('broadcast', `Device group updated: ${group.name} (${groupId})`);
    }
  }

  /**
   * Cihaz grubunu sil
   */
  async deleteDeviceGroup(groupId: string): Promise<void> {
    this.deviceGroups.delete(groupId);
    await this.saveDeviceGroups();
    logger.log('broadcast', `Device group deleted: ${groupId}`);
  }

  /**
   * Gruba cihaz ekle
   */
  async addDeviceToGroup(groupId: string, deviceId: string): Promise<void> {
    const group = this.deviceGroups.get(groupId);
    if (group && !group.deviceIds.includes(deviceId)) {
      group.deviceIds.push(deviceId);
      group.updatedAt = Date.now();
      await this.saveDeviceGroups();

      // Cihazın grup bilgisini güncelle
      const device = this.devices.get(deviceId);
      if (device) {
        if (!device.groups) device.groups = [];
        if (!device.groups.includes(groupId)) {
          device.groups.push(groupId);
          await this.saveDeviceStatus();
        }
      }

      logger.log('broadcast', `Device ${deviceId} added to group ${groupId}`);
    }
  }

  /**
   * Gruptan cihaz çıkar
   */
  async removeDeviceFromGroup(groupId: string, deviceId: string): Promise<void> {
    const group = this.deviceGroups.get(groupId);
    if (group) {
      group.deviceIds = group.deviceIds.filter(id => id !== deviceId);
      group.updatedAt = Date.now();
      await this.saveDeviceGroups();

      // Cihazın grup bilgisini güncelle
      const device = this.devices.get(deviceId);
      if (device && device.groups) {
        device.groups = device.groups.filter(id => id !== groupId);
        await this.saveDeviceStatus();
      }

      logger.log('broadcast', `Device ${deviceId} removed from group ${groupId}`);
    }
  }

  /**
   * Tüm grupları al
   */
  getDeviceGroups(): DeviceGroup[] {
    return Array.from(this.deviceGroups.values());
  }

  /**
   * Grup ID'sine göre grup al
   */
  getDeviceGroup(groupId: string): DeviceGroup | undefined {
    return this.deviceGroups.get(groupId);
  }

  /**
   * Broadcast şablonu oluştur
   */
  async createTemplate(
    name: string,
    type: BroadcastMessage['type'],
    action: BroadcastMessage['action'],
    dataTemplate: any,
    options: {
      description?: string;
      targetDevices?: string[];
      targetGroups?: string[];
      priority?: BroadcastMessage['priority'];
      channel?: BroadcastMessage['channel'];
      tags?: string[];
    } = {}
  ): Promise<string> {
    const template: BroadcastTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      description: options.description,
      type,
      action,
      dataTemplate,
      targetDevices: options.targetDevices || ['all'],
      targetGroups: options.targetGroups,
      priority: options.priority || 'normal',
      channel: options.channel || 'auto',
      tags: options.tags,
      createdAt: Date.now(),
      usageCount: 0
    };

    this.templates.set(template.id, template);
    await this.saveTemplates();

    logger.log('broadcast', `Template created: ${name} (${template.id})`);
    return template.id;
  }

  /**
   * Şablonu kullanarak broadcast oluştur
   */
  async createBroadcastFromTemplate(templateId: string, data: Record<string, any> = {}): Promise<string> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Template içindeki placeholder'ları değiştir
    const processedData = this.replacePlaceholders(template.dataTemplate, data);

    // Template kullanım sayısını artır
    template.usageCount++;
    await this.saveTemplates();

    return this.addBroadcast(template.type, template.action, processedData, {
      targetDevices: template.targetDevices,
      targetGroups: template.targetGroups,
      priority: template.priority,
      channel: template.channel,
      tags: template.tags
    });
  }

  /**
   * Placeholder değiştirme
   */
  private replacePlaceholders(template: any, data: Record<string, any>): any {
    if (typeof template === 'string') {
      return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    } else if (Array.isArray(template)) {
      return template.map(item => this.replacePlaceholders(item, data));
    } else if (typeof template === 'object' && template !== null) {
      const result: any = {};
      for (const key in template) {
        result[key] = this.replacePlaceholders(template[key], data);
      }
      return result;
    }
    return template;
  }

  /**
   * Şablonu sil
   */
  async deleteTemplate(templateId: string): Promise<void> {
    this.templates.delete(templateId);
    await this.saveTemplates();
    logger.log('broadcast', `Template deleted: ${templateId}`);
  }

  /**
   * Tüm şablonları al
   */
  getTemplates(): BroadcastTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Şablon ID'sine göre şablon al
   */
  getTemplate(templateId: string): BroadcastTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Geçmişi al
   */
  getHistory(filter?: {
    type?: BroadcastMessage['type'];
    status?: BroadcastMessage['status'];
    fromDate?: number;
    toDate?: number;
    limit?: number;
  }): BroadcastMessage[] {
    let filtered = [...this.history];

    if (filter) {
      if (filter.type) {
        filtered = filtered.filter(msg => msg.type === filter.type);
      }
      if (filter.status) {
        filtered = filtered.filter(msg => msg.status === filter.status);
      }
      if (filter.fromDate) {
        filtered = filtered.filter(msg => msg.createdAt >= filter.fromDate!);
      }
      if (filter.toDate) {
        filtered = filtered.filter(msg => msg.createdAt <= filter.toDate!);
      }
      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered.reverse(); // En yeni önce
  }

  /**
   * Geçmişi temizle
   */
  async clearHistory(): Promise<void> {
    this.history = [];
    await this.saveHistory();
    logger.log('broadcast', 'History cleared');
  }

  /**
   * Broadcast'ı iptal et
   */
  async cancelBroadcast(messageId: string): Promise<void> {
    const message = this.queue.find(m => m.id === messageId);
    if (message && (message.status === 'pending' || message.status === 'scheduled')) {
      message.status = 'cancelled';
      this.queue = this.queue.filter(m => m.id !== messageId);

      // İptal edilen mesajı geçmişe ekle
      this.history.push(message);

      await this.saveQueue();
      await this.saveHistory();

      this.notifyCallbacks('progress', this.queue);
      this.notifyStatsCallbacks();

      logger.log('broadcast', `Broadcast cancelled: ${messageId}`);
    }
  }

  /**
   * Gelişmiş istatistikler
   */
  getAdvancedStats(): BroadcastStats {
    const devices = Array.from(this.devices.values());
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);

    // Son 24 saatteki broadcast'ları filtrele
    const recent = this.history.filter(msg => msg.createdAt >= last24h);
    const recentSuccess = recent.filter(msg => msg.status === 'delivered');
    const recentFailed = recent.filter(msg => msg.status === 'failed');

    // Başarı oranını hesapla
    const totalCompleted = this.history.filter(msg =>
      msg.status === 'delivered' || msg.status === 'failed'
    ).length;
    const successCount = this.history.filter(msg => msg.status === 'delivered').length;
    const successRate = totalCompleted > 0 ? (successCount / totalCompleted) * 100 : 0;

    // Ortalama teslimat süresini hesapla
    const deliveredMessages = this.history.filter(msg =>
      msg.status === 'delivered' && msg.deliveryReport?.completedAt
    );
    const avgDeliveryTime = deliveredMessages.length > 0
      ? deliveredMessages.reduce((sum, msg) => {
        const duration = (msg.deliveryReport?.completedAt || 0) - msg.deliveryReport!.startedAt;
        return sum + duration;
      }, 0) / deliveredMessages.length
      : 0;

    // Toplam veri transferi
    const totalDataTransferred = devices.reduce((sum, device) => {
      return sum + (device.totalDataReceived || 0) + (device.totalDataSent || 0);
    }, 0);

    return {
      totalDevices: devices.length,
      onlineDevices: devices.filter(d => d.isOnline).length,
      offlineDevices: devices.filter(d => !d.isOnline).length,
      pendingBroadcasts: this.queue.filter(m => m.status === 'pending').length,
      scheduledBroadcasts: this.queue.filter(m => m.status === 'scheduled').length,
      deliveredBroadcasts: this.queue.filter(m => m.status === 'delivered').length,
      failedBroadcasts: this.queue.filter(m => m.status === 'failed').length,
      totalPendingMessages: devices.reduce((sum, d) => sum + d.pendingMessages, 0),
      successRate: Math.round(successRate * 100) / 100,
      averageDeliveryTime: Math.round(avgDeliveryTime),
      totalDataTransferred,
      last24hBroadcasts: recent.length,
      last24hSuccess: recentSuccess.length,
      last24hFailed: recentFailed.length
    };
  }

  /**
   * Koşullu broadcast - koşulları kontrol et
   */
  private evaluateConditions(device: DeviceStatus, conditions?: BroadcastCondition[]): boolean {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(condition => {
      const deviceValue = (device as any)[condition.field];

      switch (condition.operator) {
        case 'equals':
          return deviceValue === condition.value;
        case 'notEquals':
          return deviceValue !== condition.value;
        case 'contains':
          return typeof deviceValue === 'string' && deviceValue.includes(condition.value);
        case 'greaterThan':
          return deviceValue > condition.value;
        case 'lessThan':
          return deviceValue < condition.value;
        case 'in':
          return Array.isArray(condition.value) && condition.value.includes(deviceValue);
        case 'notIn':
          return Array.isArray(condition.value) && !condition.value.includes(deviceValue);
        default:
          return false;
      }
    });
  }

  /**
   * Hedef cihazları belirle (gruplar, mağazalar, bölgeler ve koşullar dahil)
   */
  private resolveTargetDevices(message: BroadcastMessage): string[] {
    let targets: Set<string> = new Set();

    // 'all' durumu
    if (message.targetDevices.includes('all')) {
      Array.from(this.devices.keys()).forEach(id => targets.add(id));
    } else {
      message.targetDevices.forEach(id => targets.add(id));
    }

    // Gruplar
    if (message.targetGroups && message.targetGroups.length > 0) {
      message.targetGroups.forEach(groupId => {
        const group = this.deviceGroups.get(groupId);
        if (group) {
          group.deviceIds.forEach(id => targets.add(id));
        }
      });
    }

    // Mağazalar
    if (message.targetStores && message.targetStores.length > 0) {
      Array.from(this.devices.values())
        .filter(device => message.targetStores!.includes(device.storeId || ''))
        .forEach(device => targets.add(device.deviceId));
    }

    // Bölgeler
    if (message.targetRegions && message.targetRegions.length > 0) {
      Array.from(this.devices.values())
        .filter(device => message.targetRegions!.includes(device.region || ''))
        .forEach(device => targets.add(device.deviceId));
    }

    // Koşulları uygula
    if (message.conditions && message.conditions.length > 0) {
      const targetsArray = Array.from(targets);
      targets = new Set(
        targetsArray.filter(deviceId => {
          const device = this.devices.get(deviceId);
          return device && this.evaluateConditions(device, message.conditions);
        })
      );
    }

    return Array.from(targets);
  }

  /**
   * Export yapılandırması (yedekleme)
   */
  async exportConfiguration(): Promise<{
    queue: BroadcastMessage[];
    devices: DeviceStatus[];
    groups: DeviceGroup[];
    templates: BroadcastTemplate[];
    history: BroadcastMessage[];
    exportedAt: number;
    version: string;
  }> {
    return {
      queue: this.queue,
      devices: Array.from(this.devices.values()),
      groups: Array.from(this.deviceGroups.values()),
      templates: Array.from(this.templates.values()),
      history: this.history,
      exportedAt: Date.now(),
      version: '2.0'
    };
  }

  /**
   * Import yapılandırması (geri yükleme)
   */
  async importConfiguration(config: {
    queue?: BroadcastMessage[];
    devices?: DeviceStatus[];
    groups?: DeviceGroup[];
    templates?: BroadcastTemplate[];
    history?: BroadcastMessage[];
  }): Promise<void> {
    if (config.queue) {
      this.queue = config.queue;
      await this.saveQueue();
    }

    if (config.devices) {
      this.devices.clear();
      config.devices.forEach(device => this.devices.set(device.deviceId, device));
      await this.saveDeviceStatus();
    }

    if (config.groups) {
      this.deviceGroups.clear();
      config.groups.forEach(group => this.deviceGroups.set(group.id, group));
      await this.saveDeviceGroups();
    }

    if (config.templates) {
      this.templates.clear();
      config.templates.forEach(template => this.templates.set(template.id, template));
      await this.saveTemplates();
    }

    if (config.history) {
      this.history = config.history;
      await this.saveHistory();
    }

    this.notifyCallbacks('progress', this.queue);
    this.notifyDeviceCallbacks(Array.from(this.devices.values()));
    this.notifyStatsCallbacks();

    logger.log('broadcast', 'Configuration imported successfully');
  }
}

// Export singleton
export const centralBroadcast = new CentralDataBroadcast();
