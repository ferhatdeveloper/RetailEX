/**
 * Supabase Client - WMS Module
 * Singleton instance for database operations
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, publicAnonKey } from './info';

// Create Supabase client
export const supabase = createClient(supabaseUrl, publicAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  db: {
    schema: 'public',
  },
});

// Export types
export type SupabaseClient = typeof supabase;

/**
 * Check if Supabase connection is working
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('kv_store_eae94dc0')
      .select('count', { count: 'exact', head: true });

    if (error) {
      console.error('? Supabase connection failed:', error.message);
      return false;
    }

    console.log('? WMS Supabase connected!');
    return true;
  } catch (error) {
    console.error('? Supabase connection error:', error);
    return false;
  }
}

// Auto-check connection on load (only in browser)
if (typeof window !== 'undefined') {
  setTimeout(() => {
    checkSupabaseConnection().then((success) => {
      if (success) {
        console.log('%c🏢 WMS Backend Ready!', 'color: #10b981; font-weight: bold;');
      } else {
        console.log('%c?? WMS Backend Offline', 'color: #f59e0b;');
      }
    });
  }, 1000);
}



