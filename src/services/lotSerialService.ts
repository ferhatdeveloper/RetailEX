/**
 * Lot & Serial Number Tracking Service
 * Pattern: Factory Pattern + Command Pattern
 * Features: Lot tracking, serial tracking, expiry management, traceability
 */

// Tracking Type
export type TrackingType = 'NONE' | 'LOT' | 'SERIAL' | 'BOTH';

// Lot
export interface Lot {
  id: string;
  lot_number: string;
  product_id: string;
  quantity: number;
  remaining_quantity: number;
  manufacture_date?: string;
  expiry_date?: string;
  supplier_id?: string;
  purchase_invoice_id?: string;
  warehouse_id: string;
  status: LotStatus;
  notes?: string;
  created_at: string;
}

export type LotStatus = 'ACTIVE' | 'EXPIRED' | 'RECALLED' | 'DEPLETED';

// Serial Number
export interface SerialNumber {
  id: string;
  serial_number: string;
  product_id: string;
  lot_id?: string;
  warehouse_id: string;
  status: SerialStatus;
  purchase_date?: string;
  sale_date?: string;
  sale_id?: string;
  customer_id?: string;
  warranty_expiry?: string;
  notes?: string;
  created_at: string;
}

export type SerialStatus = 
  | 'IN_STOCK'
  | 'SOLD'
  | 'RESERVED'
  | 'DEFECTIVE'
  | 'RETURNED'
  | 'WARRANTY_REPAIR';

// Movement History
export interface LotMovement {
  id: string;
  lot_id: string;
  from_warehouse_id?: string;
  to_warehouse_id: string;
  quantity: number;
  movement_type: 'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUST' | 'RETURN';
  reference_type?: string;
  reference_id?: string;
  performed_by: string;
  created_at: string;
}

export interface SerialMovement {
  id: string;
  serial_id: string;
  from_status: SerialStatus;
  to_status: SerialStatus;
  warehouse_id?: string;
  movement_type: string;
  reference_id?: string;
  performed_by: string;
  notes?: string;
  created_at: string;
}

// FIFO/FEFO Selection Strategy
export interface LotSelectionResult {
  lot_id: string;
  lot_number: string;
  quantity: number;
  expiry_date?: string;
}

/**
 * Lot Selection Strategy
 */
interface LotSelectionStrategy {
  selectLots(
    availableLots: Lot[],
    requiredQuantity: number
  ): LotSelectionResult[];
}

/**
 * FIFO (First In First Out)
 */
class FIFOStrategy implements LotSelectionStrategy {
  selectLots(availableLots: Lot[], requiredQuantity: number): LotSelectionResult[] {
    const sorted = [...availableLots].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return this.allocate(sorted, requiredQuantity);
  }

  protected allocate(lots: Lot[], required: number): LotSelectionResult[] {
    const result: LotSelectionResult[] = [];
    let remaining = required;

    for (const lot of lots) {
      if (remaining <= 0) break;

      const allocateQty = Math.min(lot.remaining_quantity, remaining);

      result.push({
        lot_id: lot.id,
        lot_number: lot.lot_number,
        quantity: allocateQty,
        expiry_date: lot.expiry_date
      });

      remaining -= allocateQty;
    }

    return result;
  }
}

/**
 * FEFO (First Expired First Out)
 */
class FEFOStrategy extends FIFOStrategy {
  selectLots(availableLots: Lot[], requiredQuantity: number): LotSelectionResult[] {
    const sorted = [...availableLots].sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
    });

    return this.allocate(sorted, requiredQuantity);
  }
}

/**
 * LIFO (Last In First Out)
 */
class LIFOStrategy extends FIFOStrategy {
  selectLots(availableLots: Lot[], requiredQuantity: number): LotSelectionResult[] {
    const sorted = [...availableLots].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return this.allocate(sorted, requiredQuantity);
  }
}

/**
 * Lot & Serial Service
 */
