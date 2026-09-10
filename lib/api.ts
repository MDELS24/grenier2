import { client } from './supabase';
import type { Crate } from './crates';
/** Erreur applicative ; le statut 409 indique une révision devenue obsolète. */
export class CrateError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
/** Lit les caisses accessibles à la session ; les politiques RLS filtrent côté serveur. */
export async function listCrates(): Promise<Crate[]> {
  const { data, error } = await client()
    .from('boxes')
    .select('*')
    .order('id', { ascending: false });
  if (error) throw error;
  return data as Crate[];
}
/** Appelle l’unique point d’écriture, qui vérifie propriétaire et révision atomiquement. */
export async function mutateCrate(method: string, payload: unknown): Promise<Crate> {
  const { data, error } = await client().rpc('mutate_crate', { operation: method, payload });
  if (error) throw new CrateError(error.message, error.code === '40001' ? 409 : 400);
  return data as Crate;
}
