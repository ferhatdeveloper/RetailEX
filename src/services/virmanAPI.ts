import { supabase } from '../utils/supabase/client';

export interface VirmanOperation {
    id: string;
    virman_no: string;
    from_warehouse_id?: string;
    to_warehouse_id?: string;
    operation_date: string;
    status: string;
    notes?: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface VirmanItem {
    id: string;
    virman_id: string;
    product_id: string;
    quantity: number;
    notes?: string;
}

class VirmanAPI {
    async getAll(): Promise<VirmanOperation[]> {
        const { data, error } = await supabase
            .from('virman_operations')
            .select(`
        *,
        from_warehouse:warehouses!from_warehouse_id(name),
        to_warehouse:warehouses!to_warehouse_id(name)
      `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getById(id: string): Promise<VirmanOperation | null> {
        const { data, error } = await supabase
            .from('virman_operations')
            .select(`*, virman_items(*, products(name, code))`)
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    async create(virman: Partial<VirmanOperation>, items: Partial<VirmanItem>[]): Promise<VirmanOperation> {
        const { data: virmanData, error: virmanError } = await supabase
            .from('virman_operations')
            .insert([virman])
            .select()
            .single();
        if (virmanError) throw virmanError;

        if (items.length > 0) {
            const itemsWithVirmanId = items.map(item => ({ ...item, virman_id: virmanData.id }));
            const { error: itemsError } = await supabase
                .from('virman_items')
                .insert(itemsWithVirmanId);
            if (itemsError) throw itemsError;
        }

        return virmanData;
    }

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('virman_operations')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
}

export const virmanAPI = new VirmanAPI();

