import { supabase } from '../utils/supabase/client';

export interface SerialLotNumber {
    id: string;
    product_id: string;
    type: 'serial' | 'lot';
    number: string;
    quantity?: number;
    expiry_date?: string;
    warehouse_id?: string;
    status: string;
    created_at: string;
}

export type CreateSerialLotInput = Omit<SerialLotNumber, 'id' | 'created_at'>;

class SerialLotAPI {
    async getAll(): Promise<SerialLotNumber[]> {
        const { data, error } = await supabase
            .from('serial_lot_numbers')
            .select(`*, products(name, code), warehouses(name)`)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getByProduct(productId: string): Promise<SerialLotNumber[]> {
        const { data, error } = await supabase
            .from('serial_lot_numbers')
            .select('*')
            .eq('product_id', productId);
        if (error) throw error;
        return data || [];
    }

    async create(item: CreateSerialLotInput): Promise<SerialLotNumber> {
        const { data, error } = await supabase
            .from('serial_lot_numbers')
            .insert([item])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('serial_lot_numbers')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }

    async search(query: string): Promise<SerialLotNumber[]> {
        const { data, error } = await supabase
            .from('serial_lot_numbers')
            .select(`*, products(name, code)`)
            .ilike('number', `%${query}%`);
        if (error) throw error;
        return data || [];
    }
}

export const serialLotAPI = new SerialLotAPI();


