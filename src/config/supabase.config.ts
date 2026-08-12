/**
 * Supabase Configuration
 * ExRetailOS - Database Credentials
 * 
 * IMPORTANT: Replace these demo values with your real Supabase credentials
 * 
 * Quick Setup:
 * 1. Go to https://supabase.com
 * 2. Create a new project (free)
 * 3. Go to Settings > API
 * 4. Copy your Project URL and anon key
 * 5. Replace the values below
 * 6. Save and refresh the page
 */

export const supabaseConfig = {
  // Supabase Project URL (zdkudbhzxbhjgskczhzt)
  url: 'https://zdkudbhzxbhjgskczhzt.supabase.co',
  // Anonymous Key — sadece bu anahtar frontend'de kullanılır. service_role key asla buraya yazılmamalı.
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpka3VkYmh6eGJoamdza2N6aHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4ODcxNzksImV4cCI6MjA4NzQ2MzE3OX0.FPIIlU63MCbMoH7Yyv6QaaF6v_cS-plnV04x3Gyunds',
};

// Helper to check if configured
export const isSupabaseConfigured = () => {
  return true;
};

// Export for easy access
export default supabaseConfig;


