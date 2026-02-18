/* WMS Module - Supabase Configuration */

export const projectId = "fvancybedqhwhzqwpass";
export const publicAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2YW5jeWJlZHFod2h6cXdwYXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjE4OTAsImV4cCI6MjA4MTM5Nzg5MH0._npAbJBFNbgqEUo2fv3p_0is5nObYiGASKKN-L7iEqU";

// Supabase URL
export const supabaseUrl = `https://${projectId}.supabase.co`;

// Backend endpoint
export const getBackendUrl = (endpoint: string) => {
  return `${supabaseUrl}/functions/v1/make-server-eae94dc0${endpoint}`;
};

