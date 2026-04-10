import { createClient } from '@supabase/supabase-js';

// Vite exposes env vars as import.meta.env.VITE_*
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type declaration for import.meta.env (for TypeScript)
declare global {
	interface ImportMeta {
		env: {
			VITE_SUPABASE_URL: string;
			VITE_SUPABASE_ANON_KEY: string;
		};
	}
}
