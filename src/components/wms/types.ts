// Enterprise Warehouse Management System - Type Definitions

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  country: string;
  totalArea: number; // m²
  usableArea: number; // m²
  zones: Zone[];
  isActive: boolean;
  manager: string;
  contactPhone: string;
  type: 'main' | 'regional' | 'hub' | 'cross_dock';
  coordinates?: { lat: number; lng: number };
  workingHours?: { start: string; end: string };
  created_at: string;
  updated_at: string;
}

export interface Zone {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: 'receiving' | 'storage' | 'picking' | 'packing' | 'shipping' | 'quarantine' | 'returns';
  floor: number;
  aisles: Aisle[];
  temperature?: 'ambient' | 'chilled' | 'frozen';
  capacity: number;
  currentOccupancy: number;
  isActive: boolean;
}

export interface Aisle {
  id: string;
  zoneId: string;
  code: string;
  name: string;
  shelves: Shelf[];
  width: number; // cm
  length: number; // cm
  pickingDirection?: 'one_way' | 'two_way';
}

export interface Shelf {
  id: string;
  aisleId: string;
  code: string;
  level: number; // Raf seviyesi (1=en alt, n=en üst)
  side: 'A' | 'B'; // Koridorun hangi tarafı
  bins: Bin[];
  maxWeight: number; // kg
  maxVolume: number; // m³
  position: { x: number; y: number; z: number };
}

export interface Bin {
  id: string;
  shelfId: string;
  code: string; // Örn: "A01-02-03-B" (Koridor-Raf-Seviye-Taraf)
  barcode?: string;
  qrCode?: string;
  width: number; // cm
  height: number; // cm
  depth: number; // cm
  maxWeight: number; // kg
  currentWeight: number; // kg
  isEmpty: boolean;
  stockItems: StockItem[];
  status: 'available' | 'occupied' | 'reserved' | 'blocked' | 'damaged';
  lastPickedAt?: string;
  lastReplenishedAt?: string;
}

export interface StockItem {
  id: string;
  binId: string;
  productId: string;
  productCode: string;
  productName: string;
  productBarcode?: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  serialNumbers?: string[];
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  receivedDate: string;
  supplierId?: string;
  supplierName?: string;
  costPrice: number;
  sellingPrice: number;
  status: 'available' | 'reserved' | 'quarantine' | 'damaged' | 'expired';
  reservedQuantity: number;
  pickingPriority?: 'FIFO' | 'LIFO' | 'FEFO' | 'MANUAL';
  weight?: number; // kg
  volume?: number; // m³
  isPicked?: boolean;
  isQCPassed?: boolean;
  qcNotes?: string;
}

export interface Product {
  id: string;
  code: string;
  barcode: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  category: string;
  subcategory?: string;
  brand?: string;
  supplier?: string;
  unit: string;
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  leadTime: number; // days
  costPrice: number;
  sellingPrice: number;
  weight?: number; // kg per unit
  volume?: number; // m³ per unit
  dimensions?: { width: number; height: number; depth: number }; // cm
  hasSerialNumber: boolean;
  hasLotNumber: boolean;
  hasBatchNumber: boolean;
  hasExpiryDate: boolean;
  shelfLife?: number; // days
  storageType?: 'ambient' | 'chilled' | 'frozen' | 'hazardous';
  abcClass?: 'A' | 'B' | 'C';
  xyzClass?: 'X' | 'Y' | 'Z';
  isActive: boolean;
  imageUrl?: string;
  notes?: string;
}

