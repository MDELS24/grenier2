import { createClient } from '@supabase/supabase-js';
/** Filtre d’interface, complété impérativement par les règles SQL côté Supabase. */
export const allowedEmail = 'lienmathieu2@gmail.com';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
/** Client unique : seule une clé publique est autorisée dans le bundle navigateur. */
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'grenier2-auth',
          flowType: 'implicit',
        },
      })
    : null;
/** Refuse les appels réseau tant que la configuration de compilation est absente. */
export function client() {
  if (!supabase) throw Error('La connexion n’est pas encore configurée.');
  return supabase;
}
