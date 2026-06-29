/**
 * ExRetailOS WebSocket Service
 * Kiracı merkez: wss://api.retailex.app/{kiracı}/ws
 * Yerel Windows servisi yedek: ws://127.0.0.1:9999/ws (RetailEX_Service)
 */

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
import { APP_VERSION } from '../core/version';
import { logger } from '../utils/logger';
import { resolveTenantSyncUrls } from './merkezTenantRegistry';
import { DB_SETTINGS } from './postgres';

const LOCAL_WS_FALLBACK = 'ws://127.0.0.1:9999/ws';

async function resolveWebSocketUrl(): Promise<string> {
  if (DB_SETTINGS.centralWsUrl?.trim()) {
    return DB_SETTINGS.centralWsUrl.trim();
  }

  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cfg = (await invoke('get_app_config')) as {
        central_ws_url?: string;
        remote_rest_url?: string;
        merkez_tenant_code?: string;
      };
      const urls = resolveTenantSyncUrls({
        merkez_tenant_code: cfg?.merkez_tenant_code,
        remote_rest_url: cfg?.remote_rest_url,
        central_ws_url: cfg?.central_ws_url,
      });
      if (urls.central_ws_url) return urls.central_ws_url;
    } catch (err) {
      logger.warn('[WS] Tauri config okunamadı:', err);
    }
  } else if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('retailex_web_config');
      if (raw) {
        const cfg = JSON.parse(raw) as {
          central_ws_url?: string;
          remote_rest_url?: string;
          merkez_tenant_code?: string;
        };
        const urls = resolveTenantSyncUrls({
          merkez_tenant_code: cfg.merkez_tenant_code,
          remote_rest_url: cfg.remote_rest_url,
          central_ws_url: cfg.central_ws_url,
        });
        if (urls.central_ws_url) return urls.central_ws_url;
      }
    } catch (err) {
      logger.warn('[WS] Web config okunamadı:', err);
    }
  }

  return LOCAL_WS_FALLBACK;
}

export type WSEventType =
  | 'PRODUCT_UPDATED'
  | 'STOCK_CHANGED'
  | 'SALE_COMPLETED'
  | 'CUSTOMER_UPDATED'
  | 'ORDER_CREATED'
  | 'PRICE_CHANGED'
  | 'CAMPAIGN_UPDATED'
  | 'USER_CONNECTED'
  | 'USER_DISCONNECTED'
  | 'SCALE_DATA'
  | 'RECONNECTED'
  | 'EXCHANGE_RATE_UPDATED'
  /** Sunucu: { data: { scope: 'firms'|'periods'|... } } ile master veri yenileme */
  | 'DATA_INVALIDATION'
  /** Merkez → kasa: sync_queue anlık çekim tetikle */
  | 'MPOS_SYNC_PULL'
  | 'SYNC_QUEUE_PULL';

export interface WSMessage {
  type: WSEventType;
  data: any;
  timestamp: string;
  userId?: string;
  storeId?: string;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private listeners: Map<WSEventType, Set<(data: any) => void>> = new Map();
  private isConnecting = false;
  private url: string;
  private userId: string | null = null;
  private storeId: string | null = null;

