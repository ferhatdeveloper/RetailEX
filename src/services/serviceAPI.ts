import { supabase } from '../utils/supabase/client';

export interface Service {
    id: string;
    code: string;
    name: string;
    description?: string;
    description_tr?: string;
    description_en?: string;
    description_ar?: string;
    description_ku?: string;
    category?: string;
    categoryId?: string;
    categoryCode?: string;
    brand?: string;
    model?: string;
    manufacturer?: string;
    supplier?: string;
    origin?: string;
    groupCode?: string;
    subGroupCode?: string;
    specialCode1?: string;
    specialCode2?: string;
    specialCode3?: string;
    specialCode4?: string;
    specialCode5?: string;
    unit_price: number;
    unit_price_usd?: number;
    unit_price_eur?: number;
    purchase_price?: number;
    purchase_price_usd?: number;
    purchase_price_eur?: number;
    tax_rate: number;
    tax_type?: string;
    withholding_rate?: number;
    discount1?: number;
    discount2?: number;
    discount3?: number;
    unit: string;
    is_active: boolean;
    image_url?: string;
    priceList1?: number;
    priceList2?: number;
    priceList3?: number;
    priceList4?: number;
    priceList5?: number;
    priceList6?: number;
    created_at: string;
    updated_at: string;
}

export type CreateServiceInput = Omit<Service, 'id' | 'created_at' | 'updated_at'>;
export type UpdateServiceInput = Partial<CreateServiceInput>;

class ServiceAPI {
    private tableName = 'services';

    async getAll(): Promise<Service[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getActive(): Promise<Service[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async getById(id: string): Promise<Service | null> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    async create(service: CreateServiceInput): Promise<Service> {
        const { data, error } = await supabase
            .from(this.tableName)
            .insert([service])
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async update(id: string, updates: UpdateServiceInput): Promise<Service> {
        const { data, error } = await supabase
            .from(this.tableName)
            .update(updates)
            .eq('id', id)
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

    async toggleActive(id: string): Promise<Service> {
        const service = await this.getById(id);
        if (!service) throw new Error('Service not found');
        return this.update(id, { is_active: !service.is_active });
    }

    async search(query: string): Promise<Service[]> {
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*')
            .or(`code.ilike.%${query}%,name.ilike.%${query}%,category.ilike.%${query}%`)
            .order('name', { ascending: true });
        if (error) throw error;
        return data || [];
    }
}

export const serviceAPI = new ServiceAPI();


