import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    ChevronLeft,
    SlidersHorizontal,
    Plus,
    Minus,
    Banknote,
    CreditCard,
    Ticket,
    LayoutGrid,
    Monitor,
    MessageSquareMore,
    MoreVertical,
    Calculator,
    Trash2,
    Utensils,
    UtensilsCrossed,
    Search,
    List,
    History,
    RotateCcw,
    Percent,
    StickyNote,
    CalendarDays,
    Users,
    Printer,
    CheckCircle,
    X,
    Tag,
    FileText,
    ChefHat,
    Clock,
    UserCircle,
    BookmarkPlus,
    BookmarkCheck,
    User,
    ShoppingBag,
    ArrowRightLeft,
} from 'lucide-react';
import { cn } from '../../ui/utils';
import { POSPaymentModal } from '../../pos/POSPaymentModal';
import { Receipt80mm } from '../../pos/Receipt80mm';
import { POSSalesHistoryModal } from '../../pos/POSSalesHistoryModal';
import { salesAPI } from '../../../services/api/sales';
import { POSReturnModal } from '../../pos/POSReturnModal';
import { RestaurantStaffPinModal } from './RestaurantStaffPinModal';
import { POSCustomerModal } from '../../pos/POSCustomerModal';
import { RestaurantParkedOrdersModal } from './RestaurantParkedOrdersModal';
import { RestaurantOrderNoteModal } from './RestaurantOrderNoteModal';
import { RestaurantDiscountModal } from './RestaurantDiscountModal';
import { RestaurantKitchenConfirmModal } from './RestaurantKitchenConfirmModal';
import { RestaurantProductOptionsModal } from './RestaurantProductOptionsModal';
import { RestaurantMoveTableModal } from './RestaurantMoveTableModal';
import { RestaurantSplitBillModal } from './RestaurantSplitBillModal';
import { RestaurantVoidReasonModal } from './RestaurantVoidReasonModal';
import { RestaurantTableCloseConfirmModal } from './RestaurantTableCloseConfirmModal';
import type { Product, Customer, Campaign, User as UserType, Sale } from '../../../core/types';
import type { CartItem } from '../../pos/types';
import type { Table, Staff } from '../types';
import { RestaurantService } from '../../../services/restaurant';
import { useRestaurantStore } from '../store/useRestaurantStore';

interface RestPOSProps {
    products: Product[];
    customers: Customer[];
    campaigns: Campaign[];
    selectedCustomer: Customer | null;
    currentStaff: Staff | null;
    currentUser: UserType;
    onSaleComplete: (sale: any) => void;
    onLogout?: () => void;
    onBack?: () => void;
    table?: Table | null;
    /** Masaya girilirken belirlenen kişi sayısı → tabaklar bu sayı kadar başlar */
    covers?: number;
    /** POS çalışma modu: masa servisi, perakende veya self servis */
    posMode?: 'table' | 'retail' | 'selfservice';
    /** MASA TAŞI tıklandığında masalar ekranına geçip tam ekran masa seçimi açılsın (verilirse lokal modal açılmaz) */
    onRequestMoveTable?: () => void;
    /** Mutfak butonuna basıp sipariş gönderildikten sonra masalara dönüp garson seçim açılsın */
    onAfterSendToKitchen?: () => void;
}

