import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://ofvpetcgufslyvwrlnqp.supabase.co"
  || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdnBldGNndWZzbHl2d3JsbnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MjQxNDgsImV4cCI6MjA5MTQwMDE0OH0.P-uuFZ1S_tttqIPFPyzp32lFSKT23yfbuclcxFzrbME"
  || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