export class LotSerialService {
  private lots: Map<string, Lot> = new Map();
  private serials: Map<string, SerialNumber> = new Map();
  private lotMovements: LotMovement[] = [];
  private serialMovements: SerialMovement[] = [];
  private selectionStrategies: Map<string, LotSelectionStrategy>;

  constructor() {
    this.selectionStrategies = new Map([
      ['FIFO', new FIFOStrategy()],
      ['FEFO', new FEFOStrategy()],
      ['LIFO', new LIFOStrategy()]
    ]);
  }

  /**
   * Create lot
   */
  createLot(
    lotNumber: string,
    productId: string,
    quantity: number,
    warehouseId: string,
    options?: {
      manufactureDate?: string;
      expiryDate?: string;
      supplierId?: string;
      purchaseInvoiceId?: string;
      notes?: string;
    }
  ): Lot {
    const lot: Lot = {
      id: `lot-${Date.now()}`,
      lot_number: lotNumber,
      product_id: productId,
      quantity,
      remaining_quantity: quantity,
      manufacture_date: options?.manufactureDate,
      expiry_date: options?.expiryDate,
      supplier_id: options?.supplierId,
      purchase_invoice_id: options?.purchaseInvoiceId,
      warehouse_id: warehouseId,
      status: 'ACTIVE',
      notes: options?.notes,
      created_at: new Date().toISOString()
    };

    this.lots.set(lot.id, lot);

    // Record movement
    this.recordLotMovement({
      lot_id: lot.id,
      to_warehouse_id: warehouseId,
      quantity,
      movement_type: 'PURCHASE',
      reference_type: options?.purchaseInvoiceId ? 'PURCHASE_INVOICE' : undefined,
      reference_id: options?.purchaseInvoiceId,
      performed_by: 'system'
    });

    return lot;
  }

  /**
   * Create serial number
   */
  createSerial(
    serialNumber: string,
    productId: string,
    warehouseId: string,
    lotId?: string,
    options?: {
      purchaseDate?: string;
      warrantyExpiry?: string;
      notes?: string;
    }
  ): SerialNumber {
    const serial: SerialNumber = {
      id: `serial-${Date.now()}`,
      serial_number: serialNumber,
      product_id: productId,
      lot_id: lotId,
      warehouse_id: warehouseId,
      status: 'IN_STOCK',
      purchase_date: options?.purchaseDate,
      warranty_expiry: options?.warrantyExpiry,
      notes: options?.notes,
      created_at: new Date().toISOString()
    };

    this.serials.set(serial.id, serial);

    // Record movement
    this.recordSerialMovement({
      serial_id: serial.id,
      from_status: 'IN_STOCK',
      to_status: 'IN_STOCK',
      warehouse_id: warehouseId,
      movement_type: 'RECEIVE',
      performed_by: 'system'
    });

    return serial;
  }

  /**
   * Allocate from lots (FIFO/FEFO/LIFO)
   */
  allocateFromLots(
    productId: string,
    quantity: number,
    warehouseId: string,
    strategy: 'FIFO' | 'FEFO' | 'LIFO' = 'FIFO'
  ): { success: boolean; allocations?: LotSelectionResult[]; message?: string } {
    // Get available lots
    const availableLots = Array.from(this.lots.values()).filter(lot => 
      lot.product_id === productId &&
      lot.warehouse_id === warehouseId &&
      lot.status === 'ACTIVE' &&
      lot.remaining_quantity > 0
    );

    const totalAvailable = availableLots.reduce((sum, lot) => sum + lot.remaining_quantity, 0);

    if (totalAvailable < quantity) {
      return { 
        success: false, 
        message: `Yetersiz lot stoku. Mevcut: ${totalAvailable}, Gerekli: ${quantity}` 
      };
    }

    // Select strategy
    const selectionStrategy = this.selectionStrategies.get(strategy);
    if (!selectionStrategy) {
      return { success: false, message: 'Geçersiz strateji' };
    }

    // Allocate
    const allocations = selectionStrategy.selectLots(availableLots, quantity);

    // Update lot quantities
    allocations.forEach(allocation => {
      const lot = this.lots.get(allocation.lot_id);
      if (lot) {
        lot.remaining_quantity -= allocation.quantity;
        if (lot.remaining_quantity === 0) {
          lot.status = 'DEPLETED';
        }
      }
    });

    return { success: true, allocations };
  }

