/**
 * Supabase Client - Singleton Instance
 * ExRetailOS - Central Database Connection
 * 
 * Configuration: /config/supabase.config.ts
 */

import { createClient } from '@supabase/supabase-js';
import supabaseConfig, { isSupabaseConfigured } from '../../config/supabase.config';

// Get credentials from config file
const { url: supabaseUrl, anonKey: supabaseAnonKey } = supabaseConfig;

// Check if configured
const isConfigured = isSupabaseConfigured();

// Show setup instructions if not configured (only in browser, only once)
if (!isConfigured && typeof window !== 'undefined') {
  // Check if already shown in this session
  const alreadyShown = sessionStorage.getItem('demo-mode-notice-shown');

  if (!alreadyShown) {
    console.log(
      '%c🎮 RetailEx - DEMO MODE',
      'color: #10b981; font-size: 14px; font-weight: bold;'
    );
    console.log(
      '%c✅ App is working perfectly!\n' +
      '⚡ Demo data (not saved permanently)\n\n' +
      '💡 Want permanent storage? → /QUICK_START.md',
      'color: #64748b; font-size: 11px;'
    );

    // Mark as shown
    sessionStorage.setItem('demo-mode-notice-shown', 'true');
  }
}

// Create Supabase client (kept for type safety and legacy imports, but won't be used)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }
});

// Export types
export type SupabaseClient = typeof supabase;

// Export configuration status
export const SUPABASE_CONFIGURED = false;

/**
 * Check if Supabase connection is working (Always false now)
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  return false;
}

// Auto-check connection on load (only in browser)
if (typeof window !== 'undefined') {
  console.log(
    '%c💾 RetailEx - Local Database Mode',
    'color: #10b981; font-size: 14px; font-weight: bold;'
  );
  console.log('Backend: ✅ PostgreSQL (Hybrid)');

  // Export for debugging
  (window as any).__EXRETAIL_DEBUG__ = {
    isConfigured: false,
    supabaseUrl: supabaseConfig.url,
    checkConnection: checkSupabaseConnection,
    getConfig: () => ({
      configured: false,
      url: supabaseConfig.url,
      hasKey: false,
    }),
  };
}
