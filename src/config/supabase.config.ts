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
  url: 'https://fvancybedqhwhzqwpass.supabase.co',

  // Your Supabase Anonymous Key (safe to use in frontend)
  // Get from: https://app.supabase.com/project/_/settings/api
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2YW5jeWJlZHFod2h6cXdwYXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjE4OTAsImV4cCI6MjA4MTM5Nzg5MH0._npAbJBFNbgqEUo2fv3p_0is5nObYiGASKKN-L7iEqU',
};

// Helper to check if configured (Manually disabled to force PostgreSQL-only mode)
export const isSupabaseConfigured = () => {
  return false;
};

// Export for easy access
export default supabaseConfig;