  /**
   * Allocate serial numbers
   */
  allocateSerials(
    productId: string,
    quantity: number,
    warehouseId: string
  ): { success: boolean; serials?: SerialNumber[]; message?: string } {
    const availableSerials = Array.from(this.serials.values()).filter(s =>
      s.product_id === productId &&
      s.warehouse_id === warehouseId &&
      s.status === 'IN_STOCK'
    );

    if (availableSerials.length < quantity) {
      return { 
        success: false, 
        message: `Yetersiz seri numarası. Mevcut: ${availableSerials.length}, Gerekli: ${quantity}` 
      };
    }

    const allocated = availableSerials.slice(0, quantity);

    return { success: true, serials: allocated };
  }

  /**
   * Mark serial as sold
   */
  markSerialAsSold(
    serialId: string,
    saleId: string,
    customerId?: string
  ): { success: boolean; message?: string } {
    const serial = this.serials.get(serialId);

    if (!serial) {
      return { success: false, message: 'Seri numarası bulunamadı' };
    }

    if (serial.status !== 'IN_STOCK' && serial.status !== 'RESERVED') {
      return { success: false, message: 'Seri numarası satılamaz durumda' };
    }

    serial.status = 'SOLD';
    serial.sale_date = new Date().toISOString();
    serial.sale_id = saleId;
    serial.customer_id = customerId;

    this.recordSerialMovement({
      serial_id: serialId,
      from_status: 'IN_STOCK',
      to_status: 'SOLD',
      movement_type: 'SALE',
      reference_id: saleId,
      performed_by: 'system'
    });

    return { success: true, message: 'Seri numarası satıldı olarak işaretlendi' };
  }

  /**
   * Get lot by number
   */
  getLotByNumber(lotNumber: string): Lot | undefined {
    return Array.from(this.lots.values()).find(lot => lot.lot_number === lotNumber);
  }

  /**
   * Get serial by number
   */
  getSerialByNumber(serialNumber: string): SerialNumber | undefined {
    return Array.from(this.serials.values()).find(s => s.serial_number === serialNumber);
  }

