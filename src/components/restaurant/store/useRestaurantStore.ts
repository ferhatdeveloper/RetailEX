import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    Table, KitchenOrder, MenuItem, Recipe, OrderItem,
    Region, PrinterRouting, CourseType, PrinterProfile,
    Staff, LoginResult, Reservation
} from '../types';
import { useProductStore } from '../../../store/useProductStore';
import { useSaleStore } from '../../../store/useSaleStore';
import { useCustomerStore } from '../../../store/useCustomerStore';
import { RestaurantService } from '../../../services/restaurant';
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
    addItemToTable: (tableId: string, item: MenuItem, quantity: number, options?: string) => void;
    requestBill: (tableId: string) => Promise<void>;
    closeBill: (tableId: string, paymentData: any) => Promise<void>;
    addTable: (table: Omit<Table, 'orders' | 'status' | 'total'>) => Promise<void>;
    updateTable: (table: Partial<Table>, persist?: boolean) => Promise<void>;
    removeTable: (tableId: string) => Promise<void>;
    mergeTables: (sourceTableId: string, targetTableId: string) => Promise<void>;
    transferTable: (sourceTableId: string, targetTableId: string) => Promise<void>;

    // Kitchen Actions
    sendToKitchen: (tableId: string) => Promise<void>;
    markAsReady: (orderId: string) => Promise<void>;
    markAsServed: (orderId: string) => Promise<void>;

    // Recipe Actions
    updateRecipe: (recipe: Recipe) => Promise<void>;

    // Load (DB sync) Actions
    loadTables: (floorId?: string) => Promise<void>;
    loadMenu: () => Promise<void>;
    loadRegions: (storeId?: string) => Promise<void>;
    loadRecipes: () => Promise<void>;
    loadKitchenOrders: () => Promise<void>;

    // Region & Printer Actions
    addRegion: (region: Region, storeId: string) => Promise<void>;
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
    voidOrderItem: (tableId: string, itemId: string, reason: string) => Promise<void>;
    markItemAsComplementary: (tableId: string, itemId: string) => Promise<void>;

    // Phase 3: Staff/PIN
    loginWithPin: (pin: string) => Promise<LoginResult>;
    logout: () => void;
    loadStaff: () => Promise<void>;
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

            openTable: async (tableId, waiter) => {
                const staffId = get().currentStaff?.id;
                await RestaurantService.updateTableStatus(tableId, 'occupied', waiter, staffId, 0);
                set(state => ({
                    tables: state.tables.map(t =>
                        t.id === tableId
                            ? { ...t, status: 'occupied', waiter, staffId, orders: [], total: 0, startTime: new Date().toISOString() }
                            : t
                    )
                }));
            },

            addItemToTable: (tableId, item, quantity, options) => {
                set(state => ({
                    tables: state.tables.map(t => {
                        if (t.id !== tableId) return t;
                        const newOrder: OrderItem = {
                            id: uuidv4(),
                            menuItemId: item.id,
                            name: item.name,
                            quantity,
                            price: item.price,
                            status: 'pending',
                            options
                        };
                        const updatedOrders = [...t.orders, newOrder];
                        const updatedTotal = updatedOrders.reduce((sum, o) => sum + o.price * o.quantity, 0);
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
                const pendingItems = table.orders.filter(o => o.status === 'pending');
                if (pendingItems.length === 0) return;

                let dbOrderId = table.activeOrderId;
                if (!dbOrderId) {
                    const dbOrder = await RestaurantService.createOrder({ tableId, waiter: table.waiter });
                    dbOrderId = dbOrder.id;
                    for (const item of table.orders) {
                        await RestaurantService.addOrderItem(dbOrderId!, {
                            productId: item.menuItemId,
                            productName: item.name,
                            quantity: item.quantity,
                            unitPrice: item.price,
                            course: item.course,
                            note: item.notes,
                        });
                    }
                    set(state => ({ tables: state.tables.map(t => t.id === tableId ? { ...t, activeOrderId: dbOrderId } : t) }));
                } else {
                    for (const item of pendingItems) {
                        await RestaurantService.addOrderItem(dbOrderId, {
                            productId: item.menuItemId,
                            productName: item.name,
                            quantity: item.quantity,
                            unitPrice: item.price,
                            course: item.course,
                            note: item.notes,
                        });
                    }
                }

                await RestaurantService.createKitchenOrder({
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

                const kitchenOrder: KitchenOrder = {
                    id: uuidv4(),
                    tableId: table.id,
                    tableName: table.number,
                    waiter: table.waiter || 'Genel',
                    time: new Date().toLocaleTimeString(),
                    elapsed: 0,
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
                if (!table || !table.total) return;
                try {
                    let orderId = table.activeOrderId;
                    if (!orderId) {
                        const dbOrder = await RestaurantService.createOrder({ tableId, waiter: table.waiter });
                        orderId = dbOrder.id;
                        for (const item of table.orders) {
                            await RestaurantService.addOrderItem(orderId as string, {
                                productId: item.menuItemId,
                                productName: item.name,
                                quantity: item.quantity,
                                unitPrice: item.price,
                                course: item.course,
                                note: item.options
                            });
                        }
                    }
                    if (!orderId) throw new Error('Order selection failed');
                    await RestaurantService.completeTablePayment({ tableId, orderId });

                    const salesStore = useSaleStore.getState();
                    const productStore = useProductStore.getState();
                    const paymentMethod = paymentData.payments?.[0]?.method || 'cash';

                    await salesStore.addSale({
                        id: uuidv4(),
                        receiptNumber: `REST-${table.number}-${Date.now()}`,
                        date: new Date().toISOString(),
                        total: table.total || 0,
                        subtotal: table.total || 0,
                        discount: 0,
                        items: table.orders.map(o => ({
                            productId: o.menuItemId,
                            productName: o.name,
                            quantity: o.quantity,
                            price: o.price,
                            discount: 0,
                            total: o.price * o.quantity
                        })),
                        paymentMethod,
                        status: 'completed',
                        cashier: table.waiter || 'Garson'
                    });

                    if (table.customerId) {
                        const customerStore = useCustomerStore.getState();
                        await customerStore.updatePurchaseHistory(table.customerId, table.total);
                        const accountPayments = paymentData.payments.filter((p: any) => p.method === 'account');
                        const totalAccountAmount = accountPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
                        if (totalAccountAmount > 0) await customerStore.updateBalance(table.customerId, totalAccountAmount);
                        const points = Math.floor(table.total / 100);
                        if (points > 0) await customerStore.updatePoints(table.customerId, points);
                    }

                    for (const orderItem of table.orders) {
                        const recipe = get().recipes.find(r => r.menuItemId === orderItem.menuItemId);
                        if (recipe) {
                            for (const ingredient of recipe.ingredients) {
                                if (ingredient.materialId) {
                                    const product = productStore.products.find(p => p.id === ingredient.materialId);
                                    if (product) {
                                        const finalDeduction = convertUnit(ingredient.quantity * orderItem.quantity, ingredient.unit || 'gr', product.unit || 'kg');
                                        await productStore.updateStock(product.id, product.stock - finalDeduction);
                                    }
                                }
                            }
                        }
                    }

                    set(state => ({
                        tables: state.tables.map(t => t.id === tableId ? { ...t, status: 'empty', orders: [], total: 0, waiter: undefined, startTime: undefined, activeOrderId: undefined } : t)
                    }));
                    await RestaurantService.updateTableStatus(tableId, 'empty', undefined, undefined, 0);
                } catch (error) {
                    console.error('[RestaurantStore] closeBill error:', error);
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
                await RestaurantService.mergeTables(sourceTableId, targetTableId);
                const sourceTable = get().tables.find(t => t.id === sourceTableId);
                const sourcePending = sourceTable?.orders.filter(o => o.status === 'pending') || [];
                set(state => ({
                    tables: state.tables.map(t => {
                        if (t.id === targetTableId) {
                            const updatedOrders = [...t.orders, ...sourcePending];
                            return { ...t, orders: updatedOrders, total: updatedOrders.reduce((sum, o) => sum + o.price * o.quantity, 0), status: 'occupied' };
                        }
                        if (t.id === sourceTableId) return { ...t, orders: [], total: 0, status: 'empty', waiter: undefined, activeOrderId: undefined };
                        return t;
                    })
                }));
            },

            transferTable: async (sourceTableId, targetTableId) => {
                await RestaurantService.transferTable(sourceTableId, targetTableId);
                const sourceTable = get().tables.find(t => t.id === sourceTableId);
                if (!sourceTable) return;
                set(state => ({
                    tables: state.tables.map(t => {
                        if (t.id === targetTableId) return { ...t, status: sourceTable.status, orders: sourceTable.orders, total: sourceTable.total, waiter: sourceTable.waiter, startTime: sourceTable.startTime, activeOrderId: sourceTable.activeOrderId };
                        if (t.id === sourceTableId) return { ...t, status: 'empty', orders: [], total: 0, waiter: undefined, startTime: undefined, activeOrderId: undefined };
                        return t;
                    })
                }));
            },

            updateRecipe: async (recipe) => {
                await RestaurantService.saveRecipe({ id: recipe.id, menuItemId: recipe.menuItemId, totalCost: recipe.totalCost, wastagePercent: recipe.wastagePercent, ingredients: recipe.ingredients.map(ing => ({ materialId: ing.materialId ?? '', quantity: ing.quantity, unit: ing.unit, cost: ing.cost })) });
                set(state => ({ recipes: state.recipes.some(r => r.menuItemId === recipe.menuItemId) ? state.recipes.map(r => r.menuItemId === recipe.menuItemId ? recipe : r) : [...state.recipes, recipe] }));
            },

            loadTables: async (floorId) => {
                const rows = await RestaurantService.getTables(floorId);
                const tablesWithOrders = await Promise.all(rows.map(async (r: any) => {
                    const baseTable: Table = { id: r.id, number: r.number, seats: r.seats ?? 4, status: r.status ?? 'empty', floorId: r.floor_id ?? '', location: r.location, orders: [], startTime: r.start_time, waiter: r.waiter, total: Number(r.total || 0), isLarge: r.is_large ?? false };
                    if (baseTable.status !== 'empty') {
                        const activeOrder = await RestaurantService.getActiveOrder(baseTable.id);
                        if (activeOrder) {
                            baseTable.activeOrderId = activeOrder.id;
                            baseTable.orders = (activeOrder.items || []).map((i: any) => ({ id: i.id, menuItemId: i.product_id, name: i.product_name, quantity: Number(i.quantity), price: Number(i.unit_price), status: i.status || 'cooking', course: i.course, options: i.note, isVoid: i.is_void, voidReason: i.void_reason, isComplementary: i.is_complementary }));
                            baseTable.total = baseTable.orders.reduce((sum, o) => o.isVoid ? sum : sum + o.price * o.quantity, 0);
                        }
                    }
                    return baseTable;
                }));
                set({ tables: tablesWithOrders });
            },

            loadMenu: async () => {
                const products = useProductStore.getState().products;
                set({ menu: products.map((p: any) => ({ id: p.id, name: p.name, price: p.price ?? p.sale_price ?? 0, category: p.category ?? p.group_name ?? 'Genel', image: p.image })) });
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
                const rows = await RestaurantService.getActiveKitchenOrders();
                set({ kitchenOrders: rows.map((ko: any) => ({ id: ko.id, tableId: ko.order_id ?? '', tableName: ko.table_number ?? '', waiter: ko.waiter ?? '', time: ko.sent_at ? new Date(ko.sent_at).toLocaleTimeString() : new Date().toLocaleTimeString(), elapsed: ko.sent_at ? Math.floor((Date.now() - new Date(ko.sent_at).getTime()) / 60000) : 0, items: (ko.items ?? []).map((i: any) => ({ id: i.id, menuItemId: i.order_item_id ?? '', name: i.product_name, quantity: Number(i.quantity), price: 0, status: i.status ?? 'cooking', course: i.course, notes: i.note, startAt: i.start_at, preparationTime: i.preparation_time, estimatedReadyAt: i.estimated_ready_at })), status: ko.status ?? 'new', estimatedReadyAt: ko.estimated_ready_at })) });
            },

            addRegion: async (region, storeId) => {
                const dbRegion = await RestaurantService.saveFloor({ store_id: storeId, name: region.name, display_order: region.order });
                set(state => ({ regions: [...state.regions, { id: dbRegion.id, name: dbRegion.name, order: dbRegion.display_order }].sort((a, b) => a.order - b.order) }));
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
            voidOrderItem: async (tableId, itemId, reason) => {
                await RestaurantService.voidOrderItem(itemId, reason);
                const table = get().tables.find(t => t.id === tableId);
                if (table) await get().loadTables(table.floorId);
            },
            markItemAsComplementary: async (tableId, itemId) => {
                await RestaurantService.markItemAsComplementary(itemId);
                const table = get().tables.find(t => t.id === tableId);
                if (table) await get().loadTables(table.floorId);
            },
            loginWithPin: async (pin) => {
                const result = await RestaurantService.verifyStaffPin(pin, RestaurantService.firmNr);
                if (result.success && result.staff) set({ currentStaff: result.staff });
                return result;
            },
            logout: () => set({ currentStaff: null }),
            loadStaff: async () => set({ staffList: await RestaurantService.getStaffList(RestaurantService.firmNr) }),
            setCurrentStaff: (staff) => set({ currentStaff: staff }),
            openRegister: (cash, note) => set({ isRegisterOpen: true, registerOpeningCash: cash, registerOpeningNote: note, workDayDate: new Date().toLocaleDateString('tr-TR'), isDayActive: true }),
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
