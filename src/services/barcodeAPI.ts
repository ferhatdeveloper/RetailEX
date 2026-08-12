import { supabase } from '../utils/supabase/client';

export interface ProductBarcode {
    id: string;
    product_id: string;
    barcode: string;
    barcode_type: string;
    is_primary: boolean;
    created_at: string;
}

export type CreateBarcodeInput = Omit<ProductBarcode, 'id' | 'created_at'>;

class BarcodeAPI {
    private tableName = 'product_barcodes';

    async getAll(): Promise<ProductBarcode[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select(`
        *,
        products (id, name, code)
      `)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getByProductId(productId: string): Promise<ProductBarcode[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('product_id', productId)
            .order('is_primary', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getByBarcode(barcode: string): Promise<ProductBarcode | null> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select(`
        *,
        products (id, name, code)
      `)
            .eq('barcode', barcode)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }

    async create(barcode: CreateBarcodeInput): Promise<ProductBarcode> {
        const { data, error } = await supabase
            .from(this.tableName)
            .insert([barcode])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from(this.tableName)
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    async setPrimary(id: string, productId: string): Promise<void> {
        // First, unset all primary barcodes for this product
        await supabase
            .from(this.tableName)
            .update({ is_primary: false })
            .eq('product_id', productId);

        // Then set this one as primary
        const { error } = await supabase
            .from(this.tableName)
            .update({ is_primary: true })
            .eq('id', id);
        if (error) throw error;
    }

    async search(query: string): Promise<ProductBarcode[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select(`
        *,
        products (id, name, code)
      `)
            .ilike('barcode', `%${query}%`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }
}

export const barcodeAPI = new BarcodeAPI();



