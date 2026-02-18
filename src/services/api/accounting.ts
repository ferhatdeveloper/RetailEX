/**
 * Accounting API - Supabase Integration
 */

import { supabase } from '../../utils/supabase/client';

export interface YevmiyeFisi {
    id?: string;
    fis_no: string;
    fis_tarihi: string;
    fis_tipi: 'ACILIS' | 'ISLEM' | 'MAHSUP' | 'DEVIR' | 'KAPANIŞ';
    donem_yil: number;
    donem_ay: number;
    aciklama?: string;
    evrak_no?: string;
    onay_durumu: 'TASLAK' | 'ONAYLANDI' | 'IPTAL';
    olusturan_id: string;
    store_id?: string;
    satirlar?: YevmiyeSatiri[];
}

export interface YevmiyeSatiri {
    id?: string;
    fis_id: string;
    sira_no: number;
    hesap_kodu: string;
    borc: number;
    alacak: number;
    aciklama?: string;
    cari_hesap_id?: string;
}

export interface HesapPlani {
    id: string;
    hesap_kodu: string;
    hesap_adi: string;
    hesap_tipi: 'AKTIF' | 'PASIF' | 'GELIR' | 'GIDER' | 'SERMAYE';
    borc_bakiye: number;
    alacak_bakiye: number;
    is_active: boolean;
}

export const accountingAPI = {
    /**
     * Get all Journal Entries
     */
    async getJournalEntries(filters?: {
        startDate?: string;
        endDate?: string;
        status?: string;
        limit?: number
    }) {
        // 1. Fetch Headers
        let query = supabase
            .from('yevmiye_fisleri')
            .select('*');

        if (filters?.startDate) query = query.gte('fis_tarihi', filters.startDate);
        if (filters?.endDate) query = query.lte('fis_tarihi', filters.endDate);
        if (filters?.status) query = query.eq('onay_durumu', filters.status);

        query = query.order('fis_tarihi', { ascending: false });

        if (filters?.limit) query = query.limit(filters.limit);

        const { data: fisler, error: fisError } = await query;
        if (fisError) throw fisError;
        if (!fisler || fisler.length === 0) return [];

        // 2. Fetch Lines for these headers
        const fisIds = fisler.map(f => f.id);
        const { data: satirlar, error: satirError } = await supabase
            .from('yevmiye_fisi_detaylari')
            .select('*')
            .in('fis_id', fisIds);

        if (satirError) {
            console.error('Error fetching lines:', satirError);
            // Return headers without lines if line fetch fails, to avoid blocking UI
            return fisler.map(f => ({ ...f, satirlar: [] })) as YevmiyeFisi[];
        }

        // 3. Merge Headers and Lines
        const result = fisler.map(f => ({
            ...f,
            satirlar: satirlar?.filter(s => s.fis_id === f.id) || []
        }));

        return result as YevmiyeFisi[];
    },

    /**
     * Create a manual Journal Entry
     */
    async createJournalEntry(fis: Omit<YevmiyeFisi, 'id' | 'satirlar'>, satirlar: Omit<YevmiyeSatiri, 'id' | 'fis_id'>[]) {
        // 1. Insert Header
        const { data: fisData, error: fisError } = await supabase
            .from('yevmiye_fisleri')
            .insert([fis])
            .select()
            .single();

        if (fisError) throw fisError;

        // 2. Insert Lines
        const linesToInsert = satirlar.map(s => ({
            ...s,
            fis_id: fisData.id
        }));

        const { error: linesError } = await supabase
            .from('yevmiye_fisi_detaylari')
            .insert(linesToInsert);

        if (linesError) {
            // Rollback header if lines fail
            await supabase.from('yevmiye_fisleri').delete().eq('id', fisData.id);
            throw linesError;
        }

        return fisData;
    },

    /**
     * Get Chart of Accounts
     */
    async getChartOfAccounts() {
        const { data, error } = await supabase
            .from('hesap_plani')
            .select('*')
            .order('hesap_kodu', { ascending: true });

        if (error) throw error;
        return data as HesapPlani[];
    },

    /**
     * Approve Journal Entry
     */
    async approveEntry(id: string, userId: string) {
        const { error } = await supabase
            .from('yevmiye_fisleri')
            .update({
                onay_durumu: 'ONAYLANDI',
                onaylayan_id: userId,
                onay_tarihi: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;
        return true;
    }
};

