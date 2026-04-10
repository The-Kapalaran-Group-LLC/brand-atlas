import { supabase } from './supabase-client';

export async function refreshSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  // Optionally, you can refresh the session here if needed
  return data.session;
}

export function supabaseSessionMiddleware(handler: Function) {
  return async (...args: any[]) => {
    await refreshSession();
    return handler(...args);
  };
}
