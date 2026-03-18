import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    Table, KitchenOrder, MenuItem, Recipe, OrderItem,
    Region, PrinterRouting, CourseType, PrinterProfile,
    Staff, LoginResult, Reservation, MergedOrderRef
} from '../types';
import { useProductStore } from '../../../store/useProductStore';
import { useSaleStore } from '../../../store/useSaleStore';
import { useCustomerStore } from '../../../store/useCustomerStore';
import { RestaurantService } from '../../../services/restaurant';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { categoryAPI, type Category } from '../../../services/api';
import { v4 as uuidv4 } from 'uuid';
import { convertUnit } from '../utils/unitConverter';

interface RestaurantState {
    tables: Table[];
    menu: MenuItem[];
    recipes: Recipe[];
    regions: Region[];
    printerRoutes: PrinterRouting[];
    printerProfiles: PrinterProfile[];
    commonPrinterId?: string;
    categories: Category[];
    kitchenOrders: KitchenOrder[];
    currentStaff: Staff | null;
    staffList: Staff[];
    isRegisterOpen: boolean;
    registerOpeningCash: number;
    registerOpeningNote: string;
    workDayDate: string | null;
    isDayActive: boolean;
    systemPrinters: any[];
    reservations: Reservation[];

    // Table Actions
    openTable: (tableId: string, waiter: string) => Promise<void>;
    addItemToTable: (tableId: string, item: MenuItem, quantity: number, options?: string) => Promise<void>;
    requestBill: (tableId: string) => Promise<void>;
    closeBill: (tableId: string, paymentData: any) => Promise<void>;
    markAsClean: (tableId: string) => Promise<void>;
    /** Masayı servisten çıkarıp temizlik aşamasına alır (served → cleaning) */
    markAsCleaning: (tableId: string) => Promise<void>;
    addTable: (table: Omit<Table, 'orders' | 'status' | 'total'>) => Promise<void>;
    updateTable: (table: Partial<Table>, persist?: boolean) => Promise<void>;
    removeTable: (tableId: string) => Promise<void>;
    mergeTables: (sourceTableId: string, targetTableId: string) => Promise<void>;
    transferTable: (sourceTableId: string, targetTableId: string) => Promise<void>;
    moveTable: (sourceTableId: string, targetTableId: string) => Promise<void>;

    // Kitchen Actions
    sendToKitchen: (tableId: string) => Promise<void>;
    markAsReady: (orderId: string) => Promise<void>;
    markAsServed: (orderId: string) => Promise<void>;

    // Recipe Actions
    updateRecipe: (recipe: Recipe) => Promise<void>;

    // Load (DB sync) Actions
    loadTables: (floorId?: string) => Promise<void>;
    /** Arka plan: sadece masa durumlarını senkronize eder; değişiklik varsa gerekirse tam yükleme yapar */
    syncTableStatuses: (floorId?: string) => Promise<void>;
    loadMenu: () => Promise<void>;
    loadCategories: () => Promise<void>;
    loadRegions: (storeId?: string) => Promise<void>;
    loadRecipes: () => Promise<void>;
    loadKitchenOrders: () => Promise<void>;

    // Region & Printer Actions
    addRegion: (region: Region, storeId: string | null) => Promise<void>;
    removeRegion: (regionId: string) => Promise<void>;
    updatePrinterRoute: (route: PrinterRouting) => void;
    removePrinterRoute: (routeId: string) => void;
    updatePrinterProfile: (profile: PrinterProfile) => void;
    removePrinterProfile: (profileId: string) => void;
    setCommonPrinter: (printerId: string | undefined) => void;
    setCustomerForTable: (tableId: string, customerId?: string, customerName?: string) => void;

    // Course & Plate Actions
    setCourseForItem: (tableId: string, itemId: string, course: CourseType) => void;
    splitOrder: (orderId: string, itemIds: string[], targetTableId?: string) => Promise<void>;
    updateOrderItemOptions: (itemId: string, options: any) => Promise<void>;

    // Phase 2: Void & Complementary
    voidOrderItem: (tableId: string, itemId: string, reason: string, voidQuantity?: number) => Promise<void>;
    markItemAsComplementary: (tableId: string, itemId: string) => Promise<void>;
    /** Tek ürünü başka masaya taşır (birleştirilmiş masada yanlış giden ürün için) */
    moveOrderItemToTable: (currentTableId: string, itemId: string, targetTableId: string) => Promise<void>;

