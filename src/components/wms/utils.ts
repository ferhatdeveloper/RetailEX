// Enterprise Warehouse Management System - Utility Functions

import type { Bin, StockItem, PickingTaskItem } from './types';

/**
 * Format currency in Iraqi Dinar (IQD) with Turkish decimal system
 * Example: 20.000,50 IQD
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value) + ' IQD';
};

/**
 * Format number with Turkish decimal system
 * Example: 20.000
 */
export const formatNumber = (value: number, decimals: number = 0): string => {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

/**
 * Format percentage
 * Example: 85,50%
 */
export const formatPercent = (value: number): string => {
  return formatNumber(value, 2) + '%';
};

/**
 * Format date in Turkish locale
 */
export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Format datetime in Turkish locale
 */
export const formatDateTime = (date: string | Date): string => {
  return new Date(date).toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Calculate days until expiry
 */
export const getDaysUntilExpiry = (expiryDate: string): number => {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Check if product is expired
 */
export const isExpired = (expiryDate: string): boolean => {
  return getDaysUntilExpiry(expiryDate) < 0;
};

/**
 * Check if product is expiring soon (within threshold days)
 */
export const isExpiringSoon = (expiryDate: string, thresholdDays: number = 30): boolean => {
  const daysUntil = getDaysUntilExpiry(expiryDate);
  return daysUntil >= 0 && daysUntil <= thresholdDays;
};

/**
 * Calculate bin occupancy percentage
 */
export const calculateBinOccupancy = (bin: Bin): number => {
  if (bin.isEmpty) return 0;
  return (bin.currentWeight / bin.maxWeight) * 100;
};

/**
 * Calculate total stock value
 */
export const calculateStockValue = (items: StockItem[]): number => {
  return items.reduce((total, item) => {
    return total + (item.quantity * item.costPrice);
  }, 0);
};

/**
 * Calculate ABC class based on value
 * A class: Top 80% of value
 * B class: Next 15% of value
 * C class: Last 5% of value
 */
export const calculateABCClass = (
  itemValue: number,
  totalValue: number
): 'A' | 'B' | 'C' => {
  const percentage = (itemValue / totalValue) * 100;
  if (percentage >= 80) return 'A';
  if (percentage >= 15) return 'B';
  return 'C';
};

/**
 * Calculate stock turnover rate
 * Turnover = Cost of Goods Sold / Average Inventory Value
 */
export const calculateTurnoverRate = (
  soldValue: number,
  avgInventoryValue: number
): number => {
  if (avgInventoryValue === 0) return 0;
  return soldValue / avgInventoryValue;
};

/**
 * Calculate days of inventory
 * DOI = (Average Inventory / Cost of Goods Sold) × 365
 */
export const calculateDaysOfInventory = (
  avgInventory: number,
  costOfGoodsSold: number
): number => {
  if (costOfGoodsSold === 0) return 0;
  return (avgInventory / costOfGoodsSold) * 365;
};

/**
 * Generate unique bin code
 * Format: {aisleCode}-{shelfCode}-{level}-{side}
 * Example: A01-R02-03-B
 */
export const generateBinCode = (
  aisleCode: string,
  shelfCode: string,
  level: number,
  side: 'A' | 'B'
): string => {
  return `${aisleCode}-${shelfCode}-${String(level).padStart(2, '0')}-${side}`;
};

/**
 * Parse bin code to components
 */
export const parseBinCode = (binCode: string): {
  aisleCode: string;
  shelfCode: string;
  level: number;
  side: 'A' | 'B';
} | null => {
  const parts = binCode.split('-');
  if (parts.length !== 4) return null;

  return {
    aisleCode: parts[0],
    shelfCode: parts[1],
    level: parseInt(parts[2]),
    side: parts[3] as 'A' | 'B'
  };
};

/**
 * Generate barcode check digit (EAN-13)
 */
export const generateBarcodeCheckDigit = (barcode: string): string => {
  const digits = barcode.split('').map(Number);
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return barcode + checkDigit;
};

/**
 * Validate barcode check digit
 */
export const validateBarcode = (barcode: string): boolean => {
  if (barcode.length !== 13) return false;

  const mainDigits = barcode.slice(0, -1);
  const checkDigit = barcode.slice(-1);

  return generateBarcodeCheckDigit(mainDigits).slice(-1) === checkDigit;
};

/**
 * Optimize picking route using nearest neighbor algorithm
 * Returns optimized sequence of bin locations
 */
export const optimizePickingRoute = (
  items: PickingTaskItem[],
  startPosition: { x: number; y: number } = { x: 0, y: 0 }
): PickingTaskItem[] => {
  if (items.length === 0) return [];

  const unvisited = [...items];
  const route: PickingTaskItem[] = [];
  let currentPos = startPosition;

  while (unvisited.length > 0) {
    // Find nearest bin
    let nearestIndex = 0;
    let minDistance = Infinity;

    unvisited.forEach((item, index) => {
      // Parse bin code to get position (simplified)
      const binParts = parseBinCode(item.binCode);
      if (!binParts) return;

      // Simple distance calculation (Manhattan distance)
      const distance = Math.abs(parseInt(binParts.aisleCode.slice(1)) - currentPos.x) +
        Math.abs(binParts.level - currentPos.y);

      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    const nextItem = unvisited.splice(nearestIndex, 1)[0];
    route.push({
      ...nextItem,
      sequence: route.length + 1
    });

    // Update current position
    const binParts = parseBinCode(nextItem.binCode);
    if (binParts) {
      currentPos = {
        x: parseInt(binParts.aisleCode.slice(1)),
        y: binParts.level
      };
    }
  }

  return route;
};

/**
 * Calculate estimated picking time based on items and distance
 * @param itemCount Number of items to pick
 * @param distance Total distance in meters
 * @returns Estimated time in minutes
 */
export const estimatePickingTime = (itemCount: number, distance: number): number => {
  const PICK_TIME_PER_ITEM = 0.5; // minutes
  const WALK_SPEED = 80; // meters per minute

  const pickTime = itemCount * PICK_TIME_PER_ITEM;
  const walkTime = distance / WALK_SPEED;

  return Math.ceil(pickTime + walkTime);
};

/**
 * Calculate storage utilization percentage
 */
export const calculateStorageUtilization = (
  usedCapacity: number,
  totalCapacity: number
): number => {
  if (totalCapacity === 0) return 0;
  return (usedCapacity / totalCapacity) * 100;
};

/**
 * Find optimal bin for product based on FIFO/LIFO/FEFO strategy
 */
export const findOptimalBin = (
  bins: Bin[],
  productId: string,
  strategy: 'FIFO' | 'LIFO' | 'FEFO' = 'FIFO'
): Bin | null => {
  // Filter bins that have the product
  const binsWithProduct = bins.filter(bin =>
    bin.stockItems.some(item => item.productId === productId && item.quantity > 0)
  );

  if (binsWithProduct.length === 0) return null;

  switch (strategy) {
    case 'FIFO': // First In, First Out - oldest first
      return binsWithProduct.sort((a, b) => {
        const aDate = a.stockItems[0]?.receivedDate || '';
        const bDate = b.stockItems[0]?.receivedDate || '';
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      })[0];

    case 'LIFO': // Last In, First Out - newest first
      return binsWithProduct.sort((a, b) => {
        const aDate = a.stockItems[0]?.receivedDate || '';
        const bDate = b.stockItems[0]?.receivedDate || '';
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      })[0];

    case 'FEFO': // First Expired, First Out - earliest expiry first
      return binsWithProduct.sort((a, b) => {
        const aExpiry = a.stockItems[0]?.expiryDate || '9999-12-31';
        const bExpiry = b.stockItems[0]?.expiryDate || '9999-12-31';
        return new Date(aExpiry).getTime() - new Date(bExpiry).getTime();
      })[0];

    default:
      return binsWithProduct[0];
  }
};

/**
 * Generate QR code data for bin
 */
export const generateBinQRData = (bin: Bin): string => {
  return JSON.stringify({
    type: 'bin',
    id: bin.id,
    code: bin.code,
    barcode: bin.barcode,
    status: bin.status
  });
};

/**
 * Generate QR code data for product
 */
export const generateProductQRData = (
  productId: string,
  productCode: string,
  lotNumber?: string,
  serialNumber?: string
): string => {
  return JSON.stringify({
    type: 'product',
    id: productId,
    code: productCode,
    lot: lotNumber,
    serial: serialNumber
  });
};

/**
 * Calculate reorder quantity based on min/max levels and current stock
 */
export const calculateReorderQuantity = (
  currentStock: number,
  minStock: number,
  maxStock: number,
  reorderPoint: number
): number => {
  if (currentStock > reorderPoint) return 0;
  return maxStock - currentStock;
};

/**
 * Check if product needs reordering
 */
export const needsReorder = (
  currentStock: number,
  reorderPoint: number
): boolean => {
  return currentStock <= reorderPoint;
};

/**
 * Calculate variance percentage
 */
export const calculateVariance = (
  systemQuantity: number,
  countedQuantity: number
): number => {
  if (systemQuantity === 0) return 0;
  return ((countedQuantity - systemQuantity) / systemQuantity) * 100;
};

/**
 * Get alert severity based on variance
 */
export const getVarianceSeverity = (
  variance: number
): 'info' | 'warning' | 'critical' => {
  const absVariance = Math.abs(variance);
  if (absVariance > 10) return 'critical';
  if (absVariance > 5) return 'warning';
  return 'info';
};

/**
 * Format weight
 */
export const formatWeight = (kg: number): string => {
  if (kg < 1) {
    return formatNumber(kg * 1000, 0) + ' g';
  }
  if (kg >= 1000) {
    return formatNumber(kg / 1000, 2) + ' ton';
  }
  return formatNumber(kg, 2) + ' kg';
};

/**
 * Format volume
 */
export const formatVolume = (m3: number): string => {
  if (m3 < 1) {
    return formatNumber(m3 * 1000, 0) + ' L';
  }
  return formatNumber(m3, 2) + ' m³';
};

/**
 * Generate document number with prefix and sequence
 * Example: GR-2024-00001, GI-2024-00001
 */
export const generateDocumentNumber = (
  prefix: string,
  sequence: number,
  year?: number
): string => {
  const currentYear = year || new Date().getFullYear();
  const paddedSequence = String(sequence).padStart(5, '0');
  return `${prefix}-${currentYear}-${paddedSequence}`;
};

/**
 * Calculate order fulfillment rate
 */
export const calculateFulfillmentRate = (
  totalOrders: number,
  fulfilledOrders: number
): number => {
  if (totalOrders === 0) return 0;
  return (fulfilledOrders / totalOrders) * 100;
};

/**
 * Get status color for UI
 */
export const getStatusColor = (status: string): string => {
  const statusColors: Record<string, string> = {
    // General
    'active': 'green',
    'inactive': 'gray',
    'available': 'green',
    'occupied': 'blue',
    'reserved': 'yellow',
    'blocked': 'red',
    'damaged': 'red',

    // Goods Receiving
    'pending': 'yellow',
    'in_progress': 'blue',
    'qc_check': 'purple',
    'completed': 'green',
    'rejected': 'red',

    // Goods Issue
    'picking': 'blue',
    'picked': 'purple',
    'packing': 'blue',
    'packed': 'purple',
    'shipped': 'green',
    'cancelled': 'red',

    // Transfer
    'approved': 'green',
    'in_transit': 'blue',
    'received': 'green',

    // Stock
    'quarantine': 'orange',
    'expired': 'red',

    // Alerts
    'info': 'blue',
    'warning': 'yellow',
    'critical': 'red'
  };

  return statusColors[status] || 'gray';
};

/**
 * Export data to CSV
 */
export const exportToCSV = (data: any[], filename: string): void => {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

