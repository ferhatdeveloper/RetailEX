import { supabase, SUPABASE_CONFIGURED } from '../utils/supabase/client';

export interface PurchaseOrderItem {
    id?: string;
    order_id?: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

export interface PurchaseOrder {
    id: string;
    order_no: string;
    supplier_id: string;
    supplier?: { name: string };
    order_date: string;
    delivery_date?: string;
    status: 'pending' | 'approved' | 'received' | 'cancelled';
    total_amount: number;
    notes?: string;
    created_at?: string;
    items?: PurchaseOrderItem[];
}

const isDemo = () => !SUPABASE_CONFIGURED;

export const purchaseOrderAPI = {
    /**
     * Get all purchase orders with supplier info
     */
    async getAll(): Promise<PurchaseOrder[]> {
        if (isDemo()) {
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('purchase_orders')
                .select(`
          *,
          supplier:suppliers(name)
        `)
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code === 'PGRST204' || error.code === 'PGRST205') {
                    console.warn('[PurchaseOrderAPI] Table not found or access denied');
                    return [];
                }
                throw error;
            }
            return (data || []).map((order: any) => ({
                ...order,
                total_amount: parseFloat(order.total_amount || 0)
            }));
        } catch (error) {
            console.error('[PurchaseOrderAPI] getAll error:', error);
            return [];
        }
    },

    /**
     * Create a new purchase order and its items
     */
    async create(orderFields: Partial<PurchaseOrder>, items: Partial<PurchaseOrderItem>[]): Promise<PurchaseOrder> {
        if (isDemo()) {
            const mockOrder: any = {
                ...orderFields,
                id: `mock-${Date.now()}`,
                order_no: `PO-MOCK-${Date.now().toString().slice(-6)}`,
                created_at: new Date().toISOString()
            };
            return mockOrder;
        }

        try {
            // 1. Insert order header
            const { data: orderData, error: orderError } = await supabase
                .from('purchase_orders')
                .insert({
                    supplier_id: orderFields.supplier_id,
                    delivery_date: orderFields.delivery_date,
                    total_amount: orderFields.total_amount,
                    notes: orderFields.notes,
                    status: 'pending'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 2. Insert order items
            const itemsToInsert = items.map(item => ({
                order_id: orderData.id,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: (item.quantity || 0) * (item.unit_price || 0)
            }));

            const { error: itemsError } = await supabase
                .from('purchase_order_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            return orderData;
        } catch (error: any) {
            console.error('[PurchaseOrderAPI] create error:', error);
            throw new Error(error.message || 'Sipariş oluşturulamadı');
        }
    },

    /**
     * Update order status
     */
    async updateStatus(id: string, status: string): Promise<void> {
        if (isDemo()) return;

        try {
            const { error } = await supabase
                .from('purchase_orders')
                .update({ status })
                .eq('id', id);

            if (error) throw error;
        } catch (error: any) {
            console.error('[PurchaseOrderAPI] updateStatus error:', error);
            throw new Error(error.message || 'Durum güncellenemedi');
        }
    },

    /**
     * Delete order (and items via cascade)
     */
    async delete(id: string): Promise<void> {
        if (isDemo()) return;

        try {
            const { error } = await supabase
                .from('purchase_orders')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error: any) {
            console.error('[PurchaseOrderAPI] delete error:', error);
            throw new Error(error.message || 'Sipariş silinemedi');
        }
    }
};

