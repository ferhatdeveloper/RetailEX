/**
 * Cash Register API - Kasa Yönetimi
 * ExRetailOS - Her kasiyer için ayrı kasa ve merkez kasaya virman
 */

import { supabase, SUPABASE_CONFIGURED } from '../../utils/supabase/client';

const isDemo = () => !SUPABASE_CONFIGURED;

export interface CashRegister {
  id: string;
  register_code: string;
  register_name: string;
  cashier_id?: string;
  cashier_name?: string;
  store_id?: string;
  store_name?: string;
  is_central: boolean; // Merkez kasa mı?
  opening_balance: number;
  current_balance: number;
  status: 'open' | 'closed';
  opened_at?: string;
  closed_at?: string;
}

export interface CashRegisterSession {
  id: string;
  session_no: string;
  cash_register_id: string;
  cashier_id: string;
  cashier_name: string;
  opening_balance: number;
  closing_balance?: number;
  expected_balance?: number;
  difference?: number;
  opened_at: string;
  closed_at?: string;
  status: 'open' | 'closed';
  notes?: string;
}

export interface CashTransfer {
  id: string;
  from_register_id: string;
  to_register_id: string;
  amount: number;
  transfer_date: string;
  description?: string;
  created_by: string;
  created_at: string;
}

export const cashRegistersAPI = {
  /**
   * Get all cash registers
   */
  async getAll(): Promise<CashRegister[]> {
    if (isDemo()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select(`
          *,
          cashier:users(full_name),
          store:stores(name)
        `)
        .order('register_code');

      if (error) {
        console.error('[CashRegistersAPI] getAll error:', error);
        return [];
      }

      return (data || []).map((reg: any) => ({
        id: reg.id,
        register_code: reg.register_code,
        register_name: reg.register_name,
        cashier_id: reg.cashier_id,
        cashier_name: reg.cashier?.full_name,
        store_id: reg.store_id,
        store_name: reg.store?.name,
        is_central: reg.is_central || false,
        opening_balance: parseFloat(reg.opening_balance || 0),
        current_balance: parseFloat(reg.current_balance || 0),
        status: reg.status || 'closed',
        opened_at: reg.opened_at,
        closed_at: reg.closed_at,
      }));
    } catch (error) {
      console.error('[CashRegistersAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Open cash register session for cashier
   */
  async openSession(cashierId: string, openingBalance: number, registerId?: string): Promise<CashRegisterSession | null> {
    if (isDemo()) {
      return null;
    }

    try {
      // Eğer registerId verilmemişse, kasiyer için kasa oluştur veya bul
      let finalRegisterId = registerId;
      
      if (!finalRegisterId) {
        // Kasiyer için kasa var mı kontrol et
        const { data: existingRegister } = await supabase
          .from('cash_registers')
          .select('id')
          .eq('cashier_id', cashierId)
          .eq('status', 'closed')
          .single();

        if (existingRegister) {
          finalRegisterId = existingRegister.id;
        } else {
          // Yeni kasa oluştur
          const { data: cashier } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', cashierId)
            .single();

          const { data: newRegister, error: createError } = await supabase
            .from('cash_registers')
            .insert([{
              register_code: `KASA-${cashierId.slice(0, 8)}`,
              register_name: `${cashier?.full_name || 'Kasiyer'} Kasa`,
              cashier_id: cashierId,
              is_central: false,
              opening_balance: openingBalance,
              current_balance: openingBalance,
              status: 'open',
            }])
            .select()
            .single();

          if (createError) throw createError;
          finalRegisterId = newRegister.id;
        }
      }

      // Kasa oturumu aç
      const sessionNo = `SES-${Date.now()}`;
      const { data: session, error } = await supabase
        .from('cash_register_sessions')
        .insert([{
          session_no: sessionNo,
          cash_register_id: finalRegisterId,
          cashier_id: cashierId,
          opening_balance: openingBalance,
          status: 'open',
        }])
        .select(`
          *,
          cashier:users(full_name)
        `)
        .single();

      if (error) throw error;

      // Kasa durumunu güncelle
      await supabase
        .from('cash_registers')
        .update({ 
          status: 'open',
          current_balance: openingBalance,
          opened_at: new Date().toISOString()
        })
        .eq('id', finalRegisterId);

      return {
        id: session.id,
        session_no: session.session_no,
        cash_register_id: session.cash_register_id,
        cashier_id: session.cashier_id,
        cashier_name: session.cashier?.full_name || '',
        opening_balance: parseFloat(session.opening_balance),
        opened_at: session.opened_at,
        status: session.status,
      };
    } catch (error) {
      console.error('[CashRegistersAPI] openSession failed:', error);
      return null;
    }
  },

  /**
   * Close cash register session
   */
  async closeSession(sessionId: string, closingBalance: number, notes?: string): Promise<boolean> {
    if (isDemo()) {
      return false;
    }

    try {
      // Oturumu kapat
      const { data: session, error: sessionError } = await supabase
        .from('cash_register_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;

      const expectedBalance = parseFloat(session.opening_balance) + (session.total_sales || 0);
      const difference = closingBalance - expectedBalance;

      await supabase
        .from('cash_register_sessions')
        .update({
          closing_balance: closingBalance,
          expected_balance: expectedBalance,
          difference: difference,
          closed_at: new Date().toISOString(),
          status: 'closed',
          notes: notes,
        })
        .eq('id', sessionId);

      // Kasa durumunu güncelle
      await supabase
        .from('cash_registers')
        .update({
          status: 'closed',
          current_balance: closingBalance,
          closed_at: new Date().toISOString(),
        })
        .eq('id', session.cash_register_id);

      return true;
    } catch (error) {
      console.error('[CashRegistersAPI] closeSession failed:', error);
      return false;
    }
  },

  /**
   * Transfer money from cashier register to central register (Virman)
   */
  async transferToCentral(
    fromRegisterId: string,
    amount: number,
    description?: string,
    userId?: string
  ): Promise<boolean> {
    if (isDemo()) {
      return false;
    }

    try {
      // Merkez kasayı bul
      const { data: centralRegister } = await supabase
        .from('cash_registers')
        .select('id')
        .eq('is_central', true)
        .single();

      if (!centralRegister) {
        throw new Error('Merkez kasa bulunamadı');
      }

      // Kasiyer kasasından para çek
      const { data: fromRegister } = await supabase
        .from('cash_registers')
        .select('current_balance')
        .eq('id', fromRegisterId)
        .single();

      if (!fromRegister || parseFloat(fromRegister.current_balance) < amount) {
        throw new Error('Yetersiz bakiye');
      }

      // Transfer kaydı oluştur
      const { error: transferError } = await supabase
        .from('cash_transfers')
        .insert([{
          from_register_id: fromRegisterId,
          to_register_id: centralRegister.id,
          amount: amount,
          transfer_date: new Date().toISOString(),
          description: description || 'Kasiyer kasasından merkez kasaya virman',
          created_by: userId || 'system',
        }]);

      if (transferError) throw transferError;

      // Kasiyer kasası bakiyesini düşür
      await supabase
        .from('cash_registers')
        .update({
          current_balance: parseFloat(fromRegister.current_balance) - amount,
        })
        .eq('id', fromRegisterId);

      // Merkez kasa bakiyesini artır
      const { data: centralRegisterData } = await supabase
        .from('cash_registers')
        .select('current_balance')
        .eq('id', centralRegister.id)
        .single();

      if (centralRegisterData) {
        await supabase
          .from('cash_registers')
          .update({
            current_balance: parseFloat(centralRegisterData.current_balance) + amount,
          })
          .eq('id', centralRegister.id);
      }

      return true;
    } catch (error) {
      console.error('[CashRegistersAPI] transferToCentral failed:', error);
      return false;
    }
  },

  /**
   * Get cash register by cashier ID
   */
  async getByCashier(cashierId: string): Promise<CashRegister | null> {
    if (isDemo()) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('cash_registers')
        .select(`
          *,
          cashier:users(full_name),
          store:stores(name)
        `)
        .eq('cashier_id', cashierId)
        .order('opened_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return {
        id: data.id,
        register_code: data.register_code,
        register_name: data.register_name,
        cashier_id: data.cashier_id,
        cashier_name: data.cashier?.full_name,
        store_id: data.store_id,
        store_name: data.store?.name,
        is_central: data.is_central || false,
        opening_balance: parseFloat(data.opening_balance || 0),
        current_balance: parseFloat(data.current_balance || 0),
        status: data.status || 'closed',
        opened_at: data.opened_at,
        closed_at: data.closed_at,
      };
    } catch (error) {
      console.error('[CashRegistersAPI] getByCashier failed:', error);
      return null;
    }
  },
};




