import { crateCode, type Crate } from './crates.ts';
/** Colonnes Grenier2 ; le mapping d’import accepte aussi des colonnes externes. */
export const csvFields = [
  'code',
  'name',
  'location',
  'category',
  'items',
  'notes',
  'temporary_location',
  'moved_at',
  'return_date',
  'move_note',
] as const;
export type CsvField = (typeof csvFields)[number];
export type CsvMapping = Partial<Record<CsvField, string>>;
/** Parse les champs cités et multilignes sans perdre virgules, guillemets ou accents. */
export function parseCsv(input: string) {
  const text = input.replace(/^\uFEFF/, '');
  if (text.length > 5_000_000) throw Error('Fichier trop volumineux (5 Mo maximum).');
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = [';', ',', '\t'].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0];
  const table: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === '"' && !field && !closed) {
      quoted = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = '';
      closed = false;
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(Boolean)) table.push(row);
      row = [];
      field = '';
      closed = false;
      continue;
    }
    if (closed && c.trim())
      throw Error('CSV invalide : caractère après un champ entre guillemets.');
    if (!closed) field += c;
  }
  if (quoted) throw Error('CSV invalide : guillemet non fermé.');
  row.push(field);
  if (row.some(Boolean)) table.push(row);
  if (table.length < 2) throw Error('Le fichier doit contenir des en-têtes et des données.');
  const headers = table.shift()!.map((h) => h.trim());
  const isItemlist = headers.join(',') === itemlistHeaders.join(',');

  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw Error('Les noms de colonnes doivent être renseignés et uniques.');
  if (table.length > 10000) throw Error('Maximum : 10 000 lignes par import.');
  return {
    headers,
    isItemlist,
    repaired: table.filter((r) => r.length !== headers.length).length,
    rows: table.map((source, i) => {
      let r = [...source];
      if (isItemlist && r[1] === 'container' && r.length >= 19 && r.length !== 21) {
        const middle = r.slice(4, -13);
        const notes = middle[0] ? middle.slice(0, -1).join(',') : '';
        const description = middle[0] ? middle.at(-1)! : middle.slice(1).join(',');
        r = [...r.slice(0, 4), notes, '', '', description, ...r.slice(-13)];
      }
      if (r.length !== headers.length)
        throw Error(`Ligne ${i + 2} : nombre de colonnes incorrect.`);
      return Object.fromEntries([
        ...headers.map((h, j) => [h, r[j]]),
        ...(isItemlist ? [['_original', JSON.stringify(source)]] : []),
      ]);
    }),
  };
}
/** Export réimportable : chaque ligne décrit une caisse, déplacements inclus. */
export function exportCsv(boxes: Crate[]) {
  const quote = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  return (
    '\uFEFF' +
    [
      csvFields.join(','),
      ...boxes.map((b) =>
        csvFields.map((f) => quote(f === 'code' ? crateCode(b) : String(b[f] ?? ''))).join(','),
      ),
    ].join('\r\n')
  );
}
/** Propose seulement des correspondances explicites, toujours modifiables avant import. */
export function suggestMapping(headers: string[]): CsvMapping {
  const aliases: Record<CsvField, string[]> = {
    code: ['code', 'repère', 'numero', 'numéro'],
    name: ['name', 'nom', 'container', 'conteneur', 'caisse'],
    location: ['location', 'emplacement', 'room', 'pièce'],
    category: ['category', 'catégorie'],
    items: ['items', 'contenu', 'item', 'item name', 'objet'],
    notes: ['notes', 'description'],
    temporary_location: ['temporary_location'],
    moved_at: ['moved_at'],
    return_date: ['return_date'],
    move_note: ['move_note'],
  };
  return Object.fromEntries(
    csvFields.map((f) => [f, headers.find((h) => aliases[f].includes(h.toLowerCase())) || '']),
  );
}
/** Regroupe les objets externes par caisse uniquement lorsque l’utilisateur le demande. */
export function mapCsv(rows: Record<string, string>[], mapping: CsvMapping, groupItems: boolean) {
  if (!mapping.name || !mapping.location)
    throw Error('Associez les colonnes Nom de caisse et Place habituelle.');
  const mapped = rows.map(
    (row) =>
      Object.fromEntries(
        csvFields.map((f) => [f, mapping[f] ? row[mapping[f]!] || '' : '']),
      ) as Record<CsvField, string>,
  );
  if (!groupItems) return mapped;
  const grouped = new Map<string, Record<CsvField, string>>();
  for (const row of mapped) {
    const key = JSON.stringify([row.code, row.name, row.location]);
    const prev = grouped.get(key);
    if (prev) {
      prev.items = [prev.items, row.items].filter(Boolean).join('\n');
      if (row.notes && row.notes !== prev.notes)
        prev.notes = [prev.notes, row.notes].filter(Boolean).join('\n');
    } else grouped.set(key, { ...row });
  }
  return [...grouped.values()];
}

