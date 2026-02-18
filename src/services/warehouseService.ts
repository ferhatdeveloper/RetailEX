/**
 * Multi-Warehouse Service
 * Pattern: Repository Pattern + State Pattern
 * Features: Inter-warehouse transfers, stock tracking, approval workflow
 */

import { Product } from '../App';

// Types
export interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: 'retail' | 'warehouse' | 'wholesale' | 'virtual';
  address: string;
  city: string;
  manager_id: string;
  is_main: boolean;
  is_active: boolean;
  settings: WarehouseSettings;
}

export interface WarehouseSettings {
  allow_negative_stock: boolean;
  auto_approve_transfers: boolean;
  min_stock_alert: boolean;
  require_approval_above: number;                     // Tutar limiti
}

export interface WarehouseStock {
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reserved: number;                                   // Rezerve stok
  available: number;                                  // Kullanılabilir = quantity - reserved
  last_updated: string;
}

export interface StockTransfer {
  id: string;
  transfer_no: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: TransferStatus;
  items: TransferItem[];
  total_value: number;
  notes?: string;
  created_by: string;
  approved_by?: string;
  created_at: string;
  approved_at?: string;
  completed_at?: string;
}

export type TransferStatus = 
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface TransferItem {
  product_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface StockMovement {
  id: string;
  warehouse_id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  reference_type?: string;                            // SALE, PURCHASE, TRANSFER, ADJUST
  reference_id?: string;
  notes?: string;
  created_by: string;
  created_at: string;
}

export type MovementType = 'IN' | 'OUT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUST';

/**
 * Transfer State (State Pattern)
 */
abstract class TransferState {
  abstract canEdit(): boolean;
  abstract canApprove(): boolean;
  abstract canCancel(): boolean;
  abstract canComplete(): boolean;
  abstract nextStates(): TransferStatus[];
}

class DraftState extends TransferState {
  canEdit(): boolean { return true; }
  canApprove(): boolean { return true; }
  canCancel(): boolean { return true; }
  canComplete(): boolean { return false; }
  nextStates(): TransferStatus[] { return ['PENDING_APPROVAL', 'CANCELLED']; }
}

class PendingApprovalState extends TransferState {
  canEdit(): boolean { return false; }
  canApprove(): boolean { return true; }
  canCancel(): boolean { return true; }
  canComplete(): boolean { return false; }
  nextStates(): TransferStatus[] { return ['APPROVED', 'REJECTED', 'CANCELLED']; }
}

class ApprovedState extends TransferState {
  canEdit(): boolean { return false; }
  canApprove(): boolean { return false; }
  canCancel(): boolean { return true; }
  canComplete(): boolean { return true; }
  nextStates(): TransferStatus[] { return ['IN_TRANSIT', 'CANCELLED']; }
}

class InTransitState extends TransferState {
  canEdit(): boolean { return false; }
  canApprove(): boolean { return false; }
  canCancel(): boolean { return false; }
  canComplete(): boolean { return true; }
  nextStates(): TransferStatus[] { return ['COMPLETED']; }
}

class CompletedState extends TransferState {
  canEdit(): boolean { return false; }
  canApprove(): boolean { return false; }
  canCancel(): boolean { return false; }
  canComplete(): boolean { return false; }
  nextStates(): TransferStatus[] { return []; }
}

class CancelledState extends TransferState {
  canEdit(): boolean { return false; }
  canApprove(): boolean { return false; }
  canCancel(): boolean { return false; }
  canComplete(): boolean { return false; }
  nextStates(): TransferStatus[] { return []; }
}

/**
 * Transfer State Factory
 */
class TransferStateFactory {
  static getState(status: TransferStatus): TransferState {
    switch (status) {
      case 'DRAFT': return new DraftState();
      case 'PENDING_APPROVAL': return new PendingApprovalState();
      case 'APPROVED': return new ApprovedState();
      case 'IN_TRANSIT': return new InTransitState();
      case 'COMPLETED': return new CompletedState();
      case 'CANCELLED':
      case 'REJECTED': return new CancelledState();
      default: return new DraftState();
    }
  }
}

/**
 * Warehouse Repository
 */
class WarehouseRepository {
  private warehouses: Map<string, Warehouse> = new Map();
  private stocks: Map<string, WarehouseStock[]> = new Map();
  private transfers: Map<string, StockTransfer> = new Map();
  private movements: StockMovement[] = [];

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // Mock warehouses
    const mockWarehouses: Warehouse[] = [
      {
        id: 'wh-001',
        code: 'MAIN',
        name: 'Ana Depo',
        type: 'warehouse',
        address: 'İstanbul Merkez',
        city: 'İstanbul',
        manager_id: 'user-001',
        is_main: true,
        is_active: true,
        settings: {
          allow_negative_stock: false,
          auto_approve_transfers: false,
          min_stock_alert: true,
          require_approval_above: 10000
        }
      },
      {
        id: 'wh-002',
        code: 'STORE1',
        name: 'Kadıköy Mağaza',
        type: 'retail',
        address: 'Kadıköy, İstanbul',
        city: 'İstanbul',
        manager_id: 'user-002',
        is_main: false,
        is_active: true,
        settings: {
          allow_negative_stock: false,
          auto_approve_transfers: true,
          min_stock_alert: true,
          require_approval_above: 5000
        }
      },
      {
        id: 'wh-003',
        code: 'STORE2',
        name: 'Beşiktaş Mağaza',
        type: 'retail',
        address: 'Beşiktaş, İstanbul',
        city: 'İstanbul',
        manager_id: 'user-003',
        is_main: false,
        is_active: true,
        settings: {
          allow_negative_stock: false,
          auto_approve_transfers: true,
          min_stock_alert: true,
          require_approval_above: 5000
        }
      }
    ];

    mockWarehouses.forEach(wh => this.warehouses.set(wh.id, wh));
  }

  getWarehouses(): Warehouse[] {
    return Array.from(this.warehouses.values()).filter(wh => wh.is_active);
  }

  getWarehouse(id: string): Warehouse | undefined {
    return this.warehouses.get(id);
  }

  getWarehouseStock(warehouseId: string): WarehouseStock[] {
    return this.stocks.get(warehouseId) || [];
  }

  getProductStock(productId: string): WarehouseStock[] {
    const allStocks: WarehouseStock[] = [];
    this.stocks.forEach((stocks) => {
      const productStock = stocks.find(s => s.product_id === productId);
      if (productStock) {
        allStocks.push(productStock);
      }
    });
    return allStocks;
  }

  updateStock(warehouseId: string, productId: string, quantity: number): void {
    let warehouseStocks = this.stocks.get(warehouseId) || [];
    const existingStock = warehouseStocks.find(s => s.product_id === productId);

    if (existingStock) {
      existingStock.quantity += quantity;
      existingStock.available = existingStock.quantity - existingStock.reserved;
      existingStock.last_updated = new Date().toISOString();
    } else {
      warehouseStocks.push({
        warehouse_id: warehouseId,
        product_id: productId,
        quantity,
        reserved: 0,
        available: quantity,
        last_updated: new Date().toISOString()
      });
    }

    this.stocks.set(warehouseId, warehouseStocks);
  }

  saveTransfer(transfer: StockTransfer): void {
    this.transfers.set(transfer.id, transfer);
  }

  getTransfer(id: string): StockTransfer | undefined {
    return this.transfers.get(id);
  }

  getTransfers(warehouseId?: string): StockTransfer[] {
    const allTransfers = Array.from(this.transfers.values());
    
    if (warehouseId) {
      return allTransfers.filter(t => 
        t.from_warehouse_id === warehouseId || t.to_warehouse_id === warehouseId
      );
    }

    return allTransfers;
  }

  addMovement(movement: StockMovement): void {
    this.movements.push(movement);
  }

  getMovements(warehouseId?: string, productId?: string): StockMovement[] {
    let filtered = this.movements;

    if (warehouseId) {
      filtered = filtered.filter(m => m.warehouse_id === warehouseId);
    }

    if (productId) {
      filtered = filtered.filter(m => m.product_id === productId);
    }

    return filtered.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
}

/**
 * Warehouse Service (Facade)
 */
export class WarehouseService {
  private repository: WarehouseRepository;

  constructor() {
    this.repository = new WarehouseRepository();
  }

  /**
   * Get all warehouses
   */
  getWarehouses(): Warehouse[] {
    return this.repository.getWarehouses();
  }

  /**
   * Get warehouse by ID
   */
  getWarehouse(id: string): Warehouse | undefined {
    return this.repository.getWarehouse(id);
  }

  /**
   * Get stock for warehouse
   */
  getWarehouseStock(warehouseId: string): WarehouseStock[] {
    return this.repository.getWarehouseStock(warehouseId);
  }

  /**
   * Get product stock across all warehouses
   */
  getProductStockAcrossWarehouses(productId: string): WarehouseStock[] {
    return this.repository.getProductStock(productId);
  }

  /**
   * Check stock availability
   */
  checkAvailability(
    warehouseId: string,
    productId: string,
    quantity: number
  ): { available: boolean; current: number; message?: string } {
    const stocks = this.repository.getWarehouseStock(warehouseId);
    const stock = stocks.find(s => s.product_id === productId);

    if (!stock) {
      return { available: false, current: 0, message: 'Ürün stokta yok' };
    }

    if (stock.available < quantity) {
      return { 
        available: false, 
        current: stock.available, 
        message: `Yetersiz stok. Mevcut: ${stock.available}` 
      };
    }

    return { available: true, current: stock.available };
  }

  /**
   * Create transfer
   */
  async createTransfer(
    fromWarehouseId: string,
    toWarehouseId: string,
    items: TransferItem[],
    createdBy: string,
    notes?: string
  ): Promise<{ success: boolean; transfer?: StockTransfer; message?: string }> {
    // Validate warehouses
    const fromWarehouse = this.repository.getWarehouse(fromWarehouseId);
    const toWarehouse = this.repository.getWarehouse(toWarehouseId);

    if (!fromWarehouse || !toWarehouse) {
      return { success: false, message: 'Geçersiz depo' };
    }

    // Check stock availability
    for (const item of items) {
      const check = this.checkAvailability(fromWarehouseId, item.product_id, item.quantity);
      if (!check.available) {
        return { success: false, message: `${item.product_name}: ${check.message}` };
      }
    }

    // Calculate total
    const totalValue = items.reduce((sum, item) => sum + item.line_total, 0);

    // Determine initial status
    const requiresApproval = 
      !fromWarehouse.settings.auto_approve_transfers &&
      totalValue > fromWarehouse.settings.require_approval_above;

    const status: TransferStatus = requiresApproval ? 'PENDING_APPROVAL' : 'APPROVED';

    // Create transfer
    const transfer: StockTransfer = {
      id: `tf-${Date.now()}`,
      transfer_no: `TRF-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      status,
      items,
      total_value: totalValue,
      notes,
      created_by: createdBy,
      created_at: new Date().toISOString()
    };

    // If auto-approved, process immediately
    if (status === 'APPROVED') {
      await this.processTransfer(transfer.id);
    }

    this.repository.saveTransfer(transfer);

    return { success: true, transfer };
  }

  /**
   * Approve transfer
   */
  async approveTransfer(
    transferId: string,
    approvedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    const transfer = this.repository.getTransfer(transferId);

    if (!transfer) {
      return { success: false, message: 'Transfer bulunamadı' };
    }

    const state = TransferStateFactory.getState(transfer.status);

    if (!state.canApprove()) {
      return { success: false, message: 'Transfer onaylanamaz durumda' };
    }

    transfer.status = 'APPROVED';
    transfer.approved_by = approvedBy;
    transfer.approved_at = new Date().toISOString();

    this.repository.saveTransfer(transfer);

    return { success: true, message: 'Transfer onaylandı' };
  }

  /**
   * Process transfer (move stock)
   */
  async processTransfer(transferId: string): Promise<{ success: boolean; message?: string }> {
    const transfer = this.repository.getTransfer(transferId);

    if (!transfer) {
      return { success: false, message: 'Transfer bulunamadı' };
    }

    const state = TransferStateFactory.getState(transfer.status);

    if (!state.canComplete()) {
      return { success: false, message: 'Transfer tamamlanamaz durumda' };
    }

    // Mark as in transit
    transfer.status = 'IN_TRANSIT';
    this.repository.saveTransfer(transfer);

    // Process each item
    for (const item of transfer.items) {
      // Decrease from source
      this.repository.updateStock(
        transfer.from_warehouse_id,
        item.product_id,
        -item.quantity
      );

      // Record movement OUT
      this.repository.addMovement({
        id: `mov-${Date.now()}-${Math.random()}`,
        warehouse_id: transfer.from_warehouse_id,
        product_id: item.product_id,
        movement_type: 'TRANSFER_OUT',
        quantity: -item.quantity,
        reference_type: 'TRANSFER',
        reference_id: transfer.id,
        notes: `Transfer to ${transfer.to_warehouse_id}`,
        created_by: transfer.created_by,
        created_at: new Date().toISOString()
      });

      // Increase to destination
      this.repository.updateStock(
        transfer.to_warehouse_id,
        item.product_id,
        item.quantity
      );

      // Record movement IN
      this.repository.addMovement({
        id: `mov-${Date.now()}-${Math.random()}`,
        warehouse_id: transfer.to_warehouse_id,
        product_id: item.product_id,
        movement_type: 'TRANSFER_IN',
        quantity: item.quantity,
        reference_type: 'TRANSFER',
        reference_id: transfer.id,
        notes: `Transfer from ${transfer.from_warehouse_id}`,
        created_by: transfer.created_by,
        created_at: new Date().toISOString()
      });
    }

    // Mark as completed
    transfer.status = 'COMPLETED';
    transfer.completed_at = new Date().toISOString();
    this.repository.saveTransfer(transfer);

    return { success: true, message: 'Transfer tamamlandı' };
  }

  /**
   * Cancel transfer
   */
  async cancelTransfer(
    transferId: string,
    cancelledBy: string,
    reason?: string
  ): Promise<{ success: boolean; message?: string }> {
    const transfer = this.repository.getTransfer(transferId);

    if (!transfer) {
      return { success: false, message: 'Transfer bulunamadı' };
    }

    const state = TransferStateFactory.getState(transfer.status);

    if (!state.canCancel()) {
      return { success: false, message: 'Transfer iptal edilemez' };
    }

    transfer.status = 'CANCELLED';
    transfer.notes = (transfer.notes || '') + `\nİptal edildi: ${reason}`;
    this.repository.saveTransfer(transfer);

    return { success: true, message: 'Transfer iptal edildi' };
  }

  /**
   * Get transfers
   */
  getTransfers(warehouseId?: string): StockTransfer[] {
    return this.repository.getTransfers(warehouseId);
  }

  /**
   * Get stock movements
   */
  getMovements(warehouseId?: string, productId?: string): StockMovement[] {
    return this.repository.getMovements(warehouseId, productId);
  }

  /**
   * Get transfer state info
   */
  getTransferStateInfo(status: TransferStatus): {
    canEdit: boolean;
    canApprove: boolean;
    canCancel: boolean;
    canComplete: boolean;
    nextStates: TransferStatus[];
  } {
    const state = TransferStateFactory.getState(status);
    return {
      canEdit: state.canEdit(),
      canApprove: state.canApprove(),
      canCancel: state.canCancel(),
      canComplete: state.canComplete(),
      nextStates: state.nextStates()
    };
  }

  /**
   * Stock adjustment (manuel düzeltme)
   */
  async adjustStock(
    warehouseId: string,
    productId: string,
    quantity: number,
    reason: string,
    adjustedBy: string
  ): Promise<{ success: boolean; message?: string }> {
    const warehouse = this.repository.getWarehouse(warehouseId);

    if (!warehouse) {
      return { success: false, message: 'Geçersiz depo' };
    }

    this.repository.updateStock(warehouseId, productId, quantity);

    this.repository.addMovement({
      id: `mov-${Date.now()}`,
      warehouse_id: warehouseId,
      product_id: productId,
      movement_type: 'ADJUST',
      quantity,
      reference_type: 'ADJUSTMENT',
      notes: reason,
      created_by: adjustedBy,
      created_at: new Date().toISOString()
    });

    return { success: true, message: 'Stok düzeltmesi yapıldı' };
  }
}

// Singleton instance
export const warehouseService = new WarehouseService();

// Export types
export type { Warehouse, WarehouseStock, StockTransfer, TransferItem, StockMovement };

