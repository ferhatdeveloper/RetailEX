// Real-time WebSocket simulation service for unlimited stores

export type RealtimeEventType =
  | 'TRANSACTION'
  | 'ALERT_NEW'
  | 'ALERT_RESOLVED'
  | 'STORE_STATUS_CHANGE'
  | 'STATS_UPDATE';

export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: string;
  data: any;
}

export interface TransactionEvent {
  storeId: string;
  storeName: string;
  amount: number;
  items: number;
  paymentMethod: string;
}

export interface AlertEvent {
  alertId: string;
  storeId: string;
  storeName: string;
  type: 'critical' | 'warning' | 'info';
  category: 'stock' | 'cash' | 'system' | 'personnel';
  message: string;
}

export interface StoreStatusEvent {
  storeId: string;
  storeName: string;
  oldStatus: string;
  newStatus: string;
}

export interface StatsUpdateEvent {
  totalRevenue: number;
  totalTransactions: number;
  activeStores: number;
  criticalAlerts: number;
}

type EventHandler = (event: RealtimeEvent) => void;

class RealtimeService {
  private subscribers: Map<string, Set<EventHandler>> = new Map();
  private isRunning: boolean = false;
  private simulationInterval?: NodeJS.Timeout;

  // Simulated stores pool
  private storePool = [
    { id: 'store-00001', name: 'İstanbul Kadıköy Mağazası' },
    { id: 'store-00002', name: 'Ankara Çankaya Mağazası' },
    { id: 'store-00123', name: 'İzmir Konak Mağazası' },
    { id: 'store-00456', name: 'Antalya Muratpaşa Mağazası' },
    { id: 'store-00789', name: 'Bursa Osmangazi Mağazası' },
    { id: 'store-01234', name: 'İstanbul Beşiktaş Mağazası' },
    { id: 'store-02456', name: 'Ankara Keçiören Mağazası' },
    { id: 'store-03789', name: 'İzmir Karşıyaka Mağazası' },
  ];

  /**
   * Start real-time event simulation
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('🚀 Real-time service started');

    // Simulate events every 3-8 seconds
    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 5000; // 3-8 seconds
      this.simulationInterval = setTimeout(() => {
        this.simulateRandomEvent();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  /**
   * Stop real-time event simulation
   */
  stop() {
    if (this.simulationInterval) {
      clearTimeout(this.simulationInterval);
    }
    this.isRunning = false;
    console.log('⏹️ Real-time service stopped');
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: RealtimeEventType | 'ALL', handler: EventHandler): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }

    this.subscribers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Emit event to subscribers
   */
  private emit(event: RealtimeEvent) {
    // Emit to specific type subscribers
    this.subscribers.get(event.type)?.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    });

    // Emit to ALL subscribers
    this.subscribers.get('ALL')?.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in ALL handler:', error);
      }
    });
  }

  /**
   * Simulate a random event
   */
  private simulateRandomEvent() {
    const eventTypes: RealtimeEventType[] = [
      'TRANSACTION',
      'TRANSACTION',
      'TRANSACTION', // More common
      'ALERT_NEW',
      'STORE_STATUS_CHANGE',
      'STATS_UPDATE'
    ];

    const randomType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    switch (randomType) {
      case 'TRANSACTION':
        this.simulateTransaction();
        break;
      case 'ALERT_NEW':
        this.simulateAlert();
        break;
      case 'STORE_STATUS_CHANGE':
        this.simulateStatusChange();
        break;
      case 'STATS_UPDATE':
        this.simulateStatsUpdate();
        break;
    }
  }

  /**
   * Simulate transaction event
   */
  private simulateTransaction() {
    const store = this.storePool[Math.floor(Math.random() * this.storePool.length)];
    const amount = 50 + Math.random() * 950; // 50-1000 TL
    const items = 1 + Math.floor(Math.random() * 10);
    const paymentMethods = ['Nakit', 'Kredi Kartı', 'Banka Kartı', 'QR', 'Havale'];

    const event: RealtimeEvent = {
      type: 'TRANSACTION',
      timestamp: new Date().toISOString(),
      data: {
        storeId: store.id,
        storeName: store.name,
        amount: Math.round(amount * 100) / 100,
        items,
        paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)]
      } as TransactionEvent
    };

    this.emit(event);
    console.log('💳 Transaction:', event.data);
  }

  /**
   * Simulate new alert event
   */
  private simulateAlert() {
    const store = this.storePool[Math.floor(Math.random() * this.storePool.length)];

    const alerts = [
      { type: 'critical' as const, category: 'system' as const, message: 'POS sistemi yanıt vermiyor' },
      { type: 'warning' as const, category: 'stock' as const, message: 'Kritik stok seviyesi - 5 ürün' },
      { type: 'warning' as const, category: 'cash' as const, message: 'Kasa tutarı limiti aştı' },
      { type: 'info' as const, category: 'personnel' as const, message: 'Vardiya değişimi yaklaşıyor' },
    ];

    const randomAlert = alerts[Math.floor(Math.random() * alerts.length)];

    const event: RealtimeEvent = {
      type: 'ALERT_NEW',
      timestamp: new Date().toISOString(),
      data: {
        alertId: `alert-${Date.now()}`,
        storeId: store.id,
        storeName: store.name,
        ...randomAlert
      } as AlertEvent
    };

    this.emit(event);
    console.log('🚨 Alert:', event.data);
  }

  /**
   * Simulate store status change
   */
  private simulateStatusChange() {
    const store = this.storePool[Math.floor(Math.random() * this.storePool.length)];
    const statuses = ['active', 'maintenance', 'inactive'];
    const oldStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const newStatus = statuses.filter(s => s !== oldStatus)[Math.floor(Math.random() * 2)];

    const event: RealtimeEvent = {
      type: 'STORE_STATUS_CHANGE',
      timestamp: new Date().toISOString(),
      data: {
        storeId: store.id,
        storeName: store.name,
        oldStatus,
        newStatus
      } as StoreStatusEvent
    };

    this.emit(event);
    console.log('🏪 Status Change:', event.data);
  }

  /**
   * Simulate stats update
   */
  private simulateStatsUpdate() {
    const event: RealtimeEvent = {
      type: 'STATS_UPDATE',
      timestamp: new Date().toISOString(),
      data: {
        totalRevenue: 1150000000 + Math.random() * 50000,
        totalTransactions: 3300000 + Math.floor(Math.random() * 1000),
        activeStores: 9500 + Math.floor(Math.random() * 100),
        criticalAlerts: 45 + Math.floor(Math.random() * 10)
      } as StatsUpdateEvent
    };

    this.emit(event);
    console.log('📊 Stats Update:', event.data);
  }

  /**
   * Get current status
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(): number {
    let count = 0;
    this.subscribers.forEach(handlers => {
      count += handlers.size;
    });
    return count;
  }
}

// Singleton instance
export const realtimeService = new RealtimeService();

// Auto-start on import (optional)
if (typeof window !== 'undefined') {
  // Start service when app loads
  setTimeout(() => {
    realtimeService.start();
  }, 2000);
}

