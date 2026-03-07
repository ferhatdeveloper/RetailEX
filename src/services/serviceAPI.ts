import { supabase } from '../utils/supabase/client';

export interface Service {
    id: string;
    code: string;
    name: string;
    description?: string;
    category?: string;
    unit_price: number;
    tax_rate: number;
    unit: string;
    is_active: boolean;
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


