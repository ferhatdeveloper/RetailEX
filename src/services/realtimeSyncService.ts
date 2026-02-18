/**
 * RetailOS - Realtime Senkronizasyon Service
 * WebSocket tabanlı merkez-şube senkronizasyonu
 */
import { logger } from './loggingService';

export type DataType = 'urun' | 'musteri' | 'kampanya' | 'fiyat' | 'satis' | 'stok' | 'kasa';

export interface SyncMessage {
  type: 'data_sync' | 'ping' | 'pong' | 'data_request' | 'status_update' | 'test';
  action?: 'merkez_to_sube' | 'sube_to_merkez' | 'merkez_veri_al';
  data_type?: DataType;
  data?: any;
  timestamp: string;
  firma_id?: number;
  magaza_id?: number;
  request_id?: string;
  message?: string;
}

export interface ConnectionInfo {
  magaza_id: number;
  connected_at: string;
  last_ping: string;
  is_online: boolean;
}

class RealtimeSyncService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private pingInterval: number | null = null;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();

  /**
   * WebSocket bağlantısını başlat
   */
  connect(isMerkez: boolean, identifier: number) {
    const wsUrl = isMerkez
      ? `ws://localhost:8000/api/v1/ws/merkez/${identifier}`
      : `ws://localhost:8000/api/v1/ws/magaza/${identifier}?firma_id=1`;

    console.log(`🔌 WebSocket bağlantısı kuruluyor: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.info('WebSocket', 'WebSocket connection established successfully');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: SyncMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.warn('⚠️ Mesaj parse hatası');
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket', 'WebSocket error occurred', { error });
      };

      this.ws.onclose = (event) => {
        logger.warn('WebSocket', 'WebSocket connection closed', { code: event.code, reason: event.reason });
        this.stopHeartbeat();
        this.attemptReconnect(isMerkez, identifier);
      };
    } catch (error) {
      // WebSocket oluşturulamadı - sessizce devam et
      console.log('⚠️ WebSocket başlatılamadı');
    }
  }

  /**
   * Yeniden bağlanma denemesi
   */
  private attemptReconnect(isMerkez: boolean, identifier: number) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Yeniden bağlanma denemesi ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

      setTimeout(() => {
        this.connect(isMerkez, identifier);
      }, this.reconnectDelay);
    } else {
      console.error('❌ Maksimum yeniden bağlanma denemesi aşıldı');
    }
  }

  /**
   * Heartbeat (ping-pong) başlat
   */
  private startHeartbeat() {
    this.pingInterval = window.setInterval(() => {
      this.send({
        type: 'pong',
        timestamp: new Date().toISOString()
      });
    }, 30000); // 30 saniye
  }

  /**
   * Heartbeat durdur
   */
  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Mesaj gönder
   */
  send(message: SyncMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('⚠️ WebSocket bağlı değil, mesaj gönderilemedi');
    }
  }

  /**
   * Gelen mesajı işle
   */
  private handleMessage(message: SyncMessage) {
    console.log('📩 Mesaj alındı:', message.type, message.action);

    // Ping mesajına pong ile cevap ver
    if (message.type === 'ping') {
      this.send({
        type: 'pong',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Veri senkronizasyonu
    if (message.type === 'data_sync' && message.action === 'merkez_to_sube') {
      console.log('📥 Merkezden veri geldi:', message.data_type);
      this.trigger('data_received', message);
    }

    // Veri talebi
    if (message.type === 'data_request' && message.action === 'merkez_veri_al') {
      console.log('📤 Merkez veri talep etti:', message.data_type);
      this.trigger('data_request', message);
    }

    // Genel handler'ları tetikle
    this.trigger(message.type, message);
  }

  /**
   * Event handler ekle
   */
  on(event: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)!.push(handler);
  }

  /**
   * Event handler tetikle
   */
  private trigger(event: string, data: any) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Bağlantıyı kapat
   */
  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Bağlantı durumunu kontrol et
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const realtimeSyncService = new RealtimeSyncService();

/**
 * HTTP API üzerinden veri gönder/al işlemleri
 */
export const syncAPI = {
  /**
   * Merkezden şubelere veri gönder
   */
  async veriGonder(
    firmaId: number,
    magazaIds: number[] | null,
    dataType: DataType,
    data: any
  ): Promise<any> {
    const response = await fetch('/api/v1/ws/veri-gonder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firma_id: firmaId,
        magaza_ids: magazaIds,
        data_type: dataType,
        data: data
      })
    });

    if (!response.ok) {
      throw new Error('Veri gönderme hatası');
    }

    return response.json();
  },

  /**
   * Şubelerden veri talep et
   */
  async veriAl(
    firmaId: number,
    magazaIds: number[] | null,
    dataType: DataType
  ): Promise<any> {
    const response = await fetch('/api/v1/ws/veri-al', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firma_id: firmaId,
        magaza_ids: magazaIds,
        data_type: dataType
      })
    });

    if (!response.ok) {
      throw new Error('Veri talep hatası');
    }

    return response.json();
  },

  /**
   * Aktif bağlantıları listele
   */
  async getBaglantilar(firmaId: number): Promise<ConnectionInfo[]> {
    const response = await fetch(`/api/v1/ws/baglantilar/${firmaId}`);

    if (!response.ok) {
      throw new Error('Bağlantı listesi alınamadı');
    }

    const data = await response.json();
    return data.baglantilar;
  },

  /**
   * Mağaza durumunu kontrol et
   */
  async getMagazaDurum(magazaId: number): Promise<{ is_online: boolean; connection_info: any }> {
    const response = await fetch(`/api/v1/ws/magaza-durum/${magazaId}`);

    if (!response.ok) {
      throw new Error('Mağaza durumu alınamadı');
    }

    return response.json();
  }
};

/**
 * Örnek Kullanım:
 * 
 * // Merkez için WebSocket bağlantısı
 * realtimeSyncService.connect(true, 1); // firma_id = 1
 * 
 * // Mağaza için WebSocket bağlantısı
 * realtimeSyncService.connect(false, 2); // magaza_id = 2
 * 
 * // Veri geldiğinde dinle
 * realtimeSyncService.on('data_received', (message) => {
 *   console.log('Yeni veri:', message.data_type, message.data);
 *   // Lokal state'i güncelle
 *   if (message.data_type === 'urun') {
 *     updateProduct(message.data);
 *   }
 * });
 * 
 * // Merkezden şubelere veri gönder
 * await syncAPI.veriGonder(1, [2, 3, 4], 'urun', {
 *   urun_id: 123,
 *   urun_adi: 'Test Ürün',
 *   fiyat: 100.00
 * });
 * 
 * // Şubelerden veri al
 * await syncAPI.veriAl(1, null, 'gunluk_satis');
 */