    // Phase 3: Staff/PIN
    loginWithPin: (pin: string) => Promise<LoginResult>;
    logout: () => void;
    loadStaff: () => Promise<void>;
    addStaff: (staff: Omit<Staff, 'id'>) => Promise<void>;
    removeStaff: (staffId: string) => Promise<void>;
    setCurrentStaff: (staff: Staff) => void;

    // Phase 4: Financial
    openRegister: (openingCash: number, note: string) => void;
    closeRegister: () => void;
    loadSystemPrinters: () => Promise<void>;

    // Reservation Actions
    loadReservations: (date?: string) => Promise<void>;
    addReservation: (res: Omit<Reservation, 'id'>) => Promise<void>;
    updateReservation: (res: Reservation) => Promise<void>;
    deleteReservation: (id: string) => Promise<void>;
    updateReservationStatus: (id: string, status: Reservation['status']) => Promise<void>;
}

export const useRestaurantStore = create<RestaurantState>()(
    persist(
        (set, get) => ({
            tables: [],
            menu: [],
            recipes: [],
            regions: [],
            printerRoutes: [],
            printerProfiles: [],
            commonPrinterId: undefined,
            kitchenOrders: [],
            currentStaff: null,
            staffList: [],
            isRegisterOpen: false,
            registerOpeningCash: 0,
            registerOpeningNote: '',
            workDayDate: null,
            isDayActive: false,
            systemPrinters: [],
            reservations: [],
            categories: [],

            openTable: async (tableId, waiter) => {
                try {
                    const staffId = get().currentStaff?.id;
                    await RestaurantService.updateTableStatus(tableId, 'occupied', waiter, staffId, 0);
                    // Create DB order immediately so items can be persisted before sendToKitchen
                    const table = get().tables.find(t => t.id === tableId);
                    const dbOrder = await RestaurantService.createOrder({
                        tableId,
                        floorId: table?.floorId,
                        waiter
                    });
                    set(state => ({
                        tables: state.tables.map(t =>
                            t.id === tableId
                                ? {
                                    ...t, status: 'occupied', waiter, staffId, orders: [], total: 0,
                                    startTime: new Date().toISOString(),
                                    activeOrderId: dbOrder.id,
                                    faturaNo: dbOrder.order_no,
                                    mergedOrders: []
                                }
                                : t
                        )
                    }));
                } catch (err: any) {
                    console.error('[RestaurantStore] openTable hatası:', err);
                    throw err;
                }
            },

            addItemToTable: async (tableId, item, quantity, options) => {
                const state0 = get();
                const table = state0.tables.find(t => t.id === tableId);
                let orderId = table?.activeOrderId;

                // Create order in DB if not yet created
                if (!orderId) {
                    const dbOrder = await RestaurantService.createOrder({
                        tableId,
                        floorId: table?.floorId,
                        waiter: table?.waiter
                    });
                    orderId = dbOrder.id;
                    set(state => ({
                        tables: state.tables.map(tb =>
                            tb.id === tableId
                                ? { ...tb, activeOrderId: dbOrder.id, faturaNo: dbOrder.order_no }
                                : tb
                        )
                    }));
                }

                // Save item to DB and get back the DB-generated ID
                const dbItem = await RestaurantService.addOrderItem(orderId!, {
                    productId: item.id,
                    productName: item.name,
                    quantity,
                    unitPrice: item.price,
                    note: options,
                });

                // ✅ Immediate Stock Deduction (Recipe-based)
                try {
                    const productStore = useProductStore.getState();
                    const recipe = state0.recipes.find(r => r.menuItemId === item.id);
                    if (recipe) {
                        for (const ingredient of recipe.ingredients) {
                            if (ingredient.materialId) {
                                const prod = productStore.products.find(p => p.id === ingredient.materialId);
                                if (prod) {
                                    const deduction = convertUnit(ingredient.quantity * quantity, (ingredient.unit || 'gr').toLowerCase(), (prod.unit || 'kg').toLowerCase());
                                    await productStore.updateStock(prod.id, prod.stock - deduction);

                                    // Log Stock Movement
                                    await stockMovementAPI.create(
                                        {
                                            trcode: 1, // Sarf
                                            movement_type: 'out',
                                            description: `Restoran Satış: ${item.name}`,
                                            document_no: table?.faturaNo || `REST-${table?.number}`
                                        },
                                        [{
                                            product_id: prod.id,
                                            quantity: deduction,
                                            unit_price: prod.cost || 0,
                                            notes: `Reçeteli Satış`
                                        }]
                                    );
                                }
                            }
                        }
                    }
                } catch (stockErr) {
                    console.error('[addItemToTable] Stock deduction failed:', stockErr);
                }

                set(state => ({
                    tables: state.tables.map(t => {
                        if (t.id !== tableId) return t;
                        const newOrder: OrderItem = {
                            id: dbItem.id,         // Use DB-assigned ID for void/update ops
                            menuItemId: item.id,
                            name: item.name,
                            quantity,
                            price: item.price,
                            status: 'pending',
                            options
                        };
                        const updatedOrders = [...t.orders, newOrder];
                        const updatedTotal = updatedOrders
                            .filter(o => !o.isVoid)
                            .reduce((sum, o) => sum + o.price * o.quantity, 0);
                        return { ...t, orders: updatedOrders, total: updatedTotal };
                    })
                }));
            },

            requestBill: async (tableId) => {
                const table = get().tables.find(t => t.id === tableId);
                await RestaurantService.updateTableStatus(tableId, 'billing', table?.waiter, table?.staffId, table?.total || 0);
                set(state => ({
                    tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'billing' } : t)
                }));
            },

            sendToKitchen: async (tableId) => {
                const table = get().tables.find(t => t.id === tableId);
                if (!table) return;
                const pendingItems = table.orders.filter(o => o.status === 'pending' && !o.isVoid);
                if (pendingItems.length === 0) return;

                // Items are already saved to DB in addItemToTable — just need activeOrderId
                const dbOrderId = table.activeOrderId;
                if (!dbOrderId) return;

                try {
                    // Update pending items status to 'cooking' in DB
                    for (const item of pendingItems) {
                        await RestaurantService.updateOrderItem(item.id, { status: 'cooking' });
                    }

                    const kitchenOrderId = await RestaurantService.createKitchenOrder({
                        orderId: dbOrderId!,
                        tableNumber: table.number,
                        floorName: table.location,
                        waiter: table.waiter,
                        items: pendingItems.map(i => ({
                            orderItemId: i.id,
                            productId: i.menuItemId,
                            productName: i.name,
                            quantity: i.quantity,
                            course: i.course,
                            note: i.notes,
                        })),
                    });

                    const sentAt = new Date().toISOString();
                    const kitchenOrder: KitchenOrder = {
                        id: kitchenOrderId,
                        tableId: table.id,
                        tableName: table.number,
                        waiter: table.waiter || 'Genel',
                        time: new Date().toLocaleTimeString(),
                        elapsed: 0,
                        sentAt,
                        items: pendingItems,
                        status: 'new'
                    };
                    set(state => ({
                        kitchenOrders: [...state.kitchenOrders, kitchenOrder],
                        tables: state.tables.map(t =>
                            t.id === tableId
                                ? { ...t, status: 'kitchen', orders: t.orders.map(o => o.status === 'pending' ? { ...o, status: 'cooking' } : o) }
                                : t
                        )
                    }));
                    await RestaurantService.updateTableStatus(tableId, 'kitchen', table.waiter, table.staffId, table.total);
                } catch (error) {
                    console.error("Mutfak siparişi gönderilirken hata oluştu:", error);
                    throw error;
                }
            },

            markAsReady: async (orderId) => {
                await RestaurantService.updateKitchenOrderStatus(orderId, 'ready');
                set(state => ({ kitchenOrders: state.kitchenOrders.map(ko => ko.id === orderId ? { ...ko, status: 'ready' } : ko) }));
            },

            markAsServed: async (orderId) => {
                await RestaurantService.updateKitchenOrderStatus(orderId, 'served');
                const ko = get().kitchenOrders.find(o => o.id === orderId);
                if (!ko) return;
                set(state => ({
                    kitchenOrders: state.kitchenOrders.filter(o => o.id !== orderId),
                    tables: state.tables.map(t =>
                        t.id === ko.tableId
                            ? { ...t, status: 'served', orders: t.orders.map(o => ko.items.some(ki => ki.id === o.id) ? { ...o, status: 'served' } : o) }
                            : t
                    )
                }));
                const updatedTable = get().tables.find(t => t.id === ko.tableId);
                if (updatedTable) {
                    await RestaurantService.updateTableStatus(ko.tableId, 'served', updatedTable.waiter, updatedTable.staffId, updatedTable.total);
                }
            },

            closeBill: async (tableId, paymentData) => {
                const table = get().tables.find(t => t.id === tableId);
                if (!table) return;
                try {
                    let orderId = table.activeOrderId;
                    if (!orderId) {
                        const dbOrder = await RestaurantService.createOrder({ tableId, waiter: table.waiter });
                        orderId = dbOrder.id;
                        // Parallel insert of items
                        await Promise.all(table.orders.map(item =>
                            RestaurantService.addOrderItem(orderId as string, {
                                productId: item.menuItemId,
                                productName: item.name,
                                quantity: item.quantity,
                                unitPrice: item.price,
                                course: item.course,
                                note: item.options
                            })
                        ));
                    }
                    if (!orderId) throw new Error('Order selection failed');
                    const linkedOrderIds = (table.mergedOrders || []).map(m => m.orderId);
                    const paymentMethod = paymentData.payments?.[0]?.method || 'cash';

                    // ✅ CRITICAL: Close order + reset table status (must block payment)
                    await RestaurantService.completeTablePayment({ tableId, orderId, linkedOrderIds, paymentMethod });

                    // ✅ Update local state immediately (unblocks UI)
                    set(state => ({
                        tables: state.tables.map(t => t.id === tableId
                            ? { ...t, status: 'cleaning', orders: [], total: 0, waiter: undefined, startTime: undefined, activeOrderId: undefined, faturaNo: undefined, mergedOrders: [] }
                            : t)
                    }));

                    // 🔄 Secondary operations in background (non-blocking)
                    const tableSnapshot = { ...table };
                    Promise.resolve().then(async () => {
                        try {
                            const salesStore = useSaleStore.getState();
                            await salesStore.addSale({
                                id: uuidv4(),
                                receiptNumber: `REST-${tableSnapshot.number}-${Date.now()}`,
                                date: new Date().toISOString(),
                                total: tableSnapshot.total || 0,
                                subtotal: tableSnapshot.total || 0,
                                discount: 0,
                                items: tableSnapshot.orders.map(o => ({
                                    productId: o.menuItemId,
                                    productName: o.name,
                                    quantity: o.quantity,
                                    price: o.price,
                                    discount: 0,
                                    total: o.price * o.quantity
                                })),
                                paymentMethod,
                                status: 'completed',
                                cashier: tableSnapshot.waiter || 'Garson'
                            });
                        } catch (e) { console.error('[closeBill bg] addSale failed:', e); }

                        try {
                            if (tableSnapshot.customerId) {
                                const customerStore = useCustomerStore.getState();
                                await customerStore.updatePurchaseHistory(tableSnapshot.customerId, tableSnapshot.total || 0);
                                const accountPayments = paymentData.payments?.filter((p: any) => p.method === 'account') || [];
                                const totalAccountAmount = accountPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
                                if (totalAccountAmount > 0) await customerStore.updateBalance(tableSnapshot.customerId, totalAccountAmount);
                                const points = Math.floor((tableSnapshot.total || 0) / 100);
                                if (points > 0) await customerStore.updatePoints(tableSnapshot.customerId, points);
                            }
                        } catch (e) { console.error('[closeBill bg] customer update failed:', e); }

                        // ✅ Recipe-based stock deduction removed (now handled in addItemToTable/voidOrderItem)
                    });

                } catch (error) {
                    console.error('[RestaurantStore] closeBill error:', error);
                    throw error;
                }
            },


            addTable: async (tableData) => {
                const row = await RestaurantService.addTable({ floor_id: tableData.floorId, number: tableData.number, seats: tableData.seats, is_large: tableData.isLarge });
                set(state => ({ tables: [...state.tables, { ...tableData, id: row?.id ?? uuidv4(), status: 'empty', orders: [], total: 0 }] }));
            },

            updateTable: async (tableData, persist = false) => {
                set(state => ({ tables: state.tables.map(t => t.id === tableData.id ? { ...t, ...tableData } : t) }));
                if (persist && tableData.id) await RestaurantService.updateTable(tableData.id, tableData);
            },

            removeTable: async (tableId) => {
                await RestaurantService.deleteTable(tableId);
                set(state => ({ tables: state.tables.filter(t => t.id !== tableId) }));
            },

            mergeTables: async (sourceTableId, targetTableId) => {
                // Link source order to target table without moving items in DB
                // Each order keeps its own fatura code
                const sourceOrder = await RestaurantService.linkOrderToTable(sourceTableId, targetTableId);
                const sourceTable = get().tables.find(t => t.id === sourceTableId);

                set(state => ({
                    tables: state.tables.map(t => {
                        if (t.id === targetTableId) {
                            const mergedItems = sourceTable?.orders || [];
                            const allOrders = [...t.orders, ...mergedItems];
                            const newMergedOrders: MergedOrderRef[] = [
                                ...(t.mergedOrders || []),
                                ...(sourceOrder ? [{
                                    orderId: sourceOrder.id,
                                    faturaNo: sourceOrder.order_no,
                                    tableId: sourceTableId,
                                    tableNumber: sourceTable?.number || ''
                                }] : [])
                            ];
                            return {
                                ...t,
                                orders: allOrders,
                                total: allOrders.filter(o => !o.isVoid).reduce((sum, o) => sum + o.price * o.quantity, 0),
                                status: t.status === 'empty' ? 'occupied' : t.status,
                                mergedOrders: newMergedOrders
                            };
                        }
                        if (t.id === sourceTableId) {
                            return { ...t, status: 'empty', orders: [], total: 0, waiter: undefined, activeOrderId: undefined, faturaNo: undefined, mergedOrders: [] };
                        }
                        return t;
                    })
                }));
            },

            transferTable: async (sourceTableId, targetTableId) => {
                try {
                    await RestaurantService.transferTable(sourceTableId, targetTableId);
                    await get().loadTables(undefined);
                } catch (err) {
                    console.error('[RestaurantStore] transferTable error:', err);
                    throw err;
                }
            },

            moveTable: async (sourceTableId, targetTableId) => {
                try {
                    await RestaurantService.moveTable(sourceTableId, targetTableId);
                    // Tüm masaları yeniden yükle; sadece bir kat yüklenirse diğer katlar kaybolur
                    await get().loadTables(undefined);
                } catch (err) {
                    console.error('[RestaurantStore] moveTable error:', err);
                    throw err;
                }
            },

            updateRecipe: async (recipe) => {
                await RestaurantService.saveRecipe({ id: recipe.id, menuItemId: recipe.menuItemId, totalCost: recipe.totalCost, wastagePercent: recipe.wastagePercent, ingredients: recipe.ingredients.map(ing => ({ materialId: ing.materialId ?? '', quantity: ing.quantity, unit: ing.unit, cost: ing.cost })) });
                await get().loadRecipes();
            },

            syncTableStatuses: async (floorId) => {
                try {
                    const statuses = await RestaurantService.getTableStatuses(floorId);
                    const state = get();
                    let needsFullLoad = false;
                    const hadEmpty = new Set(state.tables.filter(t => t.status === 'empty').map(t => t.id));
                    if (statuses.length > state.tables.length) needsFullLoad = true;
                    const nextTables = state.tables.map(t => {
                        const row = statuses.find((s: any) => s.id === t.id);
                        if (!row) return t;
                        const wasEmpty = hadEmpty.has(t.id);
                        const nowEmpty = (row.status ?? 'empty') === 'empty';
                        if (wasEmpty && !nowEmpty) needsFullLoad = true;
                        return {
                            ...t,
                            status: row.status ?? t.status,
                            waiter: row.waiter ?? t.waiter,
                            total: Number(row.total ?? 0),
                            startTime: row.start_time ?? t.startTime
                        };
                    });
                    set({ tables: nextTables });
                    if (needsFullLoad) await get().loadTables(floorId);
                } catch (err) {
                    console.warn('[RestaurantStore] syncTableStatuses failed:', err);
                }
            },

            loadTables: async (floorId) => {
                const rows = await RestaurantService.getTables(floorId);
                const tablesWithOrders = await Promise.all(rows.map(async (r: any) => {
                    const baseTable: Table = {
                        id: r.id, number: r.number, seats: r.seats ?? 4,
                        status: r.status ?? 'empty', floorId: r.floor_id ?? '',
                        location: r.location, orders: [], startTime: r.start_time,
                        waiter: r.waiter, total: Number(r.total || 0), isLarge: r.is_large ?? false,
                        color: r.color ?? null,
                        faturaNo: undefined, mergedOrders: []
                    };
                    if (baseTable.status !== 'empty') {
                        const activeOrder = await RestaurantService.getActiveOrder(baseTable.id);
                        if (activeOrder) {
                            baseTable.activeOrderId = activeOrder.id;
                            baseTable.faturaNo = activeOrder.order_no;
                            const mainTableNum = (activeOrder as any).table_number ?? baseTable.number;
                            baseTable.orders = (activeOrder.items || []).map((i: any) => ({
                                id: i.id, menuItemId: i.product_id, name: i.product_name,
                                quantity: Number(i.quantity), price: Number(i.unit_price),
                                status: i.status || 'cooking', course: i.course, options: i.note,
                                isVoid: i.is_void, voidReason: i.void_reason, isComplementary: i.is_complementary,
                                sourceTableId: baseTable.id, sourceTableNumber: mainTableNum
                            }));
                        }

                        // Load linked (merged) orders — her ürüne kaynak masa etiketi
                        const linkedIds: string[] = r.linked_order_ids || [];
                        if (linkedIds.length > 0) {
                            const linkedOrders = await RestaurantService.getLinkedOrders(linkedIds);
                            const mergedRefs: MergedOrderRef[] = [];
                            for (const lo of linkedOrders) {
                                const loTableId = (lo as any).table_id ?? '';
                                const loTableNum = (lo as any).table_number ?? '';
                                mergedRefs.push({ orderId: lo.id, faturaNo: lo.order_no, tableId: loTableId, tableNumber: loTableNum });
                                const loItems = (lo.items || []).map((i: any) => ({
                                    id: i.id, menuItemId: i.product_id, name: i.product_name,
                                    quantity: Number(i.quantity), price: Number(i.unit_price),
                                    status: i.status || 'cooking', course: i.course, options: i.note,
                                    isVoid: i.is_void, voidReason: i.void_reason, isComplementary: i.is_complementary,
                                    sourceTableId: loTableId, sourceTableNumber: loTableNum
                                }));
                                baseTable.orders = [...baseTable.orders, ...loItems];
                            }
                            baseTable.mergedOrders = mergedRefs;
                        }

                        baseTable.total = baseTable.orders
                            .filter(o => !o.isVoid)
                            .reduce((sum, o) => sum + o.price * o.quantity, 0);
                    }
                    return baseTable;
                }));
                set({ tables: tablesWithOrders });
            },

            loadMenu: async () => {
                const products = useProductStore.getState().products;
                set({ menu: products.map((p: any) => ({ id: p.id, name: p.name, price: p.price ?? p.sale_price ?? 0, category: p.category ?? p.group_name ?? 'Genel', image: p.image })) });
            },

            loadCategories: async () => {
                const categories = await categoryAPI.getAll();
                set({ categories });
            },

            loadRegions: async (storeId) => {
                const rows = await RestaurantService.getFloors(storeId);
                set({ regions: rows.map((r: any) => ({ id: r.id, name: r.name, order: r.display_order ?? 0 })) });
            },

            loadRecipes: async () => {
                const rows = await RestaurantService.getRecipes();
                set({ recipes: rows.map((r: any) => ({ id: r.id, menuItemId: r.menu_item_id, menuItemName: r.menu_item_name ?? '', totalCost: Number(r.total_cost ?? 0), wastagePercent: Number(r.wastage_percent ?? 0), ingredients: (r.ingredients ?? []).map((ing: any) => ({ id: ing.id, materialId: ing.material_id, materialName: ing.material_name ?? '', quantity: Number(ing.quantity), unit: ing.unit ?? '', cost: Number(ing.cost ?? 0) })) })) });
            },

            loadKitchenOrders: async () => {
                try {
                    const rows = await RestaurantService.getActiveKitchenOrders();
                    set({ kitchenOrders: rows.map((ko: any) => {
                    const sentAt = ko.sent_at ?? null;
                    const elapsed = sentAt ? Math.floor((Date.now() - new Date(sentAt).getTime()) / 60000) : 0;
                    return { id: ko.id, tableId: ko.table_id ?? ko.order_id ?? '', tableName: ko.table_number ?? '', waiter: ko.waiter ?? '', time: sentAt ? new Date(sentAt).toLocaleTimeString() : new Date().toLocaleTimeString(), elapsed, sentAt: sentAt ?? undefined, items: (ko.items ?? []).map((i: any) => ({ id: i.id, menuItemId: i.order_item_id ?? '', name: i.product_name, quantity: Number(i.quantity), price: 0, status: i.status ?? 'cooking', course: i.course, notes: i.note, startAt: i.start_at, preparationTime: i.preparation_time, estimatedReadyAt: i.estimated_ready_at })), status: ko.status ?? 'new', estimatedReadyAt: ko.estimated_ready_at };
                }) });
                } catch (err) {
                    console.error('[RestaurantStore] loadKitchenOrders failed:', err);
                    // Hata durumunda mevcut listeyi silme; böylece aynı oturumda gönderilen siparişler kaybolmaz.
                }
            },

            addRegion: async (region, storeId) => {
                try {
                    const dbRegion = await RestaurantService.saveFloor({ store_id: storeId, name: region.name, display_order: region.order });
                    if (!dbRegion) throw new Error('Bölge kaydedilemedi — DB satır dönmedi');
                    set(state => ({ regions: [...state.regions, { id: dbRegion.id, name: dbRegion.name, order: dbRegion.display_order ?? region.order }].sort((a, b) => a.order - b.order) }));
                } catch (err: any) {
                    console.error('[RestaurantStore] addRegion hatası:', err?.message ?? String(err));
                    throw err;
                }
            },

            removeRegion: async (regionId) => {
                await RestaurantService.deleteFloor(regionId);
                set(state => ({ regions: state.regions.filter(r => r.id !== regionId) }));
            },

            updatePrinterRoute: (route) => set(state => ({ printerRoutes: state.printerRoutes.some(r => r.id === route.id) ? state.printerRoutes.map(r => r.id === route.id ? route : r) : [...state.printerRoutes, route] })),
            removePrinterRoute: (routeId) => set(state => ({ printerRoutes: state.printerRoutes.filter(r => r.id !== routeId) })),
            updatePrinterProfile: (profile) => set(state => ({ printerProfiles: state.printerProfiles.some(p => p.id === profile.id) ? state.printerProfiles.map(p => p.id === profile.id ? profile : p) : [...state.printerProfiles, profile] })),
            removePrinterProfile: (profileId) => set(state => ({ printerProfiles: state.printerProfiles.filter(p => p.id !== profileId) })),
            setCommonPrinter: (printerId) => set({ commonPrinterId: printerId }),
            setCustomerForTable: (tableId, customerId, customerName) => set(state => ({ tables: state.tables.map(t => t.id === tableId ? { ...t, customerId, customerName } : t) })),
            setCourseForItem: (tableId, itemId, course) => set(state => ({ tables: state.tables.map(t => t.id === tableId ? { ...t, orders: t.orders.map(o => o.id === itemId ? { ...o, course } : o) } : t) })),
            splitOrder: async (orderId, itemIds, targetTableId) => {
                await RestaurantService.splitOrder(orderId, itemIds, targetTableId);
                const table = get().tables.find(t => t.activeOrderId === orderId);
                if (table) await get().loadTables(table.floorId);
            },
            updateOrderItemOptions: async (itemId, options) => {
                await RestaurantService.updateOrderItemOptions(itemId, options);
                set(state => ({ tables: state.tables.map(t => ({ ...t, orders: t.orders.map(o => o.id === itemId ? { ...o, options } : o) })) }));
            },
            voidOrderItem: async (tableId, itemId, reason, voidQuantity) => {
                const state = get();
                const table = state.tables.find(t => t.id === tableId);
                const orderItem = table?.orders.find(o => o.id === itemId);
                const qtyToVoid = voidQuantity ?? orderItem?.quantity ?? 1;

                // Stok iadesi: Sadece henüz mutfağa GİTMEMİŞ (pending) kalemlerde. Mutfakta üretilmiş (cooking/ready/served)
                // ürün masadan geri gelirse stok iade edilmez — hammadde zaten kullanıldı.
                const wasNotProducedYet = orderItem?.status === 'pending';
                if (orderItem && !orderItem.isVoid && qtyToVoid > 0 && wasNotProducedYet) {
                    try {
                        const productStore = useProductStore.getState();
                        const recipe = state.recipes.find(r => r.menuItemId === orderItem.menuItemId);
                        if (recipe) {
                            for (const ingredient of recipe.ingredients) {
                                if (ingredient.materialId) {
                                    const prod = productStore.products.find(p => p.id === ingredient.materialId);
                                    if (prod) {
                                        const restoration = convertUnit(ingredient.quantity * qtyToVoid, ingredient.unit || 'gr', prod.unit || 'kg');
                                        await productStore.updateStock(prod.id, prod.stock + restoration);
                                        await stockMovementAPI.create(
                                            {
                                                trcode: 1,
                                                movement_type: 'in',
                                                description: `Sipariş İptal (İade): ${orderItem.name} x ${qtyToVoid}`,
                                                document_no: table?.faturaNo || `VOID-${table?.number}`
                                            },
                                            [{ product_id: prod.id, quantity: restoration, unit_price: prod.cost || 0, notes: `Void İptal İadesi (mutfağa gitmeden)` }]
                                        );
                                    }
                                }
                            }
                        }
                    } catch (stockErr) {
                        console.error('[voidOrderItem] Stock restoration failed:', stockErr);
                    }
                }

                await RestaurantService.voidOrderItem(itemId, reason, qtyToVoid);
                if (table) await get().loadTables(table.floorId);
            },
            markItemAsComplementary: async (tableId, itemId) => {
                await RestaurantService.markItemAsComplementary(itemId);
                const table = get().tables.find(t => t.id === tableId);
                if (table) await get().loadTables(table.floorId);
            },
            moveOrderItemToTable: async (currentTableId, itemId, targetTableId) => {
                await RestaurantService.moveOrderItemToTable(itemId, targetTableId);
                const table = get().tables.find(t => t.id === currentTableId);
                if (table) await get().loadTables(table.floorId);
            },
            loginWithPin: async (pin) => {
                const result = await RestaurantService.verifyStaffPin(pin, RestaurantService.firmNr);
                if (result.success && result.staff) set({ currentStaff: result.staff });
                return result;
            },
            logout: () => set({ currentStaff: null }),
            loadStaff: async () => {
                const staff = await RestaurantService.getStaffList(RestaurantService.firmNr);
                set({ staffList: staff });
            },
            addStaff: async (staffData) => {
                const newStaff = await RestaurantService.saveStaff(RestaurantService.firmNr, staffData);
                set(state => ({ staffList: [...state.staffList, newStaff] }));
            },
            removeStaff: async (staffId) => {
                await RestaurantService.deleteStaff(RestaurantService.firmNr, staffId);
                set(state => ({ staffList: state.staffList.filter(s => s.id !== staffId) }));
            },
            setCurrentStaff: (staff) => set({ currentStaff: staff }),
            openRegister: (cash, note) => set({ isRegisterOpen: true, registerOpeningCash: cash, registerOpeningNote: note, workDayDate: new Date().toISOString().slice(0, 10), isDayActive: true }),
            closeRegister: () => set({ isRegisterOpen: false, registerOpeningCash: 0, registerOpeningNote: '', isDayActive: false }),
            loadSystemPrinters: async () => {
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    set({ systemPrinters: await invoke('list_system_printers') });
                } catch (error) {
                    console.error('Failed to load system printers:', error);
                }
            },

            loadReservations: async (date) => set({ reservations: await RestaurantService.getReservations({ date }) }),
            addReservation: async (data) => set(state => ({ reservations: [...state.reservations, data as Reservation] })),
            updateReservation: async (data) => {
                await RestaurantService.saveReservation(data);
                set(state => ({ reservations: state.reservations.map(r => r.id === data.id ? data : r) }));
            },
            deleteReservation: async (id) => {
                await RestaurantService.deleteReservation(id);
                set(state => ({ reservations: state.reservations.filter(r => r.id !== id) }));
            },
            updateReservationStatus: async (id, status) => {
                await RestaurantService.updateReservationStatus(id, status);
                set(state => ({ reservations: state.reservations.map(r => r.id === id ? { ...r, status } : r) }));
            },

            lockTable: async (tableId: string) => {
                const staff = get().currentStaff;
                if (!staff) return false;
                const success = await RestaurantService.lockTable(tableId, staff.id, staff.name);
                if (success) {
                    set(state => ({
                        tables: state.tables.map(t => t.id === tableId ? { ...t, lockedByStaffId: staff.id, lockedByStaffName: staff.name } : t)
                    }));
                }
                return success;
            },

            unlockTable: async (tableId: string) => {
                await RestaurantService.unlockTable(tableId);
                set(state => ({
                    tables: state.tables.map(t => t.id === tableId ? { ...t, lockedByStaffId: undefined, lockedByStaffName: undefined } : t)
                }));
            },

            markAsCleaning: async (tableId: string) => {
                await RestaurantService.updateTableStatus(tableId, 'cleaning');
                set(state => ({
                    tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'cleaning' } : t)
                }));
            },

            markAsClean: async (tableId: string) => {
                await RestaurantService.updateTableStatus(tableId, 'empty', undefined, undefined, 0);
                set(state => ({
                    tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'empty', orders: [], total: 0, waiter: undefined } : t)
                }));
            }
        }),
        {
            name: 'restaurant-storage',
            partialize: (state) => ({
                isRegisterOpen: state.isRegisterOpen,
                registerOpeningCash: state.registerOpeningCash,
                registerOpeningNote: state.registerOpeningNote,
                workDayDate: state.workDayDate,
                isDayActive: state.isDayActive
            })
        }
    )
);
