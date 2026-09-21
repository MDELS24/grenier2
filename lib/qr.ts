import type { Crate } from './crates.ts';

export type QrAction = 'view' | 'add' | 'code';

/** Construit un lien stable vers la caisse à partir de son identifiant interne. */
export function crateQrValue(box: Crate, action: QrAction, baseUrl: string) {
  if (action === 'code') return box.code || box.id;
  const url = new URL(baseUrl);
  url.hash = '';
  url.search = '';
  url.searchParams.set('caisse', box.id);
  url.searchParams.set('action', action);
  return url.href;
}

export const pendingQrKey = 'grenier2-pending-qr';
/** Garde uniquement la destination du scan durant la connexion, jamais une image. */
export function rememberQr(search: string, storage: Pick<Storage, 'setItem'>, now = Date.now()) {
  const params = new URLSearchParams(search);
  const id = params.get('caisse');
  if (!id || id.length > 100) return;
  storage.setItem(
    pendingQrKey,
    JSON.stringify({ id, action: params.get('action') === 'add' ? 'add' : 'view', at: now }),
  );
}

/** Consomme une destination récente, partagée avec l’onglet ouvert par l’e-mail. */
export function takePendingQr(storage: Pick<Storage, 'getItem' | 'removeItem'>, now = Date.now()) {
  const raw = storage.getItem(pendingQrKey);
  storage.removeItem(pendingQrKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      typeof value.id !== 'string' ||
      !value.id ||
      value.id.length > 100 ||
      !['view', 'add'].includes(value.action) ||
      typeof value.at !== 'number' ||
      now - value.at < 0 ||
      now - value.at > 3600000
    )
      return null;
    return value as { id: string; action: 'view' | 'add'; at: number };
  } catch {
    return null;
  }
}

/** Ajoute les lignes sans remplacer le contenu existant. */
export function appendContents(current: string, addition: string) {
  if (!addition.trim()) throw Error('Indiquez au moins un objet à ajouter.');
  const result = [current.trimEnd(), addition.trim()].filter(Boolean).join('\n');
  if (result.length > 10000) throw Error('Le contenu dépasserait la limite de 10 000 caractères.');
  return result;
}

/** Accepte un lien Grenier2 ou un simple repère lu sur une étiquette. */
export function resolveQrValue(value: string, boxes: Crate[], origin: string) {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.origin === origin && url.searchParams.has('caisse')) {
      const box = boxes.find((candidate) => candidate.id === url.searchParams.get('caisse'));
      return box
        ? { box, action: url.searchParams.get('action') === 'add' ? 'add' : 'view' }
        : null;
    }
  } catch {
    // Un repère court n’est pas une URL : la recherche continue ci-dessous.
  }
  const box = boxes.find(
    (candidate) =>
      (candidate.code || candidate.id).toLocaleLowerCase() === input.toLocaleLowerCase(),
  );
  return box ? { box, action: 'view' as const } : null;
}
