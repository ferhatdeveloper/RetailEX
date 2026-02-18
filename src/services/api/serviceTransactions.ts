import { supabase } from '@/utils/supabase/client';

export interface ServiceTransaction {
    id?: string;
    firm_nr: string;
    transaction_type: 'topup' | 'bill_payment';
    provider: string;
    target_number: string;
    package_name?: string;
    amount: number;
    cost: number;
    currency: string;
    payment_method: string;
    status: 'pending' | 'completed' | 'failed';
    transaction_ref?: string;
    sms_sent: boolean;
    staff_id?: string;
    created_at?: string;
}

export const serviceTransactions = {
    async create(transaction: ServiceTransaction) {
        const { data, error } = await supabase
            .from('service_transactions')
            .insert([transaction])
            .select()
            .single();

        if (error) {
            console.error('Error creating service transaction:', error);
            return null;
        }
        return data;
    },

    async getReport(startDate: string, endDate: string) {
        const { data, error } = await supabase
            .from('service_transactions')
            .select('*')
            .gte('created_at', startDate)
            .lte('created_at', endDate)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching service report:', error);
            return [];
        }
        return data;
    }
};
