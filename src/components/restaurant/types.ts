export type TableStatus = 'empty' | 'occupied' | 'kitchen' | 'served' | 'billing' | 'cleaning' | 'reserved';
export type OrderItemStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
export type CourseType = 'başlangıç' | 'ara sıcak' | 'ana yemek' | 'tatlı' | 'içecek' | 'meyve';
export type KitchenStatus = 'new' | 'cooking' | 'ready';

export interface MenuItem {
    id: string;
    name: string;
    price: number;
    category: string;
    image?: string;
    color?: string;
    options?: MenuItemOption[];
    preparationTime?: number;
}

export interface MenuItemOption {
    id: string;
    name: string;
    price: number;
}

export interface OrderItem {
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    price: number;
    status: OrderItemStatus;
    options?: string;
    notes?: string;
    course?: CourseType;
    isServed?: boolean;
    serveTime?: string;
    isVoid?: boolean;
    voidReason?: string;
    isComplementary?: boolean;
    preparationTime?: number;
}

export interface MergedOrderRef {
    orderId: string;
    faturaNo: string;
    tableId: string;
    tableNumber: string;
}

export interface Table {
    id: string;
    number: string;
    seats: number;
    status: TableStatus;
    floorId: string;
    location?: string;
    orders: OrderItem[];
    startTime?: string;
    waiter?: string;
    staffId?: string;
    total?: number;
    isLarge?: boolean;
    /** DB order ID for the currently open rest_orders row */
    activeOrderId?: string;
    /** Invoice/fatura code, e.g. RES-2026-00001 */
    faturaNo?: string;
    /** Orders merged into this table (each keeps its own fatura code in DB) */
    mergedOrders?: MergedOrderRef[];
    customerId?: string;
    customerName?: string;
    lockedByStaffId?: string;
    lockedByStaffName?: string;
    lockedAt?: string;
}

export interface KitchenOrder {
    id: string;
    tableId: string;
    tableName: string;
    waiter: string;
    time: string;
    elapsed: number;
    items: OrderItem[];
    status: KitchenStatus;
}
export interface RecipeIngredient {
    id: string;
    materialId?: string;
    materialName: string;
    quantity: number;
    unit: string;
    cost: number;
}

export interface Recipe {
    id?: string;
    menuItemId: string;
    menuItemName: string;
    ingredients: RecipeIngredient[];
    totalCost: number;
    wastagePercent?: number;
}

export interface Region {
    id: string;
    name: string;
    order: number;
}

export interface PrinterRouting {
    id: string;
    categoryId: string;
    printerId: string;
    printerName: string;
    printerType: 'thermal' | 'standard';
    connectionType: 'network' | 'usb' | 'serial' | 'system';
    address?: string;
}

export interface PrinterProfile {
    id: string;
    name: string;
    type: 'thermal' | 'standard';
    connection: 'usb' | 'network' | 'bluetooth' | 'system';
    status: 'online' | 'offline';
    lastUsed?: string;
    systemName?: string;
}

export interface Staff {
    id: string;
    name: string;
    role: string;
    pin: string;
    isActive: boolean;
}

export interface LoginResult {
    success: boolean;
    staff?: Staff;
    error?: string;
}

export interface Reservation {
    id: string;
    customerId?: string;
    customerName: string;
    phone: string;
    reservationDate: string; // ISO date string
    reservationTime: string; // "HH:mm"
    guestCount: number;
    tableId?: string;
    tableName?: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'seated' | 'noshow';
    note?: string;
    createdAt?: string;
    updatedAt?: string;
}