  constructor(url: string = LOCAL_WS_FALLBACK) {
    this.url = url;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(userId: string, storeId: string): Promise<void> {
    this.userId = userId;
    this.storeId = storeId;

    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      void (async () => {
      try {
        this.url = await resolveWebSocketUrl();

        // Yerel Windows servisi (9999) — Tauri'de isteğe bağlı başlatma
        if (isTauri && this.url.startsWith('ws://127.0.0.1:9999')) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('start_ws_server', { port: 9999 }).catch(err => {
              logger.warn('[WS] Yerel WS servisi başlatılamadı (RetailEX_Service kullanın):', err);
            });
          });
        }

        logger.info(`?? Connecting to real-time server: ${this.url}`);

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          logger.info(`? WebSocket connected - ${APP_VERSION.display}`);

          // Notify listeners
          this.broadcast('USER_CONNECTED', {
            userId,
            storeId,
            timestamp: new Date().toISOString()
          });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data);
            this.broadcast(message.type, message.data);
            void import('./retailexDataSync').then(({ emitInvalidate, mapWsEventTypeToScope }) => {
              if (message.type === 'DATA_INVALIDATION' && message.data?.scope) {
                emitInvalidate(String(message.data.scope) as import('./retailexDataSync').RealtimeInvalidateScope, 'ws');
                return;
              }
              const mapped = mapWsEventTypeToScope(message.type);
              if (mapped) emitInvalidate(mapped, 'ws');
            });
            if (message.type === 'MPOS_SYNC_PULL' || message.type === 'SYNC_QUEUE_PULL') {
              void import('./mposKasaAutoPullService').then(({ triggerInstantKasaPull }) => {
                void triggerInstantKasaPull(this.storeId).catch((err) => {
                  logger.warn('[WS] Anlık kasa çekimi başarısız:', err);
                });
              });
            }
          } catch (err) {
            logger.error('[WS] Message parse error:', err);
          }
        };

        this.ws.onclose = (event) => {
          this.isConnecting = false;
          logger.warn(`?? WebSocket closed: ${event.code} ${event.reason}`);

          // Only reconnect if it wasn't a manual logout/disconnect
          if (event.code !== 1000) {
            this.handleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          // Only log first error to avoid console spam
          if (this.reconnectAttempts === 0) {
            logger.error('[WS] Connection error (Backend might be offline):', error);
          }
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(error);
          }
        };

      } catch (error) {
        this.isConnecting = false;
        logger.error('[WS] Failed to initiate connection:', error);
        this.handleReconnect();
        reject(error);
      }
      })();
    });
  }

  /**
   * Reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
      logger.info(`?? Reconnecting in ${delay / 1000}s (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        if (this.userId && this.storeId) {
          this.connect(this.userId, this.storeId).catch((err) => {
            // Reconnect denemelerinde promise rejection'ı yut; handleReconnect zaten tekrar deneyecek.
            if (this.reconnectAttempts <= 1) {
              logger.warn('[WS] Reconnect attempt failed:', err);
            }
          });
        }
      }, delay);
    } else {
      logger.error('? Maximum WebSocket reconnection attempts reached');
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      logger.info('?? WebSocket manually disconnected');
    }
  }

  /**
   * Send message to server
   */
  send(type: WSEventType, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message: WSMessage = {
        type,
        data,
        timestamp: new Date().toISOString(),
        userId: this.userId || undefined,
        storeId: this.storeId || undefined
      };

      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('[WS] Cannot send, not connected:', type);
    }
  }

  /**
   * Subscribe to events
   */
  on(eventType: WSEventType, callback: (data: any) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: WSEventType, callback: (data: any) => void): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Broadcast event to all listeners
   */
  private broadcast(eventType: WSEventType, data: any): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          logger.error(`? Error in ${eventType} listener:`, error);
        }
      });
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (this.isConnecting) return 'connecting';
    // Use explicit check to avoid undefined === undefined issues in tests
    if (this.ws && this.ws.readyState === 1) return 'connected';
    return 'disconnected';
  }
}

// Global WebSocket instance
export const wsService = new WebSocketService();

// Helper hooks for React components
export const useWebSocket = () => {
  return {
    connect: (userId: string, storeId: string) => wsService.connect(userId, storeId),
    disconnect: () => wsService.disconnect(),
    send: (type: WSEventType, data: any) => wsService.send(type, data),
    on: (type: WSEventType, callback: (data: any) => void) => wsService.on(type, callback),
    off: (type: WSEventType, callback: (data: any) => void) => wsService.off(type, callback),
    isConnected: () => wsService.isConnected(),
    getStatus: () => wsService.getStatus()
  };
};

