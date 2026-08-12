import { supabase, SUPABASE_CONFIGURED } from '../utils/supabase/client';

export interface PurchaseRequestItem {
    id?: string;
    request_id?: string;
    product_id?: string;
    product_code?: string;
    product_name: string;
    quantity: number;
    unit: string;
    price?: number;
    total?: number;
    supplier_id?: string;
    description?: string;
    variant_code?: string;
    payment_plan?: string;
    requested_delivery_date?: string;
    project_code?: string;
    cost_center?: string;
}

export interface PurchaseRequest {
    id: string;
    request_no: string;
    request_date: string;
    request_time?: string;
    document_no?: string;
    project_code?: string;
    workplace?: string;
    department?: string;
    factory?: string;
    warehouse?: string;
    special_code?: string;
    auth_code?: string;
    requester?: string;
    status: 'draft' | 'pending' | 'approved' | 'rejected' | 'processed';
    created_at?: string;
    items?: PurchaseRequestItem[];
}

const isDemo = () => !SUPABASE_CONFIGURED;

export const purchaseRequestAPI = {
    /**
     * Get all purchase requests
     */
    async getAll(): Promise<PurchaseRequest[]> {
        if (isDemo()) {
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('purchase_requests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code === 'PGRST204' || error.code === 'PGRST205') {
                    console.warn('[PurchaseRequestAPI] Table not found or access denied');
                    return [];
                }
                throw error;
            }
            return data || [];
        } catch (error) {
            console.error('[PurchaseRequestAPI] getAll error:', error);
            return [];
        }
    },

    /**
     * Create a new purchase request and its items
     */
    async create(requestFields: Partial<PurchaseRequest>, items: Partial<PurchaseRequestItem>[]): Promise<PurchaseRequest> {
        if (isDemo()) {
            const mockRequest: any = {
                ...requestFields,
                id: `mock-req-${Date.now()}`,
                request_no: `PR-MOCK-${Date.now().toString().slice(-6)}`,
                created_at: new Date().toISOString()
            };
            return mockRequest;
        }

        try {
            // 1. Insert request header
            const { data: requestData, error: requestError } = await supabase
                .from('purchase_requests')
                .insert({
                    request_no: requestFields.request_no,
                    request_date: requestFields.request_date,
                    request_time: requestFields.request_time,
                    document_no: requestFields.document_no,
                    project_code: requestFields.project_code,
                    workplace: requestFields.workplace,
                    department: requestFields.department,
                    factory: requestFields.factory,
                    warehouse: requestFields.warehouse,
                    special_code: requestFields.special_code,
                    auth_code: requestFields.auth_code,
                    requester: requestFields.requester,
                    status: 'pending'
                })
                .select()
                .single();

            if (requestError) throw requestError;

            // 2. Insert request items
            const itemsToInsert = items.map(item => ({
                request_id: requestData.id,
                product_id: item.product_id,
                product_code: item.product_code,
                product_name: item.product_name,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                total: item.total,
                supplier_id: item.supplier_id,
                variant_code: item.variant_code,
                payment_plan: item.payment_plan,
                requested_delivery_date: item.requested_delivery_date,
                project_code: item.project_code,
                cost_center: item.cost_center,
                description: item.description
            }));

            const { error: itemsError } = await supabase
                .from('purchase_request_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            return requestData;
        } catch (error: any) {
            console.error('[PurchaseRequestAPI] create error:', error);
            throw new Error(error.message || 'Talep oluşturulamadı');
        }
    },

    /**
     * Update request status
     */
    async updateStatus(id: string, status: string): Promise<void> {
        if (isDemo()) return;

        try {
            const { error } = await supabase
                .from('purchase_requests')
                .update({ status })
                .eq('id', id);

            if (error) throw error;
        } catch (error: any) {
            console.error('[PurchaseRequestAPI] updateStatus error:', error);
            throw new Error(error.message || 'Durum güncellenemedi');
        }
    },

    /**
     * Delete request (and items via cascade)
     */
    async delete(id: string): Promise<void> {
        if (isDemo()) return;

        try {
            const { error } = await supabase
                .from('purchase_requests')
                .delete()
                .eq('id', id);

            if (error) throw error;
        } catch (error: any) {
            console.error('[PurchaseRequestAPI] delete error:', error);
            throw new Error(error.message || 'Talep silinemedi');
        }
    }
};

