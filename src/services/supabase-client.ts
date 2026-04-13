
import { createClient } from '@supabase/supabase-js';

// Type declaration for import.meta.env (for TypeScript)
declare global {
  interface ImportMeta {
    env: {
      VITE_SUPABASE_URL: string;
      VITE_SUPABASE_ANON_KEY: string;
    };
  }
}

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = configuredSupabaseUrl || "https://ofvpetcgufslyvwrlnqp.supabase.co";
const supabaseAnonKey = configuredSupabaseAnonKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdnBldGNndWZzbHl2d3JsbnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjQxNDgsImV4cCI6MjA5MTQwMDE0OH0.P-uuFZ1S_tttqIPFPyzp32lFSKT23yfbuclcxFzrbME";

if (!configuredSupabaseUrl || !configuredSupabaseAnonKey) {
  console.warn(
    'Supabase env vars missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in each deployed environment to ensure all users write to the intended project.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
