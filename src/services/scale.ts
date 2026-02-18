/**
 * ExRetailOS TCP/IP Scale Integration
 * Network-based scale communication for professional retail systems
 */

import { APP_VERSION } from '../core/version';

export interface ScaleConfig {
  ip: string;
  port: number;
  protocol: 'TCP' | 'UDP';
  baudRate?: number;
  timeout: number;
  enabled: boolean;
  name: string;
  manufacturer: 'CAS' | 'DIGI' | 'METLER_TOLEDO' | 'BIZERBA' | 'DIBAL' | 'CUSTOM';
}

export interface ScaleData {
  weight: number;          // Gram cinsinden
  unit: 'g' | 'kg';
  stable: boolean;         // Terazi sabit mi?
  tare: number;            // Dara (boş ağırlık)
  timestamp: string;
  scaleId: string;
}

export class ScaleService {
  private config: ScaleConfig;
  private socket: any = null; // WebSocket for TCP/IP simulation
  private isConnected: boolean = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private listeners: Set<(data: ScaleData) => void> = new Set();
  private mockMode: boolean = true; // Mock mode for demo

  constructor(config: ScaleConfig) {
    this.config = config;
  }

  /**
   * Connect to scale via TCP/IP
   */
  async connect(): Promise<void> {
    if (!this.config.enabled) {
      console.log('⚖️  Scale disabled in config');
      return;
    }

    try {
      console.log(`⚖️  Connecting to scale: ${this.config.name}`);
      console.log(`📡 ${this.config.protocol}://${this.config.ip}:${this.config.port}`);
      console.log(`🏭 Manufacturer: ${this.config.manufacturer}`);

      // In production, this would open a real TCP socket
      // For demo, we simulate the connection
      await this.simulateTCPConnection();

      this.isConnected = true;
      this.reconnectAttempts = 0;

      console.log(`✅ Scale connected - ${this.config.name} (${APP_VERSION.display})`);

      // Start reading weight data
      this.startWeightPolling();
    } catch (error) {
      console.error('❌ Scale connection error:', error);
      this.isConnected = false;

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(), 2000);
      }
    }
  }

  /**
   * Simulate TCP connection for demo
   */
  private async simulateTCPConnection(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('🔌 TCP Socket opened (Mock Mode)');
        resolve();
      }, 500);
    });
  }

  /**
   * Disconnect from scale
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    console.log('🔌 Scale disconnected');
  }

  /**
   * Read weight from scale (single read)
   */
  async readWeight(): Promise<ScaleData> {
    if (!this.isConnected) {
      throw new Error('Scale not connected');
    }

    // In production, this would send a command to the scale and parse response
    // Mock data for demo
    const mockWeight = this.mockMode ? this.generateMockWeight() : await this.readFromTCP();

    console.log(`⚖️  Weight read: ${mockWeight.weight}${mockWeight.unit} (Stable: ${mockWeight.stable})`);

    return mockWeight;
  }

  /**
   * Start continuous weight polling
   */
  private startWeightPolling(): void {
    setInterval(async () => {
      if (this.isConnected) {
        try {
          const data = await this.readWeight();

          // Notify all listeners
          this.listeners.forEach(callback => {
            try {
              callback(data);
            } catch (error) {
              console.error('❌ Error in scale listener:', error);
            }
          });
        } catch (error) {
          console.error('❌ Weight polling error:', error);
        }
      }
    }, 200); // 200ms polling interval (5 updates per second)
  }

  /**
   * Generate mock weight data for demo
   */
  private generateMockWeight(): ScaleData {
    // Simulate realistic weight fluctuations
    const baseWeight = 250 + Math.random() * 500; // 250-750g
    const isStable = Math.random() > 0.3; // 70% chance stable

    return {
      weight: isStable ? Math.round(baseWeight) : Math.round(baseWeight + (Math.random() - 0.5) * 10),
      unit: 'g',
      stable: isStable,
      tare: 0,
      timestamp: new Date().toISOString(),
      scaleId: this.config.name
    };
  }

  /**
   * Read from real TCP socket (production)
   */
  private async readFromTCP(): Promise<ScaleData> {
    // Production implementation would:
    // 1. Send read command based on manufacturer protocol
    // 2. Wait for response
    // 3. Parse binary/ASCII data
    // 4. Return structured ScaleData

    // Example for CAS scales:
    // Command: 0x57 (W - Weight request)
    // Response: STX + Weight + Unit + Status + ETX + Checksum

    throw new Error('Not implemented - use mock mode for demo');
  }

  /**
   * Subscribe to weight updates
   */
  onWeightChange(callback: (data: ScaleData) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Unsubscribe from weight updates
   */
  offWeightChange(callback: (data: ScaleData) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Zero/Tare the scale
   */
  async tare(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Scale not connected');
    }

    console.log('⚖️  Tare command sent');

    // In production, send tare command to scale
    // Mock: just log the action
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Check connection status
   */
  isScaleConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get scale config
   */
  getConfig(): ScaleConfig {
    return { ...this.config };
  }

  /**
   * Update scale config
   */
  updateConfig(config: Partial<ScaleConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('⚖️  Scale config updated:', this.config);
  }
}

/**
 * Scale Manager - Manages multiple scales
 */
export class ScaleManager {
  private scales: Map<string, ScaleService> = new Map();

  /**
   * Add a scale
   */
  addScale(id: string, config: ScaleConfig): ScaleService {
    const scale = new ScaleService(config);
    this.scales.set(id, scale);
    console.log(`⚖️  Scale added: ${id}`);
    return scale;
  }

  /**
   * Get scale by ID
   */
  getScale(id: string): ScaleService | undefined {
    return this.scales.get(id);
  }

  /**
   * Remove scale
   */
  removeScale(id: string): void {
    const scale = this.scales.get(id);
    if (scale) {
      scale.disconnect();
      this.scales.delete(id);
      console.log(`⚖️  Scale removed: ${id}`);
    }
  }

  /**
   * Connect all scales
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.scales.values()).map(scale => scale.connect());
    await Promise.all(promises);
  }

  /**
   * Disconnect all scales
   */
  disconnectAll(): void {
    this.scales.forEach(scale => scale.disconnect());
  }

  /**
   * Get all scales
   */
  getAllScales(): ScaleService[] {
    return Array.from(this.scales.values());
  }
}

// Default scale configurations for common manufacturers
export const DEFAULT_SCALE_CONFIGS: Record<string, Partial<ScaleConfig>> = {
  CAS: {
    port: 9001,
    protocol: 'TCP',
    timeout: 1000,
    manufacturer: 'CAS'
  },
  DIGI: {
    port: 8001,
    protocol: 'TCP',
    timeout: 1000,
    manufacturer: 'DIGI'
  },
  METLER_TOLEDO: {
    port: 8217,
    protocol: 'TCP',
    timeout: 1000,
    manufacturer: 'METLER_TOLEDO'
  },
  BIZERBA: {
    port: 3001,
    protocol: 'TCP',
    timeout: 1000,
    manufacturer: 'BIZERBA'
  },
  DIBAL: {
    port: 5000,
    protocol: 'TCP',
    timeout: 1000,
    manufacturer: 'DIBAL'
  }
};

// Global scale manager instance
export const scaleManager = new ScaleManager();

// Initialize default POS scale
const defaultScaleConfig: ScaleConfig = {
  ip: '192.168.1.100',
  port: 9001,
  protocol: 'TCP',
  timeout: 1000,
  enabled: true,
  name: 'POS-SCALE-01',
  manufacturer: 'CAS'
};

export const posScale = scaleManager.addScale('pos-main', defaultScaleConfig);

console.log(`⚖️  Scale Service initialized - ${APP_VERSION.display}`);