export interface GoodsReceiving {
  id: string;
  receiptNumber: string;
  warehouseId: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderNumber?: string;
  invoiceNumber?: string;
  receivedDate: string;
  receivedBy: string;
  items: ReceivingItem[];
  totalQuantity: number;
  totalValue: number;
  status: 'pending' | 'in_progress' | 'qc_check' | 'completed' | 'rejected';
  qcStatus?: 'passed' | 'failed' | 'partial';
  qcNotes?: string;
  qcBy?: string;
  qcDate?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  attachments?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReceivingItem {
  id: string;
  receivingId: string;
  productId: string;
  productCode: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  unit: string;
  lotNumber?: string;
  batchNumber?: string;
  serialNumbers?: string[];
  manufacturingDate?: string;
  expiryDate?: string;
  costPrice: number;
  totalValue: number;
  assignedBinId?: string;
  assignedBinCode?: string;
  qcStatus?: 'passed' | 'failed' | 'pending';
  qcNotes?: string;
  damageType?: string;
  damageNotes?: string;
}

export interface GoodsIssue {
  id: string;
  issueNumber: string;
  warehouseId: string;
  type: 'sale' | 'transfer' | 'return' | 'scrap' | 'adjustment';
  customerId?: string;
  customerName?: string;
  destinationWarehouseId?: string;
  destinationWarehouseName?: string;
  salesOrderNumber?: string;
  issueDate: string;
  issuedBy: string;
  pickedBy?: string;
  packedBy?: string;
  shippedBy?: string;
  items: IssueItem[];
  totalQuantity: number;
  totalValue: number;
  status: 'pending' | 'picking' | 'picked' | 'packing' | 'packed' | 'shipped' | 'completed' | 'cancelled';
  pickingMethod?: 'single_order' | 'batch' | 'wave' | 'zone';
  pickingStartTime?: string;
  pickingEndTime?: string;
  packingStartTime?: string;
  packingEndTime?: string;
  shippingDate?: string;
  trackingNumber?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface IssueItem {
  id: string;
  issueId: string;
  productId: string;
  productCode: string;
  productName: string;
  requestedQuantity: number;
  pickedQuantity: number;
  unit: string;
  lotNumber?: string;
  batchNumber?: string;
  serialNumbers?: string[];
  fromBinId?: string;
  fromBinCode?: string;
  sellingPrice: number;
  costPrice: number;
  totalValue: number;
  isPicked: boolean;
  pickedAt?: string;
  pickedBy?: string;
  pickingSequence?: number;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  transferDate: string;
  requestedBy: string;
  approvedBy?: string;
  items: TransferItem[];
  totalQuantity: number;
  totalValue: number;
  status: 'pending' | 'approved' | 'rejected' | 'in_transit' | 'received' | 'completed';
  dispatchDate?: string;
  expectedArrivalDate?: string;
  actualArrivalDate?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TransferItem {
  id: string;
  transferId: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  batchNumber?: string;
  serialNumbers?: string[];
  fromBinId?: string;
  fromBinCode?: string;
  toBinId?: string;
  toBinCode?: string;
  costPrice: number;
  totalValue: number;
}

export interface StockCounting {
  id: string;
  countingNumber: string;
  warehouseId: string;
  warehouseName: string;
  type: 'full' | 'cycle' | 'spot' | 'bin';
  scheduledDate: string;
  completedDate?: string;
  countedBy: string[];
  verifiedBy?: string;
  zones?: string[];
  aisles?: string[];
  bins?: string[];
  items: CountingItem[];
  totalItems: number;
  countedItems: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'verified' | 'adjustments_made';
  varianceValue: number;
  accuracyPercentage: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CountingItem {
  id: string;
  countingId: string;
  productId: string;
  productCode: string;
  productName: string;
  binId: string;
  binCode: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  variancePercentage: number;
  unit: string;
  lotNumber?: string;
  serialNumbers?: string[];
  countedBy?: string;
  countedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  adjustmentMade: boolean;
  adjustmentReason?: string;
  notes?: string;
}

export interface PickingTask {
  id: string;
  taskNumber: string;
  warehouseId: string;
  issueId: string;
  issueNumber: string;
  assignedTo: string;
  assignedAt: string;
  startedAt?: string;
  completedAt?: string;
  items: PickingTaskItem[];
  pickingMethod: 'single_order' | 'batch' | 'wave' | 'zone';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'assigned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
  optimizedRoute?: string[];
  estimatedTime?: number; // minutes
  actualTime?: number; // minutes
  distance?: number; // meters
  notes?: string;
}

export interface PickingTaskItem {
  id: string;
  taskId: string;
  productId: string;
  productCode: string;
  productName: string;
  productBarcode?: string;
  quantity: number;
  pickedQuantity: number;
  unit: string;
  binId: string;
  binCode: string;
  sequence: number; // Picking sırası (optimizasyon sonucu)
  isPicked: boolean;
  pickedAt?: string;
  lotNumber?: string;
  serialNumbers?: string[];
}

export interface WarehouseKPI {
  date: string;
  warehouseId: string;

  // Stok Metrikleri
  totalStock: number;
  stockValue: number;
  stockAccuracy: number;
  turnoverRate: number;
  daysOfInventory: number;
  deadStock: number;
  slowMovingStock: number;
  fastMovingStock: number;

  // Operasyon Metrikleri
  receivingThroughput: number; // units/day
  shippingThroughput: number; // units/day
  orderFulfillmentRate: number; // %
  onTimeShipmentRate: number; // %
  perfectOrderRate: number; // %
  pickingAccuracy: number; // %
  packingAccuracy: number; // %

  // Kapasite Metrikleri
  spaceUtilization: number; // %
  cubeUtilization: number; // %
  palletPositions: number;
  palletPositionsUsed: number;

  // Verimlilik Metrikleri
  linesPerHour: number;
  unitsPerHour: number;
  costPerOrder: number;
  laborUtilization: number; // %

  // Kalite Metrikleri
  damageRate: number; // %
  returnRate: number; // %
  cycleCountAccuracy: number; // %
  inventoryAdjustmentRate: number; // %
}

export interface Alert {
  id: string;
  type: 'stock_out' | 'low_stock' | 'expiring_soon' | 'expired' | 'overstock' | 'bin_capacity' | 'damage' | 'quality_issue';
  severity: 'info' | 'warning' | 'critical';
  warehouseId: string;
  warehouseName: string;
  productId?: string;
  productCode?: string;
  productName?: string;
  binId?: string;
  binCode?: string;
  message: string;
  messageAr?: string;
  messageEn?: string;
  quantity?: number;
  threshold?: number;
  expiryDate?: string;
  daysUntilExpiry?: number;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  resolvedNotes?: string;
  created_at: string;
}

export interface StockMovement {
  id: string;
  warehouseId: string;
  productId: string;
  productCode: string;
  productName: string;
  type: 'receiving' | 'issue' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'count_adjustment' | 'return' | 'scrap';
  fromBinId?: string;
  fromBinCode?: string;
  toBinId?: string;
  toBinCode?: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  serialNumbers?: string[];
  referenceType?: string; // 'goods_receiving', 'goods_issue', 'transfer', etc.
  referenceId?: string;
  referenceNumber?: string;
  performedBy: string;
  performedAt: string;
  notes?: string;
  costPrice: number;
  totalValue: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface DashboardStats {
  totalWarehouses: number;
  activeWarehouses: number;
  totalProducts: number;
  totalStockValue: number;
  totalStockItems: number;

  todayReceiving: {
    count: number;
    quantity: number;
    value: number;
  };

  todayShipping: {
    count: number;
    quantity: number;
    value: number;
  };

  todayTransfers: {
    count: number;
    quantity: number;
  };

  alerts: {
    critical: number;
    warning: number;
    info: number;
  };

  picking: {
    pending: number;
    inProgress: number;
    completed: number;
  };

  stockAccuracy: number;
  spaceUtilization: number;
  orderFulfillmentRate: number;
}