  /**
   * Get lots for product
   */
  getLotsForProduct(productId: string, warehouseId?: string): Lot[] {
    let lots = Array.from(this.lots.values()).filter(lot => lot.product_id === productId);

    if (warehouseId) {
      lots = lots.filter(lot => lot.warehouse_id === warehouseId);
    }

    return lots.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  /**
   * Get serials for product
   */
  getSerialsForProduct(productId: string, warehouseId?: string, status?: SerialStatus): SerialNumber[] {
    let serials = Array.from(this.serials.values()).filter(s => s.product_id === productId);

    if (warehouseId) {
      serials = serials.filter(s => s.warehouse_id === warehouseId);
    }

    if (status) {
      serials = serials.filter(s => s.status === status);
    }

    return serials;
  }

  /**
   * Check expiring lots
   */
  getExpiringLots(daysThreshold: number = 30): Lot[] {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    return Array.from(this.lots.values()).filter(lot => {
      if (!lot.expiry_date || lot.status !== 'ACTIVE') return false;

      const expiryDate = new Date(lot.expiry_date);
      return expiryDate <= thresholdDate && expiryDate > new Date();
    }).sort((a, b) => 
      new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime()
    );
  }

  /**
   * Get expired lots
   */
  getExpiredLots(): Lot[] {
    const now = new Date();

    return Array.from(this.lots.values()).filter(lot => {
      if (!lot.expiry_date) return false;

      const expiryDate = new Date(lot.expiry_date);
      return expiryDate < now && lot.status === 'ACTIVE';
    });
  }

  /**
   * Mark lot as expired
   */
  markLotAsExpired(lotId: string): { success: boolean; message?: string } {
    const lot = this.lots.get(lotId);

    if (!lot) {
      return { success: false, message: 'Lot bulunamadı' };
    }

    lot.status = 'EXPIRED';

    return { success: true, message: 'Lot süresi dolmuş olarak işaretlendi' };
  }

  /**
   * Recall lot (geri çağırma)
   */
  recallLot(
    lotId: string,
    reason: string,
    performedBy: string
  ): { success: boolean; affectedSerials?: SerialNumber[]; message?: string } {
    const lot = this.lots.get(lotId);

    if (!lot) {
      return { success: false, message: 'Lot bulunamadı' };
    }

    lot.status = 'RECALLED';
    lot.notes = (lot.notes || '') + `\nGeri çağırma: ${reason}`;

    // Find all serials from this lot
    const affectedSerials = Array.from(this.serials.values()).filter(s => s.lot_id === lotId);

    return { 
      success: true, 
      affectedSerials,
      message: `Lot geri çağırıldı. ${affectedSerials.length} seri numarası etkilendi.` 
    };
  }

  /**
   * Trace serial (seri numarası geçmişi)
   */
  traceSerial(serialNumber: string): {
    serial?: SerialNumber;
    movements: SerialMovement[];
    lot?: Lot;
  } {
    const serial = this.getSerialByNumber(serialNumber);

    if (!serial) {
      return { movements: [] };
    }

    const movements = this.serialMovements.filter(m => m.serial_id === serial.id);
    const lot = serial.lot_id ? this.lots.get(serial.lot_id) : undefined;

    return { serial, movements, lot };
  }

  /**
   * Trace lot (lot geçmişi)
   */
  traceLot(lotNumber: string): {
    lot?: Lot;
    movements: LotMovement[];
    serials: SerialNumber[];
  } {
    const lot = this.getLotByNumber(lotNumber);

    if (!lot) {
      return { movements: [], serials: [] };
    }

    const movements = this.lotMovements.filter(m => m.lot_id === lot.id);
    const serials = Array.from(this.serials.values()).filter(s => s.lot_id === lot.id);

    return { lot, movements, serials };
  }

  /**
   * Record lot movement
   */
  private recordLotMovement(movement: Omit<LotMovement, 'id' | 'created_at'>): void {
    this.lotMovements.push({
      id: `lotmov-${Date.now()}-${Math.random()}`,
      ...movement,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Record serial movement
   */
  private recordSerialMovement(movement: Omit<SerialMovement, 'id' | 'created_at'>): void {
    this.serialMovements.push({
      id: `sermov-${Date.now()}-${Math.random()}`,
      ...movement,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Get lot movements
   */
  getLotMovements(lotId?: string): LotMovement[] {
    if (lotId) {
      return this.lotMovements.filter(m => m.lot_id === lotId);
    }
    return this.lotMovements;
  }

  /**
   * Get serial movements
   */
  getSerialMovements(serialId?: string): SerialMovement[] {
    if (serialId) {
      return this.serialMovements.filter(m => m.serial_id === serialId);
    }
    return this.serialMovements;
  }

  /**
   * Bulk create serials
   */
  bulkCreateSerials(
    productId: string,
    warehouseId: string,
    serialNumbers: string[],
    lotId?: string
  ): SerialNumber[] {
    return serialNumbers.map(sn => 
      this.createSerial(sn, productId, warehouseId, lotId)
    );
  }

  /**
   * Auto-expire lots (should be run daily)
   */
  autoExpireLots(): { expired: Lot[]; expiring: Lot[] } {
    const expiredLots = this.getExpiredLots();
    
    expiredLots.forEach(lot => {
      this.markLotAsExpired(lot.id);
    });

    const expiringLots = this.getExpiringLots(7); // 7 days threshold

    return { expired: expiredLots, expiring: expiringLots };
  }
}

// Singleton instance
export const lotSerialService = new LotSerialService();

// Export types
export type { Lot, SerialNumber, LotMovement, SerialMovement, LotSelectionResult };