/** Schéma exact de l’export Itemlist fourni ; les informations de rangement sont absentes. */
export const itemlistHeaders = [
  'id',
  'type',
  'name',
  'quantity',
  'notes',
  'isBorrowed',
  'borrowedTo',
  'description',
  'purchasePrice',
  'currentValue',
  'weight',
  'weightUnit',
  'retailer',
  'brand',
  'model',
  'serialNumber',
  'currentCondition',
  'purchaseDate',
  'expirationDate',
  'createdTime',
  'lastEditedTime',
];
/** Préserve les métadonnées et n’invente pas les liens objet/conteneur absents du CSV. */
export function mapItemlist(rows: Record<string, string>[]) {
  const used = new Set<string>();
  const containers = rows
    .filter((r) => r.type === 'container')
    .map((r) => {
      const base = (r.name.trim() || 'Caisse Itemlist').slice(0, 54);
      let code = base;
      let n = 2;
      while (used.has(code.toLowerCase())) code = base + '-' + n++;
      used.add(code.toLowerCase());
      return {
        code,
        name: r.name.trim() || code,
        location: 'À préciser (Itemlist)',
        category: 'Autre',
        items: '',
        notes: [r.notes, r.description].filter(Boolean).join('\n'),
        temporary_location: '',
        moved_at: '',
        return_date: '',
        move_note: '',
        source_key: 'itemlist:' + r.id,
        itemlist_data: [r],
      };
    });
  const items = rows.filter((r) => r.type === 'item');
  // Une caisse par lot borné respecte la limite de contenu d’une fiche Grenier2.
  for (let start = 0; start < items.length; start += 50) {
    const chunk = items.slice(start, start + 50);
    let code = 'ITEMLIST-A-CLASSER-' + (start / 50 + 1);
    while (used.has(code.toLowerCase())) code += '-2';
    used.add(code.toLowerCase());
    containers.push({
      code,
      name: 'Objets Itemlist à classer ' + (start / 50 + 1),
      location: 'À préciser (Itemlist)',
      category: 'Autre',
      items: chunk
        .map((r) => r.name + (r.quantity && r.quantity !== '1' ? ' × ' + r.quantity : ''))
        .join('\n'),
      notes:
        'L’export Itemlist ne précise pas le conteneur de ces objets. Les métadonnées originales sont conservées pour le réexport.',
      temporary_location: '',
      moved_at: '',
      return_date: '',
      move_note: '',
      source_key: 'itemlist-items:' + chunk.map((r) => r.id).join('|'),
      itemlist_data: chunk,
    });
  }
  if (rows.some((r) => !['container', 'item'].includes(r.type)))
    throw Error('Type Itemlist inconnu. Aucun import effectué.');
  return containers;
}
/** Exporte les colonnes Itemlist, en conservant les métadonnées des objets importés. */
export function exportItemlist(boxes: Crate[]) {
  const records: Record<string, string>[] = [];
  for (const b of boxes) {
    const originals = b.itemlist_data || [];
    const container = originals.find((r) => r.type === 'container');
    if (!originals.length || container)
      records.push({
        ...container,
        id: container?.id || b.id,
        type: 'container',
        name: crateCode(b),
        notes:
          container &&
          b.notes === [container.notes, container.description].filter(Boolean).join('\n')
            ? container.notes
            : b.notes,
        description: container?.description || b.name,
      });
    const items = originals.filter((r) => r.type === 'item');
    for (const [index, line] of b.items.split('\n').filter(Boolean).entries()) {
      const matchIndex = items.findIndex(
        (r) => line === r.name + (r.quantity && r.quantity !== '1' ? ' × ' + r.quantity : ''),
      );
      const original = matchIndex >= 0 ? items.splice(matchIndex, 1)[0] : undefined;
      records.push(
        original || {
          id: b.id + '-item-' + index,
          type: 'item',
          name: line,
          quantity: '1',
          isBorrowed: 'false',
          currentCondition: 'unknown',
        },
      );
    }
  }
  const quote = (v: string) => '"' + v.replace(/"/g, '""') + '"';
  return (
    '\uFEFF' +
    [
      itemlistHeaders.join(','),
      ...records.map((r) => itemlistHeaders.map((h) => quote(r[h] || '')).join(',')),
    ].join('\r\n')
  );
}
