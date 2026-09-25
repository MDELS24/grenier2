import { countItems, currentLocation, normalize, type Crate } from './crates.ts';

/** Petite boîte rangée dans une caisse ; `home_crate_id` reste sa destination de retour. */
export type InnerBox = {
  id: string;
  code: string;
  name: string;
  home_crate_id: string;
  temporary_crate_id: string | null;
  temporary_location: string | null;
  items: string;
  notes: string;
  moved_at: string | null;
  return_date: string | null;
  move_note: string;
  revision: number;
  created_at: string;
};

export const emptyInnerBox: InnerBox = {
  id: '',
  code: '',
  name: '',
  home_crate_id: '',
  temporary_crate_id: null,
  temporary_location: null,
  items: '',
  notes: '',
  moved_at: null,
  return_date: null,
  move_note: '',
  revision: 0,
  created_at: '',
};

export const innerBoxCode = (box: InnerBox) => box.code || box.id;
export const innerBoxIsMoved = (box: InnerBox) =>
  Boolean(box.temporary_crate_id || box.temporary_location);

/** Caisse dans laquelle la boîte se trouve physiquement, ou null lorsqu'elle est à l'extérieur. */
export const currentCrateId = (box: InnerBox) =>
  box.temporary_location ? null : box.temporary_crate_id || box.home_crate_id;

export function crateName(crates: Crate[], id: string | null) {
  const crate = crates.find((candidate) => candidate.id === id);
  return crate ? `${crate.code || crate.id} · ${crate.name}` : 'Caisse introuvable';
}

export function innerBoxCurrentLocation(box: InnerBox, crates: Crate[]) {
  if (box.temporary_location) return box.temporary_location;
  const crate = crates.find((candidate) => candidate.id === currentCrateId(box));
  if (!crate) return 'Caisse introuvable';
  return currentLocation(crate);
}

/** Indique si la boîte suit le déplacement de la caisse qui la contient. */
export function innerBoxFollowsMovedCrate(box: InnerBox, crates: Crate[]) {
  if (innerBoxIsMoved(box)) return false;
  const crate = crates.find((candidate) => candidate.id === box.home_crate_id);
  return Boolean(crate?.temporary_location);
}

export const countInnerBoxItems = (box: InnerBox) => countItems(box.items);

/** Recherche dans le repère, le contenu et les caisses de rangement actuelle et habituelle. */
export function searchInnerBoxes(innerBoxes: InnerBox[], crates: Crate[], query: string) {
  const needle = normalize(query);
  return innerBoxes.filter((box) =>
    normalize(
      [
        box.code,
        box.name,
        box.items,
        box.notes,
        box.temporary_location,
        innerBoxCurrentLocation(box, crates),
        crateName(crates, box.home_crate_id),
        crateName(crates, currentCrateId(box)),
      ].join(' '),
    ).includes(needle),
  );
}
