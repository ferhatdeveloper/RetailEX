/**
 * QR Scanner Service
 * Pattern: Strategy Pattern + Observer Pattern
 * Features: Camera integration, QR code scanning, loyalty points
 */

import { customerSegmentationService } from './customerSegmentationService';

export interface QRScanResult {
  type: 'CUSTOMER' | 'PRODUCT' | 'COUPON' | 'PAYMENT';
  data: any;
  scanned_at: string;
}

export interface ScanOptions {
  autoStart?: boolean;
  facingMode?: 'user' | 'environment';
  onResult?: (result: QRScanResult) => void;
  onError?: (error: Error) => void;
}

/**
 * QR Scanner Service
 */
export class QRScannerService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isScanning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;

  /**
   * Start camera
   */
  async startCamera(
    videoElement: HTMLVideoElement,
    options: ScanOptions = {}
  ): Promise<void> {
    const { facingMode = 'environment' } = options;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      videoElement.srcObject = this.stream;
      this.videoElement = videoElement;

      await videoElement.play();

      if (options.autoStart) {
        this.startScanning(options);
      }
    } catch (error) {
      console.error('Camera error:', error);
      if (options.onError) {
        options.onError(error as Error);
      }
      throw new Error('Kamera açılamadı. Lütfen kamera izni verin.');
    }
  }

  /**
   * Stop camera
   */
  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.stopScanning();
  }

  /**
   * Start scanning
   */
  startScanning(options: ScanOptions = {}): void {
    if (this.isScanning) return;

    this.isScanning = true;

    // In a real implementation, you would use a library like jsQR or zxing
    // For this demo, we'll simulate scanning
    this.scanInterval = setInterval(() => {
      if (this.videoElement && Math.random() > 0.7) {
        // Simulate successful scan
        const result = this.mockScan();
        
        if (options.onResult) {
          options.onResult(result);
        }

        // Stop after successful scan
        this.stopScanning();
      }
    }, 500);
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    this.isScanning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  /**
   * Mock scan (replace with real QR decoder)
   */
  private mockScan(): QRScanResult {
    const types: Array<'CUSTOMER' | 'PRODUCT' | 'COUPON'> = ['CUSTOMER', 'PRODUCT', 'COUPON'];
    const type = types[Math.floor(Math.random() * types.length)];

    let data: any;

    switch (type) {
      case 'CUSTOMER':
        data = {
          customerId: `customer-${Math.floor(Math.random() * 1000)}`,
          name: 'Değerli Müşteri',
          phone: '05XX XXX XXXX'
        };
        break;

      case 'PRODUCT':
        data = {
          productId: `product-${Math.floor(Math.random() * 1000)}`,
          barcode: `${Math.floor(Math.random() * 1000000000000)}`,
          name: 'Ürün Adı'
        };
        break;

      case 'COUPON':
        data = {
          couponCode: `COUPON${Math.floor(Math.random() * 10000)}`,
          discountRate: 10 + Math.floor(Math.random() * 40),
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        break;
    }

    return {
      type,
      data,
      scanned_at: new Date().toISOString()
    };
  }

  /**
   * Process customer QR scan for loyalty points
   */
  async processCustomerScan(
    customerId: string,
    purchaseAmount: number
  ): Promise<{
    success: boolean;
    pointsEarned: number;
    newBalance: number;
    message: string;
  }> {
    try {
      // Earn points
      const transaction = await customerSegmentationService.earnPoints(
        customerId,
        purchaseAmount,
        'PURCHASE'
      );

      // Get new balance
      const newBalance = customerSegmentationService.getPointsBalance(customerId);

      return {
        success: true,
        pointsEarned: transaction.points,
        newBalance,
        message: `${transaction.points} puan kazandınız! Toplam: ${newBalance}`
      };
    } catch (error) {
      return {
        success: false,
        pointsEarned: 0,
        newBalance: 0,
        message: 'Puan kazanımı başarısız'
      };
    }
  }

  /**
   * Validate coupon QR
   */
  async validateCoupon(couponCode: string): Promise<{
    valid: boolean;
    discount?: number;
    message: string;
  }> {
    // Mock validation
    await new Promise(resolve => setTimeout(resolve, 500));

    const isValid = Math.random() > 0.3;

    if (isValid) {
      return {
        valid: true,
        discount: 10 + Math.floor(Math.random() * 40),
        message: 'Kupon geçerli!'
      };
    } else {
      return {
        valid: false,
        message: 'Kupon geçersiz veya süresi dolmuş'
      };
    }
  }

  /**
   * Decode QR data (utility method)
   */
  decodeQR(qrData: string): QRScanResult | null {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(qrData);

      if (parsed.type && parsed.data) {
        return {
          type: parsed.type,
          data: parsed.data,
          scanned_at: new Date().toISOString()
        };
      }

      // If not JSON, try to determine type from string pattern
      if (qrData.startsWith('CUST-')) {
        return {
          type: 'CUSTOMER',
          data: { customerId: qrData },
          scanned_at: new Date().toISOString()
        };
      }

      if (qrData.startsWith('PROD-')) {
        return {
          type: 'PRODUCT',
          data: { productId: qrData },
          scanned_at: new Date().toISOString()
        };
      }

      if (qrData.startsWith('COUP-')) {
        return {
          type: 'COUPON',
          data: { couponCode: qrData },
          scanned_at: new Date().toISOString()
        };
      }

      // Default to customer
      return {
        type: 'CUSTOMER',
        data: { customerId: qrData },
        scanned_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('QR decode error:', error);
      return null;
    }
  }

  /**
   * Generate customer QR code (for printing/display)
   */
  generateCustomerQR(customerId: string): string {
    // In real implementation, use a QR code generator library
    // This returns the data that should be encoded
    return JSON.stringify({
      type: 'CUSTOMER',
      data: { customerId },
      generated_at: new Date().toISOString()
    });
  }

  /**
   * Check camera permissions
   */
  async checkCameraPermission(): Promise<boolean> {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return result.state === 'granted';
    } catch (error) {
      // Fallback: try to access camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Request camera permission
   */
  async requestCameraPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Loyalty Points Processor
 */
export class LoyaltyPointsProcessor {
  /**
   * Process QR scan for points
   */
  async processQRScan(
    customerId: string,
    amount: number,
    scanType: 'PURCHASE' | 'CHECK_IN' | 'REFERRAL' | 'BONUS' = 'PURCHASE'
  ): Promise<{
    success: boolean;
    points: number;
    balance: number;
    tier: string;
    message: string;
  }> {
    try {
      let pointsMultiplier = 1;

      switch (scanType) {
        case 'CHECK_IN':
          pointsMultiplier = 0.1; // 10 puan check-in bonusu
          break;
        case 'REFERRAL':
          pointsMultiplier = 5; // 500 puan referans bonusu
          break;
        case 'BONUS':
          pointsMultiplier = 2; // 2x puan
          break;
      }

      const transaction = await customerSegmentationService.earnPoints(
        customerId,
        amount * pointsMultiplier,
        scanType
      );

      const balance = customerSegmentationService.getPointsBalance(customerId);
      const tier = customerSegmentationService.getLoyaltyTier(balance);

      return {
        success: true,
        points: transaction.points,
        balance,
        tier: tier.tier,
        message: `${transaction.points} puan kazandınız! Toplam: ${balance} puan`
      };
    } catch (error) {
      return {
        success: false,
        points: 0,
        balance: 0,
        tier: 'BRONZE',
        message: 'Puan işlemi başarısız'
      };
    }
  }

  /**
   * Redeem points via QR
   */
  async redeemPoints(
    customerId: string,
    points: number
  ): Promise<{
    success: boolean;
    discount: number;
    newBalance: number;
    message: string;
  }> {
    const result = await customerSegmentationService.redeemPoints(
      customerId,
      points,
      'QR scan redemption'
    );

    if (!result.success) {
      return {
        success: false,
        discount: 0,
        newBalance: 0,
        message: result.message || 'Puan kullanımı başarısız'
      };
    }

    const discount = customerSegmentationService.pointsToMoney(points);
    const newBalance = customerSegmentationService.getPointsBalance(customerId);

    return {
      success: true,
      discount,
      newBalance,
      message: `${points} puan kullanıldı. İndirim: ${discount} TL`
    };
  }
}

// Singleton instances
export const qrScannerService = new QRScannerService();
export const loyaltyPointsProcessor = new LoyaltyPointsProcessor();

// Export types
export type { QRScanResult, ScanOptions };

