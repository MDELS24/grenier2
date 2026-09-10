export const categories = [
  'Décoration',
  'Vêtements',
  'Souvenirs',
  'Livres & papiers',
  'Équipement',
  'Autre',
];
/** Fiche persistée ; `location` est la place habituelle, `revision` protège les écritures. */
export type Crate = {
  id: string;
  name: string;
  location: string;
  category: string;
  items: string;
  notes: string;
  temporary_location: string | null;
  moved_at: string | null;
  return_date: string | null;
  move_note: string;
  revision: number;
};
export const emptyCrate: Crate = {
  id: '',
  name: '',
  location: '',
  category: 'Autre',
  items: '',
  notes: '',
  temporary_location: null,
  moved_at: null,
  return_date: null,
  move_note: '',
  revision: 0,
};
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
/** Privilégie la destination temporaire tant que le retour n’a pas été confirmé. */
export const currentLocation = (b: Crate) => b.temporary_location || b.location;
export const countItems = (s: string) => s.split('\n').filter((x) => x.trim()).length;
/** Date civile locale YYYY-MM-DD, sans conversion UTC susceptible de changer de jour. */
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** Ajoute des jours calendaires, y compris lors d’un changement d’heure. */
export function dateInDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDate(date);
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value
  );
}
export const overdue = (b: Crate, today = localDate()) =>
  Boolean(b.temporary_location && b.return_date && b.return_date < today);
export const due = (b: Crate, today = localDate()) =>
  Boolean(b.temporary_location && b.return_date && b.return_date <= today);
/** Recherche insensible aux accents dans le contenu, les notes et les deux emplacements. */
export const searchCrates = (boxes: Crate[], query: string) =>
  boxes.filter((b) =>
    normalize(
      [b.id, b.name, b.items, b.location, b.temporary_location, b.notes, b.move_note].join(' '),
    ).includes(normalize(query)),
  );
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value.length === 10 ? value + 'T12:00:00' : value));
}
