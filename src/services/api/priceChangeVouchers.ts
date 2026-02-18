/**
 * Price Change Vouchers API
 * Fiyat Değişim Fişleri Yönetimi
 */

import { supabase, SUPABASE_CONFIGURED } from '../../utils/supabase/client';

const isDemo = () => !SUPABASE_CONFIGURED;

export interface PriceChangeVoucherItem {
  code: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  difference: number;
  differencePercent: number;
}

export interface PriceChangeVoucher {
  id?: string;
  voucher_no: string;
  invoice_no: string;
  date: string;
  items: PriceChangeVoucherItem[];
  printed?: boolean;
  printed_at?: string;
  printed_by?: string;
  created_at?: string;
  firma_id?: string;
  donem_id?: string;
}

export const priceChangeVouchersAPI = {
  /**
   * Create new price change voucher
   */
  async create(voucher: PriceChangeVoucher): Promise<PriceChangeVoucher | null> {
    if (isDemo()) {
      console.log('[PriceChangeVouchersAPI] DEMO MODE - Creating voucher');
      return {
        ...voucher,
        id: `mock-voucher-${Date.now()}`,
        printed: false,
        created_at: new Date().toISOString()
      };
    }

    try {
      const { data, error } = await supabase
        .from('price_change_vouchers')
        .insert([
          {
            voucher_no: voucher.voucher_no,
            invoice_no: voucher.invoice_no,
            date: voucher.date,
            items: voucher.items,
            printed: false,
            firma_id: voucher.firma_id,
            donem_id: voucher.donem_id,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('[PriceChangeVouchersAPI] Create error:', error);
        // Fallback to local storage if table doesn't exist
        const localVouchers = this.getAllFromLocal();
        const newVoucher = {
          ...voucher,
          id: `local-${Date.now()}`,
          printed: false,
          created_at: new Date().toISOString()
        };
        localVouchers.push(newVoucher);
        localStorage.setItem('price_change_vouchers', JSON.stringify(localVouchers));
        return newVoucher;
      }

      return data;
    } catch (error) {
      console.error('[PriceChangeVouchersAPI] Create error:', error);
      // Fallback to local storage
      const localVouchers = this.getAllFromLocal();
      const newVoucher = {
        ...voucher,
        id: `local-${Date.now()}`,
        printed: false,
        created_at: new Date().toISOString()
      };
      localVouchers.push(newVoucher);
      localStorage.setItem('price_change_vouchers', JSON.stringify(localVouchers));
      return newVoucher;
    }
  },

  /**
   * Get all vouchers
   */
  async getAll(): Promise<PriceChangeVoucher[]> {
    if (isDemo()) {
      return this.getAllFromLocal();
    }

    try {
      const { data, error } = await supabase
        .from('price_change_vouchers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[PriceChangeVouchersAPI] Get all error:', error);
        return this.getAllFromLocal();
      }

      return data || [];
    } catch (error) {
      console.error('[PriceChangeVouchersAPI] Get all error:', error);
      return this.getAllFromLocal();
    }
  },

  /**
   * Get voucher by ID
   */
  async getById(id: string): Promise<PriceChangeVoucher | null> {
    if (isDemo()) {
      const localVouchers = this.getAllFromLocal();
      return localVouchers.find(v => v.id === id) || null;
    }

    try {
      const { data, error } = await supabase
        .from('price_change_vouchers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('[PriceChangeVouchersAPI] Get by ID error:', error);
        const localVouchers = this.getAllFromLocal();
        return localVouchers.find(v => v.id === id) || null;
      }

      return data;
    } catch (error) {
      console.error('[PriceChangeVouchersAPI] Get by ID error:', error);
      const localVouchers = this.getAllFromLocal();
      return localVouchers.find(v => v.id === id) || null;
    }
  },

  /**
   * Mark voucher as printed
   */
  async markAsPrinted(id: string, printedBy?: string): Promise<boolean> {
    if (isDemo()) {
      const localVouchers = this.getAllFromLocal();
      const index = localVouchers.findIndex(v => v.id === id);
      if (index !== -1) {
        localVouchers[index].printed = true;
        localVouchers[index].printed_at = new Date().toISOString();
        localVouchers[index].printed_by = printedBy;
        localStorage.setItem('price_change_vouchers', JSON.stringify(localVouchers));
        return true;
      }
      return false;
    }

    try {
      const { error } = await supabase
        .from('price_change_vouchers')
        .update({
          printed: true,
          printed_at: new Date().toISOString(),
          printed_by: printedBy
        })
        .eq('id', id);

      if (error) {
        console.error('[PriceChangeVouchersAPI] Mark as printed error:', error);
        // Fallback to local storage
        const localVouchers = this.getAllFromLocal();
        const index = localVouchers.findIndex(v => v.id === id);
        if (index !== -1) {
          localVouchers[index].printed = true;
          localVouchers[index].printed_at = new Date().toISOString();
          localVouchers[index].printed_by = printedBy;
          localStorage.setItem('price_change_vouchers', JSON.stringify(localVouchers));
          return true;
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('[PriceChangeVouchersAPI] Mark as printed error:', error);
      return false;
    }
  },

  /**
   * Get all from local storage (fallback)
   */
  getAllFromLocal(): PriceChangeVoucher[] {
    try {
      const stored = localStorage.getItem('price_change_vouchers');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }
};



