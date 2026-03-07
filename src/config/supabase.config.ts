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
  // Your Supabase Project URL
  // Get from: https://app.supabase.com/project/_/settings/api
  // Example: https://abcdefghijklmnop.supabase.co
  url: 'https://iryqbqxvwsvksfhakkzz.supabase.co',

  // Your Supabase Anonymous Key (safe to use in frontend)
  // Get from: https://app.supabase.com/project/_/settings/api
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeXFicXh2d3N2a3NmaGFra3p6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg5MzMyODIsImV4cCI6MjA3NDUwOTI4Mn0.u6L7YJ9G2gGNngdZpkrHTfDG_EfBhw9P34Gz7fSh_ek',
};

// Helper to check if configured
export const isSupabaseConfigured = () => {
  return true;
};

// Export for easy access
export default supabaseConfig;