const fmt = (num: number) => {
    return new Intl.NumberFormat('tr-TR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(num);
};

const DRINK_CATS = ['Soğuk İçecekler', 'Sıcak İçecekler', 'İçecekler', 'Drinks', 'Beverages'];

/** Renk paleti — her tabağa otomatik renk atanır (inline style ile, Tailwind purge-safe) */
const PLATE_PALETTE = [
    { bg: '#EEF2FF', text: '#3730A3', border: '#C7D2FE' },  // indigo
    { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },  // amber
    { bg: '#DCFCE7', text: '#166534', border: '#BBF7D0' },  // green
    { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },  // pink
    { bg: '#E0F2FE', text: '#075985', border: '#BAE6FD' },  // sky
    { bg: '#FEE2E2', text: '#991B1B', border: '#FECACA' },  // red
    { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF' },  // purple
    { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },  // emerald
];

export const RestPOS: React.FC<RestPOSProps> = ({ products, customers, selectedCustomer: initCustomer, currentStaff, onSaleComplete, onBack, table, covers = 0, posMode = 'table', onRequestMoveTable, onAfterSendToKitchen }) => {
    const [query, setQuery] = useState('');
    const [completedSaleForPrint, setCompletedSaleForPrint] = useState<any>(null);
    const [selectedCat, setSelectedCat] = useState<string | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [expandedCartItem, setExpandedCartItem] = useState<number | null>(null);
    const [cartView, setCartView] = useState<'table' | 'card'>('card');
    const [orderDiscount, setOrderDiscount] = useState(0);
    const [orderNote, setOrderNote] = useState('');
    const [showTableCloseConfirm, setShowTableCloseConfirm] = useState(false);
    const [receiptNumber, setReceiptNumber] = useState(() =>
        `RES-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0')}`
    );

    const generateNewReceiptNumber = async () => {
        try {
            const counts = await salesAPI.getSequenceCounts();
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randomPart = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
            setReceiptNumber(`RES-${datePart}-M${counts.monthly}-D${counts.daily}-${randomPart}`);
        } catch (error) {
            console.error('Failed to generate sequence counts:', error);
            const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randomPart = String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0');
            setReceiptNumber(`RES-${datePart}-${randomPart}`);
        }
    };

    useEffect(() => {
        generateNewReceiptNumber();
    }, []);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initCustomer ?? null);
    const swipeStartX = useRef<number | null>(null);
    const swipeStartTime = useRef<number>(0);

    /* ── Garson & müşteri ── */
    const [waiter, setWaiter] = useState(currentStaff?.name || '');

    /* ── Beklet (park orders) — sessionStorage persist ── */
    interface ParkedOrder { id: string; tableNum?: string | number; items: CartItem[]; note: string; waiter: string; customer: Customer | null; discount: number; time: string; }
    const PARK_KEY = 'restpos_parked_orders';
    const loadParked = (): ParkedOrder[] => {
        try { return JSON.parse(sessionStorage.getItem(PARK_KEY) ?? '[]'); } catch { return []; }
    };
    const saveParked = (orders: ParkedOrder[]) => {
        try { sessionStorage.setItem(PARK_KEY, JSON.stringify(orders)); } catch { /* ignore */ }
    };
    const [parkedOrders, setParkedOrders] = useState<ParkedOrder[]>(loadParked);
    const [showParkedModal, setShowParkedModal] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    const updateItemNote = (idx: number, note: string) => {
        const next = [...cart];
        (next[idx] as any).note = note;
        setCart(next);
    };

    /* ── Tabak sistemi ── */
    const [plates, setPlates] = useState<string[]>(() =>
        covers > 0 ? Array.from({ length: covers }, (_, i) => `TABAK-${i + 1}`) : []
    );
    const [editingPlateIdx, setEditingPlateIdx] = useState<number | null>(null);
    /** Seçili tabak: null = tümünü göster, string = sadece o tabağı göster + yeni ürünler bu tabağa */
    const [activePlate, setActivePlate] = useState<string | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const cycleItemPlate = (idx: number) => {
        if (plates.length === 0) return;
        const current = (cart[idx] as any).plate as string | undefined;
        const ci = plates.indexOf(current ?? '');
        const next = ci === -1 ? plates[0] : (ci + 1 < plates.length ? plates[ci + 1] : null);
        const updated = [...cart];
        (updated[idx] as any).plate = next;
        setCart(updated);
    };
    const updateItemDiscount = (idx: number, pct: number) => {
        const next = [...cart];
        const item = next[idx];
        item.discount = pct;
        const basePrice = item.price || item.product.price;
        item.subtotal = item.quantity * basePrice * (1 - pct / 100);
        setCart(next);
    };

    const handleCustomerSelect = (customer: Customer | null) => {
        setSelectedCustomer(customer);
        if (table) {
            setCustomerForTable(table.id, customer?.id, customer?.name);
        }
        setShowCustomerModal(false);
    };

    const parkOrder = () => {
        if (cart.length === 0) return;
        const id = `PARK-${Date.now()}`;
        const newOrder: ParkedOrder = {
            id, tableNum: table?.number,
            items: [...cart], note: orderNote,
            waiter, customer: selectedCustomer,
            discount: orderDiscount,
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        };
        setParkedOrders(prev => {
            const updated = [...prev, newOrder];
            saveParked(updated);
            return updated;
        });
        setCart([]); setOrderNote(''); setOrderDiscount(0);
        notify(`Sipariş beklemeye alındı (${id})`);
    };
    const resumeParked = (p: ParkedOrder) => {
        setCart(p.items); setOrderNote(p.note);
        setOrderDiscount(p.discount); setSelectedCustomer(p.customer);
        setWaiter(p.waiter);
        setParkedOrders(prev => {
            const updated = prev.filter(x => x.id !== p.id);
            saveParked(updated);
            return updated;
        });
        setShowParkedModal(false);
        notify('Sipariş geri yüklendi');
    };

    const [salesHistory, setSalesHistory] = useState<Sale[]>([]);
    const {
        closeBill, setCustomerForTable, tables, openTable,
        addItemToTable, sendToKitchen, requestBill,
        categories, loadCategories, moveTable, mergeTables,
        splitOrder, updateOrderItemOptions, voidOrderItem, markItemAsComplementary,
        markAsClean, moveOrderItemToTable
    } = useRestaurantStore();

    // ── Masa oturum kilidi ───────────────────────────────────────────────
    // window.__tableLocks: Map<tableId, staffName>  → in-memory, sekme bazlı
    useEffect(() => {
        if (!table?.id || posMode !== 'table') return;

        const locks: Map<string, string> = (window as any).__tableLocks ??
            ((window as any).__tableLocks = new Map<string, string>());

        const myName = currentStaff?.name || 'Garson';
        const holder = locks.get(table.id);

        // Kilidi başka garson tutuyorsa engelle
        if (holder && holder !== myName) {
            notify(`Bu masada şu an "${holder}" aktif, giremezsiniz!`, 'error');
            setTimeout(() => onBack?.(), 2000);
            return;
        }

        // Kilidi al
        locks.set(table.id, myName);

        return () => {
            // Sadece kendi kilidimizi bırak
            if (locks.get(table.id) === myName) {
                locks.delete(table.id);
            }
        };
    }, [table?.id, posMode]);

    // Sync local selectedCustomer with table's customer if provided
    useEffect(() => {
        if (table) {
            const currentTable = tables.find(t => t.id === table.id);
            if (currentTable?.customerId && (!selectedCustomer || selectedCustomer.id !== currentTable.customerId)) {
                const customer = customers.find(c => c.id === currentTable.customerId);
                if (customer) setSelectedCustomer(customer);
            }
        }
    }, [table, tables, customers]);

    // ── Masanın siparişlerini sepete yükle (hesap/billing dahil — ürünler kaybolmasın)
    useEffect(() => {
        if (!table?.id || posMode !== 'table') return;
        if (cart.length > 0) return; // zaten sepette ürün varsa dokunma
        // Önce store'daki güncel masayı kullan; yoksa veya sipariş yoksa prop'taki table.orders kullan
        const storeTable = tables.find(t => t.id === table.id);
        const orders = (storeTable?.orders?.length ? storeTable.orders : table.orders) ?? [];
        if (!orders.length) return;
        const loaded = orders
            .filter((o: any) => !o.isVoid)
            .map((o: any) => ({
                ...({ id: o.id } as any),
                product: { id: o.menuItemId, name: o.name, price: o.price, category: '' } as any,
                quantity: o.quantity,
                price: o.price,
                subtotal: o.price * o.quantity,
                discount: 0,
                kitchenStatus: (o.status === 'pending' ? 'pending'
                    : o.status === 'cooking' ? 'cooking' : 'served') as CartItem['kitchenStatus'],
                ...(o.sourceTableNumber && { sourceTableNumber: o.sourceTableNumber, sourceTableId: o.sourceTableId })
            } as CartItem));
        setCart(loaded);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [table?.id, table?.orders, tables]);

    useEffect(() => {
        loadCategories();
    }, [loadCategories]);

    const loadSalesHistory = useCallback(async () => {
        try {
            const rows = await RestaurantService.getOrderHistory({ status: 'closed', limit: 100 });
            setSalesHistory(rows.map((r: any) => ({
                id: r.id,
                receiptNumber: r.order_no ?? `RES-${r.id.slice(0, 8)}`,
                date: r.opened_at ?? r.created_at ?? new Date().toISOString(),
                items: (r.items ?? []).map((i: any) => ({
                    productId: i.product_id ?? '',
                    productName: i.product_name,
                    quantity: Number(i.quantity),
                    price: Number(i.unit_price ?? 0),
                    discount: Number(i.discount_pct ?? 0),
                    total: Number(i.subtotal ?? 0),
                })),
                subtotal: Number(r.total_amount ?? 0),
                discount: Number(r.discount_amount ?? 0),
                total: Number(r.total_amount ?? 0),
                paymentMethod: 'Nakit',
                cashier: r.waiter ?? '',
                table: r.table_number ?? '—',
                notes: r.note,
            } as Sale)));
        } catch (err) {
            console.error('[RestPOS] loadSalesHistory error:', err);
        }
    }, []);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [showKitchenConfirm, setShowKitchenConfirm] = useState(false);
    const [showMoveTableModal, setShowMoveTableModal] = useState(false);
    const [showSplitBillModal, setShowSplitBillModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [splitSelectedItems, setSplitSelectedItems] = useState<number[]>([]);
    const [targetTableId, setTargetTableId] = useState<string | null>(null);
    const [moveItemToTable, setMoveItemToTable] = useState<{ itemId: string; itemName: string } | null>(null);
    const [showVoidReasonModal, setShowVoidReasonModal] = useState(false);
    const [voidingItem, setVoidingItem] = useState<{ tableId: string; itemId: string; name: string; quantity: number } | null>(null);
    const [voidReason, setVoidReason] = useState('');
    const [discountInput, setDiscountInput] = useState('');
    const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const notify = (msg: string, type: 'success' | 'error' = 'success') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3000);
    };

    // Close expanded cart item when clicking outside
    useEffect(() => {
        const handleGlobalClick = (e: MouseEvent) => {
            if (expandedCartItem !== null) {
                const target = e.target as HTMLElement;
                if (!target.closest('.cart-item-expanded')) {
                    setExpandedCartItem(null);
                }
            }
        };
        document.addEventListener('mousedown', handleGlobalClick);
        return () => document.removeEventListener('mousedown', handleGlobalClick);
    }, [expandedCartItem]);

    // Long-press state
    const [longPressedProduct, setLongPressedProduct] = useState<Product | null>(null);
    const [showProductOptions, setShowProductOptions] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const isLongPress = useRef(false);

    const startLongPress = (product: Product) => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setLongPressedProduct(product);
            setShowProductOptions(true);
        }, 500); // Reduced to 500ms for better responsiveness
    };

    const cancelLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleProductClick = (product: Product) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        if (!isLongPress.current) {
            addToCart(product);
        }
        isLongPress.current = false;
    };

    /* ---------- category groups ---------- */
    const allCats = useMemo(() => {
        // 1. Try DB categories FIRST
        if (categories && categories.length > 0) {
            return categories.map(c => c.name);
        }

        // 2. Fallback to deriving from products
        const cats = Array.from(new Set(products.map(p =>
            Array.isArray(p.category) ? p.category[0] : p.category
        ))).filter(Boolean) as string[];

        // 3. Last resort hardcoded list
        return cats.length > 0 ? cats : [
            'Kırmızı Etler', 'Beyaz Etler', 'Deniz Ürünleri', 'Pide',
            'Tatlılar', 'Fast Food', 'Kahvaltı', 'Çorbalar', 'Menüler', 'Pizza',
            'Soğuk İçecekler', 'Sıcak İçecekler',
        ];
    }, [categories, products]);

    const groups = useMemo(() => {
        const food = allCats.filter(c => !DRINK_CATS.includes(c));
        const drink = allCats.filter(c => DRINK_CATS.includes(c));
        const result = [];
        if (food.length) result.push({ name: 'SteakHouse', cats: food });
        if (drink.length) result.push({ name: 'Vitamin House', cats: drink });
        return result;
    }, [allCats]);

    /* ---------- cart ---------- */
    const addToCart = async (product: Product) => {
        try {
            // Masa modunda: DB'ye de kaydet (addItemToTable artık async + DB)
            if (posMode === 'table' && table?.id) {
                const storeTable = tables.find(t => t.id === table.id);
                // Masa henüz açılmamışsa aç
                if (!storeTable || storeTable.status === 'empty') {
                    await openTable(table.id, waiter || currentStaff?.name || 'Garson');
                }
                await addItemToTable(table.id, {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    category: Array.isArray(product.category) ? product.category[0] : (product.category ?? ''),
                }, 1);
            }
        } catch (err: any) {
            console.error('[RestPOS] addToCart db error:', err);
            notify('Ürün eklenirken hata oluştu: ' + (err.message || 'Bilinmeyen hata'), 'error');
            return;
        }

        // Aktif tabak varsa: aynı ürün + aynı tabak satırını birleştir, yoksa yeni satır
        // Aktif tabak yoksa: tabaksız aynı ürünü birleştir
        const idx = cart.findIndex(i =>
            i.product.id === product.id &&
            ((activePlate ? (i as any).plate === activePlate : !(i as any).plate))
        );
        if (idx > -1) {
            const next = [...cart];
            next[idx].quantity += 1;
            next[idx].subtotal = next[idx].quantity * product.price;
            setCart(next);
        } else {
            const newItem = { product, quantity: 1, price: product.price, subtotal: product.price, discount: 0, taxAmount: 0 } as CartItem;
            if (activePlate) (newItem as any).plate = activePlate;
            setCart([...cart, newItem]);
        }
    };

    const updateQty = (idx: number, delta: number) => {
        const next = [...cart];
        const item = next[idx];
        const newQty = item.quantity + delta;
        if (newQty <= 0) { setCart(cart.filter((_, i) => i !== idx)); return; }
        item.quantity = newQty;
        item.subtotal = newQty * item.product.price;
        setCart(next);
    };

    /** Sepetteki kalem için iptal/iade akışını başlat — kırmızı SİL / minus basınca sebep modalı açılır, kayıt altına alınır */
    const openVoidForCartItem = (idx: number) => {
        const item = cart[idx];
        if (!item) return;
        const orderItemId = (item as any).id;
        if (table?.id && orderItemId) {
            setVoidingItem({
                tableId: table.id,
                itemId: orderItemId,
                name: item.product?.name ?? (item as any).name ?? '',
                quantity: item.quantity,
            });
            setShowVoidReasonModal(true);
        } else {
            setCart(cart.filter((_, i) => i !== idx));
            setExpandedCartItem(expandedCartItem === idx ? null : expandedCartItem !== null && expandedCartItem > idx ? expandedCartItem - 1 : expandedCartItem);
            notify('Ürün sepetten kaldırıldı');
        }
    };

    const subtotal = useMemo(() => cart.reduce((s, i) => s + (i.subtotal ?? 0), 0), [cart]);
    const discountAmount = useMemo(() => subtotal * (orderDiscount / 100), [subtotal, orderDiscount]);
    const grandTotal = useMemo(() => subtotal - discountAmount, [subtotal, discountAmount]);
    /** Aktif tabağa göre filtrelenmiş cart — orijinal idx korunur */
    const displayCart = useMemo(() =>
        cart.map((item, idx) => ({ item, idx }))
            .filter(({ item }) => activePlate === null || (item as any).plate === activePlate),
        [cart, activePlate]
    );
    const paid = 0;
    const remaining = grandTotal - paid;

    const handlePaymentComplete = async (paymentData: any) => {
        // Yazdırmadan önce tam tutar: sale objesi mevcut sepetten (ürünler kaybolmasın)
        const sale: any = {
            id: `RES-${Date.now()}`,
            receiptNumber,
            date: new Date().toISOString(),
            cashier: typeof currentStaff === 'object' ? (currentStaff as any)?.name : (currentStaff || 'Garson'),
            table: table?.number,
            items: cart.map(item => ({
                productId: item.product?.id ?? (item as any).product?.id,
                productName: item.product?.name ?? (item as any).product?.name ?? (item as any).name,
                quantity: item.quantity,
                price: item.price ?? item.product?.price,
                discount: item.discount || 0,
                total: item.subtotal ?? (item as any).total ?? (item.price ?? 0) * item.quantity,
                variant: item.variant
            })),
            subtotal,
            discount: (discountAmount || 0) + (paymentData.discount || 0),
            total: paymentData.finalTotal ?? grandTotal,
            payment: paymentData,
            note: orderNote,
        };

        try {
            // Yazdır/kapat: önce DB'de masayı kapat, sonra UI temizle ve fiş göster
            if (table) {
                await closeBill(table.id, paymentData);
            }
        } catch (err) {
            console.error('[RestPOS] closeBill error:', err);
            // Fallback: at least try to close the order directly
            if (table) {
                try {
                    const activeOrder = await RestaurantService.getActiveOrder(table.id);
                    if (activeOrder) {
                        await RestaurantService.closeOrder(activeOrder.id, { discountAmount });
                    }
                    await RestaurantService.updateTableStatus(table.id, 'empty', undefined, undefined, 0);
                } catch (e2) {
                    console.error('[RestPOS] fallback close failed:', e2);
                }
            }
        } finally {
            // Ödeme bittikten sonra: sepeti temizle, fiş numarasını yenile, modal kapat
            generateNewReceiptNumber();
            setCart([]);
            setOrderDiscount(0);
            setOrderNote('');
            setShowPaymentModal(false);

            if (paymentData.autoPrint) {
                // Otomatik yazdır: direkt print window aç, preview gösterme
                const win = window.open('', '_blank', 'width=400,height=700');
                if (win) {
                    const itemRows = (sale.items || []).map((it: any) =>
                        `<tr><td style="text-align:left;padding:2px 4px">${it.productName || ''}</td><td style="text-align:center;padding:2px 4px">${it.quantity} Adet x ${(it.price ?? 0).toLocaleString('tr-TR')} IQD</td><td style="text-align:right;padding:2px 4px;font-weight:bold">${((it.total ?? 0)).toLocaleString('tr-TR')} IQD</td></tr>`
                    ).join('');
                    const payRows = (paymentData.payments || []).map((p: any) =>
                        `<tr><td>${p.method === 'cash' ? '💵 Nakit' : p.method === 'card' ? '💳 Kart' : '📱 QR'}</td><td style="text-align:right;font-weight:bold">${(p.amount ?? 0).toLocaleString('tr-TR')} IQD</td></tr>`
                    ).join('');
                    win.document.write(`
                        <html><head><title>Fiş - ${sale.receiptNumber}</title>
                        <style>
                          @page{size:80mm auto;margin:0}
                          body{font-family:'Courier New',Courier,monospace;margin:0;padding:8px;font-size:12px;width:80mm}
                          h2{text-align:center;margin:4px 0;font-size:16px}
                          .sub{text-align:center;font-size:10px;color:#555;margin:2px 0}
                          hr{border:0;border-top:1px dashed #333;margin:6px 0}
                          table{width:100%;border-collapse:collapse}
                          td{padding:2px 4px;font-size:11px}
                          .total{font-size:14px;font-weight:bold;text-align:right}
                          .center{text-align:center}
                        </style>
                        </head><body>
                        <h2>${sale.cashier ? sale.cashier.split(' ')[0] || 'Firma' : 'Firma'}</h2>
                        <p class="sub">Profesyonel ERP Çözümleri</p>
                        <hr/>
                        <table>
                          <tr><td>FİŞ NO:</td><td style="text-align:right;font-weight:bold">${sale.receiptNumber}</td></tr>
                          <tr><td>TARİH:</td><td style="text-align:right">${new Date(sale.date).toLocaleString('tr-TR')}</td></tr>
                          ${sale.cashier ? `<tr><td>KASİYER:</td><td style="text-align:right">${sale.cashier}</td></tr>` : ''}
                          ${sale.table ? `<tr><td>MASA:</td><td style="text-align:right">${sale.table}</td></tr>` : ''}
                        </table>
                        <hr/>
                        <table>${itemRows}</table>
                        <hr/>
                        <table>
                          <tr><td>ARA TOPLAM:</td><td style="text-align:right">${(sale.subtotal ?? 0).toLocaleString('tr-TR')} IQD</td></tr>
                          ${sale.discount > 0 ? `<tr><td>İNDİRİM:</td><td style="text-align:right;color:red">-${(sale.discount ?? 0).toLocaleString('tr-TR')} IQD</td></tr>` : ''}
                        </table>
                        <hr/>
                        <p class="total">TOPLAM: ${(sale.total ?? 0).toLocaleString('tr-TR')} IQD</p>
                        <hr/>
                        <p style="font-weight:bold;margin:4px 0">ÖDEME DETAYLARI:</p>
                        <table>${payRows}</table>
                        <p style="text-align:right;margin:4px 0">ÖDENEN: ${(paymentData.payments || []).reduce((s: number, p: any) => s + (p.amount || 0), 0).toLocaleString('tr-TR')} IQD</p>
                        <hr/>
                        <p class="center" style="font-size:10px">*** Bizi Tercih Ettiğiniz İçin Teşekkürler ***</p>
                        <p class="center" style="font-size:9px;color:#666">Bu fiş iade ve değişim işlemlerinde gereklidir.</p>
                        <hr/>
                        <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script>
                        </body></html>
                    `);
                    win.document.close();
                }
                notify('Ödeme tamamlandı!');
                onBack?.();
            } else {
                // Manuel: Receipt80mm önizleme göster
                setCompletedSaleForPrint(sale);
            }
        }
    };

    /* ---------- ödeme başlatma — masa billing durumuna geç ---------- */
    const handleOpenPayment = async () => {
        if (cart.length === 0) return;
        if (table) {
            try { await requestBill(table.id); } catch (e) { /* DB yoksa devam et */ }
        }
        setShowPaymentModal(true);
    };

    const handleClosePrintReceipt = () => {
        setCompletedSaleForPrint(null);
        notify('Ödeme tamamlandı, masa kapatıldı.');
        onBack?.();
    };

    /* ---------- filtered products ---------- */


    const filtered = useMemo(() =>
        products.filter(p => {
            const cat = Array.isArray(p.category) ? p.category[0] : p.category;
            return (!selectedCat || cat === selectedCat) &&
                (!query || p.name.toLowerCase().includes(query.toLowerCase()));
        }), [products, selectedCat, query]);



    /* ================================================================ */
    const handleBackWithWarning = () => {
        if (posMode === 'table' && table && cart.length === 0) {
            setShowTableCloseConfirm(true);
        } else {
            onBack?.();
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartTime.current = Date.now();
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (swipeStartX.current === null) return;
        const touchEndX = e.changedTouches[0].clientX;
        const deltaX = touchEndX - swipeStartX.current;
        const deltaTime = Date.now() - swipeStartTime.current;

        // Sağa doğru kaydırma (Swipe from left to right)
        // Eşik değerler: 100px mesafe, 300ms süre, 50px'den küçükse (başlangıç noktası ekranın solunda)
        if (deltaX > 100 && deltaTime < 300 && swipeStartX.current < 80) {
            handleBackWithWarning();
        }
        swipeStartX.current = null;
    };

    return (
        <div
            className="h-full flex flex-col bg-[#f0f0f0] font-sans overflow-hidden select-none text-gray-800"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >

            {/* ── UNIFIED HEADER ─────────────────────────────────────── */}
            <header className="flex flex-col shrink-0 z-20">
                {/* TOP HEADER */}
                <div
                    className="border-b px-4 py-2.5 flex items-center justify-between gap-4 shadow-xl min-h-[64px] backdrop-blur-xl relative overflow-hidden"
                    style={{ backgroundColor: 'rgba(37, 99, 235, 0.95)', borderColor: 'rgba(255, 255, 255, 0.1)' }}
                >
                    {/* Glossy Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

                    <div className="flex items-center gap-4 w-[380px] relative z-10 transition-all">
                        <button
                            onClick={handleBackWithWarning}
                            className="flex items-center gap-2.5 px-5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-2xl font-black text-[12px] uppercase transition-all shadow-lg border border-white/20 group active:scale-90"
                        >
                            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                            Geri
                        </button>

                        <div className="relative group flex-1 h-11 min-w-0">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-white/50 group-focus-within:text-white transition-all scale-90 group-focus-within:scale-100 pointer-events-none z-10" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                inputMode="search"
                                autoComplete="off"
                                placeholder="Ürün veya kategori ara..."
                                className="absolute inset-0 w-full h-full bg-black/20 hover:bg-black/30 focus:bg-white/15 border border-white/10 focus:border-white/40 text-white placeholder:text-white/40 pl-10 pr-4 rounded-2xl outline-none transition-all text-[14px] font-bold shadow-inner"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onFocus={() => {
                                    if ((window as any).__TAURI_INTERNALS__) {
                                        import('@tauri-apps/api/core').then(({ invoke }) => invoke('show_touch_keyboard')).catch(() => {});
                                    }
                                }}
                            />
                        </div>
                    </div>

                    <div className="flex flex-1 items-center gap-3 overflow-x-auto no-scrollbar px-2 mx-auto justify-end relative z-10">
                        <button
                            onClick={() => setShowStaffModal(true)}
                            className={cn(
                                "flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-[12px] font-black uppercase transition-all whitespace-nowrap border active:scale-95 shadow-md",
                                waiter
                                    ? "bg-white text-blue-600 border-white shadow-blue-500/20"
                                    : "bg-white/10 text-white/80 border-white/10 hover:bg-white/20 hover:text-white"
                            )}
                        >
                            <UserCircle className="w-4.5 h-4.5" />
                            {waiter || 'Personel Seç'}
                        </button>

                        <button
                            onClick={() => { setShowHistoryModal(true); loadSalesHistory(); }}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-[12px] font-black uppercase transition-all whitespace-nowrap bg-white/10 text-white hover:bg-white/20 border border-white/10 active:scale-95 shadow-lg shadow-black/10"
                        >
                            <History className="w-4.5 h-4.5" /> FİŞ LİSTESİ
                        </button>

                        <button
                            onClick={() => setShowPrintPreview(true)}
                            disabled={cart.length === 0}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl text-[12px] font-black uppercase transition-all whitespace-nowrap bg-blue-500 hover:bg-blue-400 text-white border border-blue-400 active:scale-95 shadow-lg shadow-blue-500/20 disabled:opacity-30 disabled:grayscale"
                        >
                            <Printer className="w-4.5 h-4.5" /> YAZDIR (80mm)
                        </button>
                    </div>

                    <div className="flex items-center gap-4 relative z-10 transition-all">
                        <div className="flex flex-col items-end">
                            {posMode === 'retail' ? (
                                <div className="flex items-center gap-2 bg-orange-500/40 px-5 py-2.5 rounded-2xl border border-orange-300/30 shadow-inner backdrop-blur-sm">
                                    <span className="text-orange-200 font-black text-[12px] uppercase tracking-[0.15em] leading-none">PERAKENDe</span>
                                </div>
                            ) : posMode === 'selfservice' ? (
                                <div className="flex items-center gap-2 bg-green-600/40 px-5 py-2.5 rounded-2xl border border-green-300/30 shadow-inner backdrop-blur-sm">
                                    <span className="text-green-200 font-black text-[12px] uppercase tracking-[0.15em] leading-none">SELF SERVİS</span>
                                </div>
                            ) : (() => {
                                const storeTable = tables.find(t => t.id === table?.id);
                                const mergedFaturas = storeTable?.mergedOrders?.map(m => m.faturaNo).filter(Boolean) || [];
                                return (
                                    <div className="flex flex-col items-end gap-0.5">
                                        <div className="flex items-center gap-2 bg-blue-900/40 px-5 py-2.5 rounded-2xl border border-white/10 shadow-inner backdrop-blur-sm">
                                            <span className="text-white/50 font-black text-[10px] uppercase tracking-[0.2em] leading-none">MASA</span>
                                            <span className="text-white font-black text-[18px] leading-none drop-shadow-md">{table?.number || '----'}</span>
                                        </div>
                                        {storeTable?.faturaNo && (
                                            <span className="text-white/40 font-mono text-[9px] tracking-wider px-1">
                                                {storeTable.faturaNo}
                                                {mergedFaturas.length > 0 && ` + ${mergedFaturas.join(' + ')}`}
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        <div
                            onClick={() => setShowCustomerModal(true)}
                            className={cn(
                                "flex items-center gap-2.5 px-5 py-2.5 transition-all cursor-pointer group rounded-2xl my-auto whitespace-nowrap border active:scale-95",
                                selectedCustomer
                                    ? "bg-white/25 text-white border-white/30 shadow-xl"
                                    : "text-white/60 hover:text-white bg-white/5 hover:bg-white/15 border-transparent"
                            )}
                        >
                            <Users className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                            <span className="text-[13px] font-bold uppercase tracking-tight leading-none truncate max-w-[140px]">
                                {selectedCustomer?.name || 'MÜŞTERİ SEÇ'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* SECONDARY ACTION BAR (Plate Chips & Actions) */}
                <div
                    className="flex items-center justify-between px-6 z-10 shrink-0 overflow-x-auto no-scrollbar border-b border-white/10"
                    style={{
                        background: 'linear-gradient(to bottom, #2563eb, #1d4ed8)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 6px -1px rgba(0,0,0,0.1)'
                    }}
                >
                    <div className="flex items-center gap-5 py-2.5 flex-1">
                        {/* Plate Chips */}
                        {table && (
                            <div className="flex items-center gap-3 flex-wrap min-h-[44px]">
                                <button
                                    onClick={() => setActivePlate(null)}
                                    className={cn(
                                        'px-4 py-1.5 rounded-xl text-[11px] font-bold transition-all border outline-none min-h-[36px] uppercase tracking-wider',
                                        activePlate === null
                                            ? 'bg-white text-blue-600 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)] z-10 scale-105'
                                            : 'bg-white/5 text-white/90 border-white/10 hover:bg-white/15 backdrop-blur-sm'
                                    )}
                                >
                                    HEPSİ
                                    {cart.filter(ci => !(ci as any).plate).length > 0 && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-blue-900/40 rounded-md text-[9px] font-black">{cart.filter(ci => !(ci as any).plate).length}</span>
                                    )}
                                </button>

                                {plates.map((p, i) => {
                                    const pal = PLATE_PALETTE[i % PLATE_PALETTE.length];
                                    const count = cart.filter(ci => (ci as any).plate === p).length;
                                    const isActive = activePlate === p;
                                    return editingPlateIdx === i ? (
                                        <input
                                            key={i}
                                            autoFocus
                                            style={{ backgroundColor: pal.bg, color: pal.text, borderColor: pal.border }}
                                            className="px-3.5 py-1.5 rounded-lg border text-[10.5px] font-black w-24 outline-none shadow-inner min-h-[34px]"
                                            value={p}
                                            onChange={e => { const next = [...plates]; next[i] = e.target.value; setPlates(next); }}
                                            onBlur={() => setEditingPlateIdx(null)}
                                            onKeyDown={e => { if (e.key === 'Enter') setEditingPlateIdx(null); }}
                                        />
                                    ) : (
                                        <button
                                            key={i}
                                            onClick={() => setActivePlate(isActive ? null : p)}
                                            onContextMenu={(e) => { e.preventDefault(); setEditingPlateIdx(i); }}
                                            style={isActive
                                                ? { backgroundColor: '#ffffff', color: pal.text, borderColor: '#ffffff' }
                                                : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#ffffff', borderColor: 'rgba(255,255,255,0.1)' }}
                                            className={cn(
                                                'flex items-center gap-2 px-4 py-1.5 rounded-xl border text-[11px] font-bold transition-all select-none outline-none min-h-[36px] backdrop-blur-sm',
                                                isActive ? 'shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-105 z-10' : 'hover:bg-white/15'
                                            )}
                                        >
                                            <Utensils className={cn("w-3.5 h-3.5", isActive ? "text-blue-500" : "text-white/40")} />
                                            <span className="tracking-wide uppercase italic opacity-90">{p}</span>
                                            {count > 0 && (
                                                <span className={cn('text-[9px] min-w-[18px] h-4.5 flex items-center justify-center rounded-md px-1 font-black ml-1',
                                                    isActive ? 'bg-blue-50 text-blue-600' : 'bg-white/10'
                                                )}>{count}</span>
                                            )}
                                        </button>
                                    );
                                })}

                                <button
                                    onClick={() => { const n = `TABAK-${plates.length + 1}`; setPlates(prev => [...prev, n]); }}
                                    className="px-4 py-1.5 rounded-xl border border-dashed border-white/20 text-[10px] font-black text-white/30 hover:border-white/60 hover:text-white transition-all hover:bg-white/5 min-h-[36px] flex items-center gap-1.5"
                                >
                                    <Plus className="w-3 h-3" />
                                    YENİ
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4 shrink-0 py-2 ml-4">
                        {/* Cart View Toggle */}
                        <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md p-1 rounded-xl border border-white/20 shadow-inner">
                            <button
                                onClick={() => setCartView('table')}
                                className={cn(
                                    "p-2 rounded-lg transition-all active:scale-90",
                                    cartView === 'table'
                                        ? "bg-white text-blue-600 shadow-md"
                                        : "text-white/40 hover:text-white hover:bg-white/10"
                                )}
                                title="Tablo Görünümü"
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCartView('card')}
                                className={cn(
                                    "p-2 rounded-lg transition-all active:scale-90",
                                    cartView === 'card'
                                        ? "bg-white text-blue-600 shadow-md"
                                        : "text-white/40 hover:text-white hover:bg-white/10"
                                )}
                                title="Kart Görünümü"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>

                        <button
                            onClick={() => cart.length > 0 && setShowKitchenConfirm(true)}
                            disabled={cart.length === 0}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-100 border border-emerald-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-30 shadow-lg font-black text-[12px] tracking-wide"
                        >
                            <ChefHat className="w-4.5 h-4.5" /> MUTFAK
                        </button>

                        {table && (
                            <>
                                <button
                                    onClick={() => onRequestMoveTable ? onRequestMoveTable() : setShowMoveTableModal(true)}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/40 text-amber-100 border border-amber-500/30 transition-all hover:scale-105 active:scale-95 shadow-lg font-black text-[12px] tracking-wide"
                                >
                                    <RotateCcw className="w-4.5 h-4.5" /> MASA TAŞI
                                </button>
                                <button
                                    onClick={() => setShowSplitBillModal(true)}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-100 border border-indigo-500/30 transition-all hover:scale-105 active:scale-95 shadow-lg font-black text-[12px] tracking-wide"
                                >
                                    <UtensilsCrossed className="w-4.5 h-4.5" /> ADİSYON PARÇALA
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── MAIN BODY ──────────────────────────────────────────── */}
            <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">

                {/* ── LEFT SIDEBAR ────────────────────────────────────── */}
                <aside className="w-[200px] bg-slate-50 border-r border-slate-200 overflow-y-auto shrink-0 flex flex-col shadow-inner z-10 pb-8 content-start">
                    {/* All categories button */}
                    <div className="px-3 mt-6 mb-3">
                        <button
                            onClick={() => setSelectedCat(null)}
                            className={cn(
                                'w-full rounded-[20px] flex items-center gap-3.5 px-5 py-4.5 transition-all text-left group shadow-lg active:scale-95 border-2',
                                !selectedCat
                                    ? 'bg-blue-600 text-white font-black border-blue-400 shadow-blue-500/20'
                                    : 'text-slate-600 bg-white hover:bg-slate-50 font-bold border-transparent hover:border-slate-200'
                            )}
                        >
                            <div className={cn(
                                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-all",
                                !selectedCat ? "bg-white/20 rotate-12" : "bg-blue-50 group-hover:rotate-12"
                            )}>
                                <Utensils className={cn("w-5.5 h-5.5 transition-transform", !selectedCat ? "text-white" : "text-blue-500")} />
                            </div>
                            <span className="text-[14px] font-black uppercase tracking-widest flex-1">TÜMÜ</span>
                        </button>
                    </div>

                    {
                        groups.map((group, groupIndex) => (
                            <div key={group.name} className={cn("px-1", groupIndex > 0 && "mt-4 pt-4 border-t border-slate-200/60")}>
                                {/* Group label */}
                                <div className="mx-4 mb-2 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 bg-transparent">
                                        {group.name}
                                    </span>
                                    <div className="h-[1px] flex-1 ml-4 bg-slate-200/50" />
                                </div>

                                {/* Category list */}
                                <div className="px-3 flex flex-col items-stretch space-y-2">
                                    {group.cats.map((cat, ci) => {
                                        const active = selectedCat === cat;
                                        const emojis = ['🥩', '🍗', '🦐', '🫓', '🍰', '🍔', '🥐', '🍲', '🍱', '🍕', '🥤', '☕'];
                                        const emoji = emojis[ci % emojis.length];
                                        return (
                                            <button
                                                key={`${groupIndex}-${cat}-${ci}`}
                                                onClick={() => setSelectedCat(active ? null : cat)}
                                                className={cn(
                                                    'w-full rounded-[18px] flex items-center gap-3.5 px-4.5 py-3.5 transition-all text-left border-2 group active:scale-[0.97]',
                                                    active
                                                        ? 'bg-white text-blue-600 font-black border-blue-500 shadow-lg shadow-blue-500/10'
                                                        : 'text-slate-500 bg-transparent hover:bg-white hover:text-slate-900 border-transparent hover:border-slate-200'
                                                )}
                                            >
                                                <span className={cn(
                                                    "text-[18px] shrink-0 opacity-90 transition-transform group-hover:scale-110",
                                                    active ? "scale-110" : ""
                                                )}>{emoji}</span>
                                                <span className="text-[13px] font-bold tracking-tight leading-tight uppercase truncate">{cat}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    }
                </aside>

                {/* ── PRODUCTS GRID ────────────────────────────────────── */}
                <main className="flex-1 min-w-0 overflow-y-auto p-2 bg-[#f4f6fb]">
                    <div className="grid grid-cols-4 xl:grid-cols-5 xxl:grid-cols-6 gap-2 content-start">
                        {filtered.map(product => {
                            const cat = Array.isArray(product.category) ? product.category[0] : product.category;

                            /* Unsplash fallback per category keyword */
                            const unsplashMap: Record<string, string> = {
                                'kırmızı et': 'https://images.unsplash.com/photo-1558030006-450675393462?w=300&h=200&fit=crop&auto=format',
                                'beyaz et': 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=300&h=200&fit=crop&auto=format',
                                'tavuk': 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=300&h=200&fit=crop&auto=format',
                                'deniz': 'https://images.unsplash.com/photo-1565680018093-ebb6b9ab5460?w=300&h=200&fit=crop&auto=format',
                                'balık': 'https://images.unsplash.com/photo-1565680018093-ebb6b9ab5460?w=300&h=200&fit=crop&auto=format',
                                'pide': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=300&h=200&fit=crop&auto=format',
                                'pizza': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=300&h=200&fit=crop&auto=format',
                                'tatlı': 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=300&h=200&fit=crop&auto=format',
                                'fast food': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=200&fit=crop&auto=format',
                                'burger': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&h=200&fit=crop&auto=format',
                                'kahvaltı': 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=300&h=200&fit=crop&auto=format',
                                'çorba': 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=300&h=200&fit=crop&auto=format',
                                'salata': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&h=200&fit=crop&auto=format',
                                'makarna': 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=300&h=200&fit=crop&auto=format',
                                'içecek': 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=300&h=200&fit=crop&auto=format',
                                'kahve': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=300&h=200&fit=crop&auto=format',
                            };

                            const catLower = (cat ?? '').toLowerCase();
                            const fallbackImg = Object.entries(unsplashMap).find(([k]) => catLower.includes(k))?.[1]
                                ?? 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&h=200&fit=crop&auto=format';

                            const imgSrc = product.image_url || fallbackImg;

                            return (
                                <button
                                    key={product.id}
                                    onMouseDown={() => startLongPress(product)}
                                    onMouseUp={() => handleProductClick(product)}
                                    onMouseLeave={cancelLongPress}
                                    onTouchStart={() => startLongPress(product)}
                                    onTouchEnd={() => handleProductClick(product)}
                                    className="bg-white rounded-[24px] border border-slate-200 flex flex-col text-left cursor-pointer hover:shadow-2xl hover:border-blue-400 transition-all overflow-hidden group hover:-translate-y-1.5 select-none relative active:scale-95"
                                >
                                    {/* Product image */}
                                    <div className="h-[90px] w-full overflow-hidden bg-slate-50 shrink-0 relative">
                                        <img
                                            src={imgSrc}
                                            alt={product.name}
                                            className="w-full h-full object-cover group-hover:scale-125 transition-transform duration-700 ease-in-out"
                                            onError={e => {
                                                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&h=200&fit=crop&auto=format';
                                            }}
                                        />
                                        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/40 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300" />

                                        {/* Quick Add Badge */}
                                        <div className="absolute top-2 right-2 w-8 h-8 rounded-xl bg-white/90 backdrop-blur-md flex items-center justify-center text-blue-600 shadow-xl scale-0 group-hover:scale-100 transition-all duration-300 transform opacity-0 group-hover:opacity-100 rotate-12 group-hover:rotate-0">
                                            <Plus className="w-5 h-5 font-black" />
                                        </div>
                                    </div>

                                    {/* Card body */}
                                    <div className="px-3.5 py-3 flex flex-col gap-1.5 flex-1 justify-between bg-white relative">
                                        <div>
                                            <div className="text-[10px] font-black text-blue-500/80 mb-1 flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                <span className="uppercase tracking-[0.15em]">{cat}</span>
                                            </div>
                                            <div className="text-[14px] font-black text-slate-800 leading-[1.3] line-clamp-2 min-h-[36px] group-hover:text-blue-700 transition-colors flex items-center gap-2">
                                                {product.name}
                                                {product.stock <= (product.min_stock || 5) && (
                                                    <span className="shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Düşük Stok" />
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2.5 flex items-center justify-between border-t border-slate-50 pt-2.5">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">FİYAT</span>
                                                <div className="text-[16px] font-black text-[#1a56db] tracking-tighter leading-none">
                                                    {fmt(product.price)}
                                                </div>
                                            </div>
                                            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-inner group-hover:shadow-blue-500/50">
                                                <ShoppingBag className="w-4.5 h-4.5" />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </main>

                {/* ── RIGHT ORDER PANEL ────────────────────────────────── */}
                <aside
                    className="bg-white border-l border-gray-200 flex flex-col overflow-hidden"
                    style={{ width: '520px', minWidth: '520px', maxWidth: '520px', flexShrink: 0, flexGrow: 0 }}
                >

                    {/* ── CART ITEMS ── */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-slate-50/50 flex flex-col">


                        {cart.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center opacity-40">
                                    <div className="text-6xl mb-4">🛒</div>
                                    <p className="text-slate-500 font-bold uppercase tracking-wider text-sm">Sipariş Boş</p>
                                    <p className="text-[11px] mt-1 text-slate-500 font-medium tracking-wide">Ürün eklemek için sol taraftaki menüyü kullanın</p>
                                </div>
                            </div>
                        ) : cartView === 'card' ? (
                            /* MarketPOS Premium Card View for RestPOS */
                            <div className="p-3 space-y-2.5">
                                {cart.map((item, idx) => {
                                    if (activePlate && (item as any).plate !== activePlate) return null;
                                    const hasDiscount = item.discount > 0;
                                    const plateIdx = plates.indexOf((item as any).plate);
                                    const plateColor = (item as any).plate && plateIdx !== -1 ? PLATE_PALETTE[plateIdx % PLATE_PALETTE.length].text : '#2563eb';

                                    return (
                                        <div
                                            key={`${item.product.id}-${idx}`}
                                            className={cn(
                                                "rounded-[16px] border transition-all flex flex-col relative overflow-hidden bg-white select-none",
                                                expandedCartItem === idx
                                                    ? "shadow-2xl border-blue-400 ring-4 ring-blue-500/10 z-10 -translate-y-0.5 cart-item-expanded"
                                                    : "border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300"
                                            )}
                                            onDoubleClick={() => updateQty(idx, 1)}
                                        >
                                            {/* Top color indicator */}
                                            <div className="absolute top-0 left-0 bottom-0 w-1 shadow-[2px_0_10px_rgba(0,0,0,0.05)]" style={{ backgroundColor: plateColor }} />

                                            <div
                                                className="flex items-center p-2.5 pl-4 gap-3 cursor-pointer"
                                                onMouseDown={() => {
                                                    longPressTimerRef.current = setTimeout(() => {
                                                        setExpandedCartItem(expandedCartItem === idx ? null : idx);
                                                        isLongPress.current = true;
                                                    }, 500);
                                                }}
                                                onMouseUp={() => {
                                                    if (longPressTimerRef.current) {
                                                        clearTimeout(longPressTimerRef.current);
                                                        longPressTimerRef.current = null;
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    if (longPressTimerRef.current) {
                                                        clearTimeout(longPressTimerRef.current);
                                                        longPressTimerRef.current = null;
                                                    }
                                                }}
                                                onTouchStart={() => {
                                                    longPressTimerRef.current = setTimeout(() => {
                                                        setExpandedCartItem(expandedCartItem === idx ? null : idx);
                                                        isLongPress.current = true;
                                                    }, 500);
                                                }}
                                                onTouchEnd={() => {
                                                    if (longPressTimerRef.current) {
                                                        clearTimeout(longPressTimerRef.current);
                                                        longPressTimerRef.current = null;
                                                    }
                                                }}
                                            >
                                                {/* Qty Badge Premium */}
                                                <div
                                                    className="flex-shrink-0 w-11 h-11 rounded-[12px] text-white flex flex-col items-center justify-center shadow-md transition-transform active:scale-90"
                                                    style={{ backgroundColor: plateColor, boxShadow: `0 4px 10px ${plateColor}33` }}
                                                >
                                                    <div className="text-[16px] font-black leading-none drop-shadow-sm">{item.quantity}</div>
                                                    <div className="text-[8px] font-black opacity-80 leading-none mt-0.5 uppercase tracking-tighter">{item.product.unit || 'ADET'}</div>
                                                </div>

                                                <div className="flex-1 min-w-0 pr-12 flex items-center">
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <h4 className="font-extrabold text-slate-900 truncate text-[14px] leading-tight tracking-tight">{item.product.name}</h4>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <div className="text-[14px] font-black text-blue-600 tabular-nums leading-none">
                                                                {fmt(item.subtotal ?? 0)}
                                                            </div>
                                                            <PlateBadge plate={(item as any).plate} plates={plates} onCycle={(e) => { e.stopPropagation(); cycleItemPlate(idx); }} />
                                                            {hasDiscount && (
                                                                <div className="px-1 py-0.5 bg-orange-100 text-orange-600 rounded text-[8px] font-black uppercase">
                                                                    %{item.discount}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {(item as any).note && (
                                                            <div className="inline-flex mt-1 text-[9px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg font-bold items-center gap-1 border border-amber-100/50 w-fit">
                                                                <StickyNote className="w-2.5 h-2.5" />
                                                                <span className="truncate max-w-[120px]">{(item as any).note}</span>
                                                            </div>
                                                        )}
                                                        {(item as any).sourceTableNumber && (item as any).sourceTableNumber !== table?.number && (
                                                            <div className="inline-flex mt-1 items-center gap-1.5 flex-wrap">
                                                                <span className="text-[9px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                                                    Masa {(item as any).sourceTableNumber}&apos;ten
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={e => { e.stopPropagation(); setMoveItemToTable({ itemId: (item as any).id, itemName: item.product?.name ?? '' }); setTargetTableId(null); }}
                                                                    className="text-[9px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1"
                                                                >
                                                                    <ArrowRightLeft className="w-3 h-3" /> Başka masaya taşı
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right Minus / İptal — basınca iptal sebep modalı açılır, kayıt altına alınır */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openVoidForCartItem(idx); }}
                                                    style={{ backgroundColor: '#dc2626' }}
                                                    className="absolute top-0 right-0 bottom-0 w-10 flex items-center justify-center transition-all active:scale-95"
                                                    title="İptal / İade"
                                                >
                                                    <Minus className="w-6 h-6 text-white font-black" />
                                                </button>
                                            </div>

                                            {/* Action Overlay when expanded */}
                                            {expandedCartItem === idx && (
                                                <div className="bg-blue-50/50 border-t border-blue-100 p-2 flex items-center justify-center gap-1.5 transform transition-all duration-200 z-10" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => updateItemDiscount(idx, 100)} className="flex-1 h-8 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] uppercase flex items-center justify-center gap-1.5 transition-colors active:scale-95 shadow-sm">
                                                        <Percent className="w-3 h-3 border border-white/40 rounded p-0.5" />
                                                        İkram / İndirim
                                                    </button>
                                                    <div className="relative flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden h-8 shadow-sm flex-1 max-w-[140px]">
                                                        <span className="pl-2 text-slate-400"><MessageSquareMore className="w-3.5 h-3.5" /></span>
                                                        <input
                                                            type="text"
                                                            placeholder="Not ekle..."
                                                            className="w-full px-1.5 py-1 text-[10px] font-bold text-slate-700 outline-none placeholder:text-slate-400 focus:bg-yellow-50/30 transition-colors"
                                                            value={(item as any).note || ''}
                                                            onChange={e => updateItemNote(idx, e.target.value)}
                                                        />
                                                    </div>
                                                    <button onClick={() => openVoidForCartItem(idx)} className="flex-1 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] uppercase flex items-center justify-center gap-1.5 transition-colors active:scale-95 shadow-sm max-w-[60px]">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        SİL
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* MarketPOS Premium Table View for RestPOS */
                            <div className="flex flex-col m-3 rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead className="bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800">
                                        <tr>
                                            <th className="px-3 py-3 text-left text-[11px] font-black text-white/90 uppercase tracking-wider w-8" />
                                            <th className="px-3 py-3 text-left text-[11px] font-black text-white/90 uppercase tracking-wider border-l border-blue-500/30">Ürün Adı</th>
                                            <th className="px-3 py-3 text-center text-[11px] font-black text-white/90 uppercase tracking-wider border-l border-blue-500/30 w-[120px]">Miktar</th>
                                            <th className="px-3 py-3 text-right text-[11px] font-black text-white/90 uppercase tracking-wider border-l border-blue-500/30 w-[85px]">Fiyat</th>
                                            <th className="px-3 py-3 text-right text-[11px] font-black text-white/90 uppercase tracking-wider border-l border-blue-500/30 w-[90px]">Toplam</th>
                                            <th className="px-2 py-3 text-center text-[11px] font-black text-white/90 uppercase tracking-wider border-l border-blue-500/30 w-12">
                                                ⚙️
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {cart.map((item, idx) => {
                                            if (activePlate && (item as any).plate !== activePlate) return null;
                                            const hasDiscount = item.discount > 0;
                                            const plateIdx = plates.indexOf((item as any).plate);
                                            const plateColor = (item as any).plate && plateIdx !== -1 ? PLATE_PALETTE[plateIdx % PLATE_PALETTE.length].text : '#2563eb';

                                            return (
                                                <React.Fragment key={`${item.product.id}-${idx}`}>
                                                    <tr
                                                        className={cn(
                                                            "transition-colors group cursor-pointer",
                                                            expandedCartItem === idx ? "bg-blue-50/50" : "hover:bg-slate-50"
                                                        )}
                                                        onClick={() => setExpandedCartItem(expandedCartItem === idx ? null : idx)}
                                                        onDoubleClick={() => updateQty(idx, 1)}
                                                    >
                                                        <td className="relative px-2 py-2.5 text-center">
                                                            <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: plateColor }} />
                                                            <span className="text-[12px] font-black text-slate-400">{idx + 1}</span>
                                                        </td>
                                                        <td className="px-3 py-2.5 border-l border-transparent">
                                                            <div className="flex flex-col justify-center gap-0.5">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <div className={cn(
                                                                        "text-[13px] font-bold leading-tight",
                                                                        item.kitchenStatus && item.kitchenStatus !== 'pending'
                                                                            ? "text-slate-400"
                                                                            : "text-slate-900"
                                                                    )}>
                                                                        {item.product.name}
                                                                    </div>
                                                                    <div className="flex-shrink-0">
                                                                        <PlateBadge plate={(item as any).plate} plates={plates} onCycle={(e) => { e.stopPropagation(); cycleItemPlate(idx); }} />
                                                                    </div>
                                                                    {/* Mutfak durum badge */}
                                                                    {item.kitchenStatus && item.kitchenStatus !== 'pending' && (() => {
                                                                        const ksCfg: Record<string, { label: string; bg: string; color: string }> = {
                                                                            cooking: { label: '🍳 Mutfakta', bg: '#ffedd5', color: '#ea580c' },
                                                                            ready: { label: '✅ Hazır', bg: '#dcfce7', color: '#16a34a' },
                                                                            served: { label: '🍽 Servis', bg: '#f5f3ff', color: '#7c3aed' },
                                                                        };
                                                                        const cfg = ksCfg[item.kitchenStatus!];
                                                                        return cfg ? (
                                                                            <span
                                                                                style={{ backgroundColor: cfg.bg, color: cfg.color }}
                                                                                className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
                                                                            >
                                                                                {cfg.label}
                                                                            </span>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                                {(item as any).note && (
                                                                    <div className="text-[10px] text-yellow-600 font-bold flex items-center gap-1 bg-yellow-50 px-1.5 py-0.5 w-fit rounded">
                                                                        📝 {(item as any).note}
                                                                    </div>
                                                                )}
                                                                {(item as any).sourceTableNumber && (item as any).sourceTableNumber !== table?.number && (
                                                                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                                        <span className="text-[9px] font-black text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                                            Masa {(item as any).sourceTableNumber}&apos;ten
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={e => { e.stopPropagation(); setMoveItemToTable({ itemId: (item as any).id, itemName: item.product?.name ?? '' }); setTargetTableId(null); }}
                                                                            className="text-[9px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1"
                                                                        >
                                                                            <ArrowRightLeft className="w-2.5 h-2.5" /> Taşı
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td className="px-2 py-2.5 border-l border-gray-100" onClick={e => e.stopPropagation()}>
                                                            <div className="flex items-center justify-between bg-white rounded-lg p-0.5 border border-slate-200 max-w-[100px] mx-auto shadow-sm">
                                                                <button onClick={() => updateQty(idx, -1)} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-all active:scale-95">
                                                                    <Minus className="w-4 h-4" />
                                                                </button>
                                                                <div className="flex flex-col items-center min-w-[30px]">
                                                                    <span className="text-[14px] font-black text-slate-900 leading-none">{item.quantity}</span>
                                                                </div>
                                                                <button onClick={() => updateQty(idx, 1)} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-all active:scale-95">
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right border-l border-gray-100">
                                                            <div className="text-[12px] font-bold text-slate-700 tabular-nums">
                                                                {fmt(item.product.price)}
                                                            </div>
                                                            {hasDiscount && (
                                                                <div className="text-[10px] text-orange-500 font-bold whitespace-nowrap bg-orange-50 px-1 py-0.5 rounded ml-auto w-fit mt-0.5">
                                                                    %{item.discount} İnd.
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right border-l border-gray-100">
                                                            <div className="text-[14px] font-black text-blue-700 tabular-nums">
                                                                {fmt(item.subtotal ?? 0)}
                                                            </div>
                                                        </td>
                                                        <td className="px-2 py-2.5 text-center border-l border-gray-100" onClick={e => e.stopPropagation()}>
                                                            <div className="flex flex-col gap-1">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openVoidForCartItem(idx); setExpandedCartItem(null); }}
                                                                    className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold transition-colors border border-red-100/50"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                    <span className="text-[11px] uppercase tracking-wide">SİL</span>
                                                                </button>

                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setDiscountInput(String(item.discount ?? 0)); setShowDiscountModal(true); }}
                                                                    className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold transition-colors border border-emerald-100/50"
                                                                >
                                                                    <Percent className="w-4 h-4" />
                                                                    <span className="text-[11px] uppercase tracking-wide">İNDİRİM</span>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {/* Expanded Row for Table View */}
                                                    {expandedCartItem === idx && (
                                                        <tr className="bg-blue-50/40 border-b border-blue-100 shadow-inner">
                                                            <td colSpan={6} className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                                                <div className="flex items-center gap-2 justify-end">
                                                                    <button
                                                                        onClick={() => updateItemDiscount(idx, 100)}
                                                                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[10px] font-black uppercase transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
                                                                    >
                                                                        <Percent className="w-3.5 h-3.5 border border-white/40 p-0.5 rounded" /> İkram / İnd
                                                                    </button>
                                                                    <div className="relative flex items-center bg-white border border-blue-200/60 rounded-lg overflow-hidden flex-1 shadow-sm max-w-[250px]">
                                                                        <span className="pl-2.5 text-blue-400"><MessageSquareMore className="w-3.5 h-3.5" /></span>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Ürün notu (örn: az pişmiş)"
                                                                            className="w-full px-2 py-2 text-[12px] font-bold text-slate-700 outline-none placeholder:text-slate-400 focus:bg-yellow-50/20"
                                                                            value={(item as any).note || ''}
                                                                            onChange={e => updateItemNote(idx, e.target.value)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    {/* ── TOTALS ────────────────────────────────────── */}
                    <div className="shrink-0 bg-white border-t border-slate-200 p-5 space-y-3 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] relative z-20">
                        <div className="space-y-2">
                            <div className="flex justify-between text-slate-500 items-center">
                                <span className="text-[12px] font-bold uppercase tracking-widest opacity-60">Ara Toplam</span>
                                <span className="text-[14px] font-black tabular-nums">{fmt(subtotal)}</span>
                            </div>
                            {orderDiscount > 0 && (
                                <div className="flex justify-between text-orange-600 items-center bg-orange-50/50 px-3 py-1.5 rounded-xl border border-orange-100/50">
                                    <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide">
                                        <Tag className="w-3.5 h-3.5" />
                                        İNDİRİM (%{orderDiscount})
                                    </span>
                                    <span className="tabular-nums font-black text-[14px]">- {fmt(discountAmount)}</span>
                                </div>
                            )}
                            {orderNote && (
                                <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                                    <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                                    <span className="font-bold italic line-clamp-2">{orderNote}</span>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">GÜNCEL TOPLAM</span>
                                <div className="flex items-center gap-2">
                                    <Calculator className="w-5 h-5 text-blue-600 drop-shadow-sm" />
                                    <span className="font-black text-slate-900 text-[15px] uppercase tracking-tighter">NET ÖDEME</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[34px] font-black text-slate-900 tabular-nums leading-none tracking-tighter drop-shadow-sm">
                                    {fmt(grandTotal)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── PAYMENT BUTTONS ───────────────────────────── */}
                    <div className="flex items-stretch shrink-0 bg-slate-50 border-t border-slate-200">
                        <button
                            onClick={handleOpenPayment}
                            disabled={cart.length === 0}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 hover:bg-emerald-500 hover:text-white group transition-all active:scale-95 disabled:opacity-40 border-r border-slate-200"
                        >
                            <Banknote className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
                            <span className="text-[11px] font-black uppercase tracking-widest">NAKİT</span>
                        </button>
                        <button
                            onClick={handleOpenPayment}
                            disabled={cart.length === 0}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 hover:bg-blue-600 hover:text-white group transition-all active:scale-95 disabled:opacity-40 border-r border-slate-200"
                        >
                            <CreditCard className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                            <span className="text-[11px] font-black uppercase tracking-widest">K. KARTI</span>
                        </button>
                        <button
                            onClick={handleOpenPayment}
                            disabled={cart.length === 0}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 hover:bg-indigo-600 hover:text-white group transition-all active:scale-95 disabled:opacity-40 border-r border-slate-200"
                        >
                            <Ticket className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                            <span className="text-[11px] font-black uppercase tracking-widest">YEMEK ÇEKI</span>
                        </button>
                        <button
                            onClick={handleOpenPayment}
                            disabled={cart.length === 0}
                            className="flex-1 flex flex-col items-center justify-center gap-1.5 py-5 hover:bg-purple-600 hover:text-white group transition-all active:scale-95 disabled:opacity-40 border-r border-slate-200"
                        >
                            <LayoutGrid className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                            <span className="text-[11px] font-black uppercase tracking-widest">PARÇALI</span>
                        </button>

                        <div className="flex flex-col bg-white border-l border-slate-200">
                            <button
                                onClick={() => setShowNoteModal(true)}
                                className="w-14 h-1/2 flex items-center justify-center hover:bg-amber-50 transition-colors border-b border-slate-100"
                                title="Sipariş Notu"
                            >
                                <MessageSquareMore className={cn("w-5.5 h-5.5", orderNote ? "text-amber-500 animate-pulse" : "text-slate-300")} />
                            </button>
                            <button
                                onClick={() => setShowPrintPreview(true)}
                                disabled={cart.length === 0}
                                className="w-14 h-1/2 flex items-center justify-center hover:bg-blue-50 transition-colors border-b border-slate-100 disabled:opacity-20"
                                title="Adisyon Yazdır (80mm)"
                            >
                                <Printer className={cn("w-5.5 h-5.5", cart.length > 0 ? "text-blue-500" : "text-slate-300")} />
                            </button>
                        </div>
                    </div>
                </aside>
            </div>

            {/* ── MODALS ──────────────────────────────────────────────── */}

            {/* Print Preview Modal (80mm) — ödeme öncesi adisyon */}
            {showPrintPreview && table && (
                <Receipt80mm
                    sale={{
                        id: 'preview',
                        receiptNumber: receiptNumber || 'ADİSYON',
                        date: new Date().toISOString(),
                        items: cart.map(item => ({
                            productId: item.product?.id || (item as any).id,
                            productName: item.product?.name || (item as any).name,
                            quantity: item.quantity,
                            price: item.price || item.product?.price,
                            discount: item.discount || 0,
                            total: item.subtotal ?? (item.price * item.quantity),
                            variant: item.variant
                        })),
                        subtotal: subtotal,
                        discount: discountAmount,
                        total: grandTotal,
                        cashier: typeof currentStaff === 'object' ? (currentStaff as any)?.name : (currentStaff || waiter || ''),
                        table: table.number.toString(),
                    }}
                    paymentData={{ payments: [], totalPaid: 0, change: 0 }}
                    onClose={() => setShowPrintPreview(false)}
                />
            )}

            {/* ── MODALS ──────────────────────────────────────────────── */}

            {/* Payment Modal */}
            {showPaymentModal && (
                <POSPaymentModal
                    total={grandTotal}
                    subtotal={subtotal}
                    itemDiscount={0}
                    campaignDiscount={discountAmount}
                    selectedCampaign={null}
                    selectedCustomer={selectedCustomer}
                    onClose={() => setShowPaymentModal(false)}
                    onComplete={handlePaymentComplete}
                />
            )}

            {/* Receipt80mm — ödeme sonrası fiş önizleme */}
            {completedSaleForPrint && (
                <Receipt80mm
                    sale={completedSaleForPrint}
                    paymentData={completedSaleForPrint.payment}
                    onClose={handleClosePrintReceipt}
                />
            )}

            {/* Sales History Modal */}
            {showHistoryModal && (
                <POSSalesHistoryModal
                    sales={salesHistory}
                    onClose={() => setShowHistoryModal(false)}
                />
            )}

            {/* Return Modal — iade sebep zorunlu, kayıt altına alınır */}
            {showReturnModal && (
                <POSReturnModal
                    sales={salesHistory}
                    onClose={() => setShowReturnModal(false)}
                    onReturnComplete={async (returnData: any) => {
                        const reason = returnData?.returnReason || 'Belirtilmedi';
                        const staffName = returnData?.cashier || waiter || '—';
                        if (returnData?.items?.length) {
                            for (const it of returnData.items) {
                                await RestaurantService.logReturn({
                                    returnNumber: returnData.returnNumber || `IADE-${Date.now()}`,
                                    originalReceipt: returnData.originalReceiptNumber,
                                    productName: it.productName || it.product_name || '—',
                                    productId: it.productId || it.product_id,
                                    quantity: it.quantity || 1,
                                    unitPrice: it.price || it.unit_price || 0,
                                    totalAmount: it.total ?? (it.quantity * (it.price || 0)),
                                    returnReason: reason,
                                    staffName,
                                });
                            }
                        }
                        setShowReturnModal(false);
                        notify('İade işlemi tamamlandı (kayıt altına alındı)');
                    }}
                />
            )}

            {/* Staff PIN Modal */}
            {showStaffModal && (
                <RestaurantStaffPinModal
                    onClose={() => setShowStaffModal(false)}
                    onSelect={(staffName) => { setWaiter(staffName); setShowStaffModal(false); }}
                    skipConfirmation
                />
            )}

            {showCustomerModal && (
                <POSCustomerModal
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onClose={() => setShowCustomerModal(false)}
                    onSelect={handleCustomerSelect}
                />
            )}

            {/* Parked Orders Modal */}
            {showParkedModal && (
                <RestaurantParkedOrdersModal
                    orders={parkedOrders as any[]}
                    onClose={() => setShowParkedModal(false)}
                    onResume={resumeParked as any}
                    onDelete={(id: any) => setParkedOrders((prev: any[]) => prev.filter((x: any) => x.id !== id))}
                    fmt={fmt}
                />
            )}

            {/* Note Modal */}
            {showNoteModal && (
                <RestaurantOrderNoteModal
                    note={orderNote}
                    onNoteChange={setOrderNote}
                    onClose={() => setShowNoteModal(false)}
                    onSave={() => setShowNoteModal(false)}
                    onClear={() => { setOrderNote(''); setShowNoteModal(false); }}
                />
            )}

            {/* Discount Modal */}
            {showDiscountModal && (
                <RestaurantDiscountModal
                    discountInput={discountInput}
                    onDiscountInputChange={setDiscountInput}
                    onClose={() => setShowDiscountModal(false)}
                    onApply={() => {
                        const val = parseFloat(discountInput);
                        setOrderDiscount(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                        setShowDiscountModal(false);
                    }}
                />
            )}

            {/* Kitchen Confirm Modal */}
            {showKitchenConfirm && (
                <RestaurantKitchenConfirmModal
                    cart={cart}
                    table={table}
                    plates={plates}
                    platePalette={PLATE_PALETTE}
                    onClose={() => setShowKitchenConfirm(false)}
                    onConfirm={async () => {
                        setShowKitchenConfirm(false);
                        // Sadece henüz gönderilmemiş (pending) satırlar
                        const pendingCart = cart.filter(item => !item.kitchenStatus || item.kitchenStatus === 'pending');
                        if (pendingCart.length === 0) { notify('Tüm ürünler zaten mutfakta!'); return; }
                        if (table) {
                            try {
                                // Items are already saved to DB via addToCart → addItemToTable
                                // Just send to kitchen (updates item statuses to 'cooking')
                                await sendToKitchen(table.id);

                                // Gönderilen satırları 'cooking' olarak işaretle — bir daha gönderilmez
                                setCart(prev => prev.map(item =>
                                    (!item.kitchenStatus || item.kitchenStatus === 'pending')
                                        ? { ...item, kitchenStatus: 'cooking' as const }
                                        : item
                                ));
                                notify('Sipariş mutfağa gönderildi!');
                                if (onAfterSendToKitchen) {
                                    onAfterSendToKitchen();
                                } else {
                                    onBack?.();
                                }
                            } catch (err: any) {
                                console.error('[RestPOS] sendToKitchen error:', err);
                                const msg = err?.message || String(err);
                                const hint = /relation|column|does not exist|tablo|sütun/i.test(msg)
                                    ? ' Veritabanı migrasyonlarını çalıştırıp uygulamayı yeniden başlatın.'
                                    : '';
                                notify(`HATA: Sipariş mutfağa gönderilirken hata oluştu. ${msg}${hint}`, 'error');
                            }
                        }
                    }}
                    fmt={fmt}
                />
            )}

            {/* Product Options Modal */}
            {showProductOptions && longPressedProduct && (
                <RestaurantProductOptionsModal
                    product={longPressedProduct}
                    onClose={() => setShowProductOptions(false)}
                    onAddToCart={(p, q) => {
                        if (q === 2) {
                            addToCart(p);
                            addToCart(p);
                        } else {
                            addToCart(p);
                        }
                    }}
                    onAddNote={() => setShowNoteModal(true)}
                    onSendToKitchen={() => setShowKitchenConfirm(true)}
                    onMarkComplementary={() => {
                        if (table && longPressedProduct) {
                            markItemAsComplementary(table.id, longPressedProduct.id);
                            notify('İkram olarak işaretlendi');
                        }
                    }}
                    onVoidItem={() => {
                        if (!table || !longPressedProduct) return;
                        const cartItem = cart.find(c => c.product?.id === longPressedProduct.id);
                        const orderItemId = (cartItem as any)?.id;
                        if (!cartItem || !orderItemId) {
                            notify('Bu ürün siparişte bulunamadı veya henüz kaydedilmedi.', 'error');
                            return;
                        }
                        setVoidingItem({
                            tableId: table.id,
                            itemId: orderItemId,
                            name: longPressedProduct.name,
                            quantity: cartItem.quantity,
                        });
                        setShowVoidReasonModal(true);
                    }}
                    fmt={fmt}
                />
            )}

            {/* Notification toast */}
            {notification && (
                <div className={cn(
                    'fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-white text-[14px] font-semibold transition-all',
                    notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
                )}>
                    {notification.type === 'success'
                        ? <CheckCircle className="w-5 h-5" />
                        : <X className="w-5 h-5" />
                    }
                    {notification.msg}
                </div>
            )}

            {/* Move Table Modal veya tek ürün başka masaya taşı */}
            {(showMoveTableModal || moveItemToTable) && table && (
                <RestaurantMoveTableModal
                    currentTable={table}
                    tables={tables}
                    targetTableId={targetTableId}
                    onTargetSelect={setTargetTableId}
                    moveSingleItem={moveItemToTable ?? undefined}
                    onClose={() => { setShowMoveTableModal(false); setMoveItemToTable(null); setTargetTableId(null); }}
                    onConfirm={async (action, targetId, moveScope) => {
                        if (action === 'moveItem' && moveItemToTable && targetId) {
                            try {
                                await moveOrderItemToTable(table.id, moveItemToTable.itemId, targetId);
                                setCart(prev => prev.filter((c: any) => c.id !== moveItemToTable.itemId));
                                notify('Ürün masaya taşındı');
                                setShowMoveTableModal(false);
                                setMoveItemToTable(null);
                                setTargetTableId(null);
                            } catch (e) {
                                console.error('Move item error', e);
                                notify('Ürün taşınırken hata oluştu', 'error');
                            }
                            return;
                        }
                        if (table && targetId) {
                            try {
                                if (action === 'move') {
                                    const sourceTableId = (moveScope === 'all' || !moveScope) ? table.id : moveScope.tableId;
                                    await moveTable(sourceTableId, targetId);
                                    notify(moveScope !== 'all' && moveScope ? 'İşlem taşındı' : 'Masa başarıyla taşındı');
                                } else {
                                    await mergeTables(table.id, targetId);
                                    notify('Masalar birleştirildi');
                                }
                                setShowMoveTableModal(false);
                                setTargetTableId(null);
                                onBack?.();
                            } catch (error) {
                                console.error(action === 'move' ? 'Move table error' : 'Merge tables error', error);
                                notify(action === 'move' ? 'Masa taşınırken bir hata oluştu' : 'Masalar birleştirilirken bir hata oluştu', 'error');
                            }
                        }
                    }}
                />
            )}

            {/* Split Bill Modal */}
            {showSplitBillModal && table && (
                <RestaurantSplitBillModal
                    cart={cart}
                    selectedItems={splitSelectedItems}
                    onToggleItem={(idx) => {
                        setSplitSelectedItems(prev =>
                            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                        );
                    }}
                    onClose={() => { setShowSplitBillModal(false); setSplitSelectedItems([]); }}
                    onConfirm={async () => {
                        if (table?.activeOrderId && splitSelectedItems.length > 0) {
                            const itemIds = splitSelectedItems
                                .map(idx => (cart[idx] as any).id)
                                .filter(Boolean);

                            if (itemIds.length === 0) {
                                notify('Sadece mutfağa gönderilmiş ürünler parçalanabilir', 'error');
                                return;
                            }

                            try {
                                await splitOrder(table.activeOrderId, itemIds);
                                setShowSplitBillModal(false);
                                setSplitSelectedItems([]);
                                notify('Adisyon başarıyla parçalandı');
                                onBack?.();
                            } catch (err: any) {
                                notify(err.message || 'Parçalama başarısız', 'error');
                            }
                        } else {
                            notify('Sipariş henüz kaydedilmemiş', 'error');
                        }
                    }}
                    fmt={fmt}
                />
            )}
            {/* Void Reason Modal */}
            {showVoidReasonModal && table && voidingItem && (
                <RestaurantVoidReasonModal
                    itemName={voidingItem.name}
                    quantity={voidingItem.quantity}
                    reason={voidReason}
                    onReasonChange={setVoidReason}
                    onClose={() => { setShowVoidReasonModal(false); setVoidingItem(null); setVoidReason(''); }}
                    onConfirm={async (reason: string, voidQuantity: number) => {
                        if (!reason?.trim()) return;
                        const itemId = voidingItem?.itemId;
                        const totalQty = voidingItem?.quantity ?? 1;
                        await voidOrderItem(table?.id || '', itemId || '', reason.trim(), voidQuantity);
                        setShowVoidReasonModal(false);
                        setVoidingItem(null);
                        setVoidReason('');
                        notify(voidQuantity >= totalQty ? 'Ürün iptal edildi (kayıt altına alındı)' : `${voidQuantity} adet iptal edildi (kayıt altına alındı)`);
                        if (itemId) {
                            const idx = cart.findIndex((c: any) => c.id === itemId);
                            if (idx >= 0) {
                                if (voidQuantity >= totalQty)
                                    setCart(cart.filter((_: any, i: number) => i !== idx));
                                else
                                    setCart(cart.map((c: any, i: number) => i === idx ? { ...c, quantity: c.quantity - voidQuantity, subtotal: (c.quantity - voidQuantity) * (c.price ?? c.product?.price ?? 0) } : c));
                            }
                        }
                    }}
                />
            )}

            {showTableCloseConfirm && table && (
                <RestaurantTableCloseConfirmModal
                    tableNumber={table.number}
                    onClose={() => setShowTableCloseConfirm(false)}
                    onConfirmClose={async () => {
                        await markAsClean(table.id);
                        setShowTableCloseConfirm(false);
                        onBack?.();
                    }}
                    onJustLeave={() => {
                        setShowTableCloseConfirm(false);
                        onBack?.();
                    }}
                />
            )}
        </div>
    );
};

/** Tıklanınca mevcut tabaklar arasında dönen küçük renkli etiket.
 *  plates boşsa hiçbir şey render etmez. */
function PlateBadge({
    plate,
    plates,
    onCycle,
}: {
    plate: string | undefined;
    plates: string[];
    onCycle: (e: React.MouseEvent) => void;
}) {
    if (plates.length === 0) return null;
    const pIdx = plate ? plates.indexOf(plate) : -1;
    const pal = pIdx >= 0 ? PLATE_PALETTE[pIdx % PLATE_PALETTE.length] : null;

    return (
        <button
            onClick={onCycle}
            style={pal ? { backgroundColor: pal.bg, color: pal.text, borderColor: pal.border } : undefined}
            className={cn(
                'px-1.5 py-0.5 rounded-md border text-[10px] font-black transition-all active:scale-95',
                pal
                    ? 'border-current'
                    : 'border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500'
            )}
            title="Tıkla → tabak değiştir"
        >
            {plate ?? '—'}
        </button>
    );
}

export default RestPOS;


