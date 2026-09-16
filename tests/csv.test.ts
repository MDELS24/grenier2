import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  exportCsv,
  mapCsv,
  suggestMapping,
  itemlistHeaders,
  mapItemlist,
  exportItemlist,
} from '../lib/inventory-csv.ts';
import { emptyCrate } from '../lib/crates.ts';
test('CSV roundtrip: accents, quotes, commas and multiline content', () => {
  const box = {
    ...emptyCrate,
    id: 'internal',
    code: 'Noël-1',
    name: 'Caisse "A", Noël',
    location: 'Grenier',
    items: 'PLA\nPETG',
    notes: 'Ligne 1\nLigne 2',
  };
  const parsed = parseCsv(exportCsv([box]));
  const rows = mapCsv(parsed.rows, suggestMapping(parsed.headers), false);
  assert.equal(rows[0].code, box.code);
  assert.equal(rows[0].items, box.items);
  assert.equal(rows[0].name, box.name);
  assert.throws(() => parseCsv('a,b\n"abc'), /guillemet/);
  assert.throws(() => parseCsv('a,b\n1,2,3'), /colonnes/);
});
test('Itemlist: legacy containers, duplicate names and unattached items', () => {
  const legacy = [
    'C1',
    'container',
    '3',
    '',
    '',
    'Description',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'unknown',
    '',
    '',
    '6 December 2024',
    '6 December 2024',
  ];
  const item = Object.fromEntries(itemlistHeaders.map((h) => [h, '']));
  Object.assign(item, {
    id: 'I1',
    type: 'item',
    name: 'Câble',
    quantity: '2',
    brand: 'Marque',
    currentCondition: 'unknown',
  });
  const csv = [
    itemlistHeaders.join(','),
    legacy.join(','),
    [...legacy.slice(0, 1).map(() => 'C2'), ...legacy.slice(1)].join(','),
    itemlistHeaders.map((h) => item[h]).join(','),
  ].join('\n');
  const parsed = parseCsv(csv);
  assert.equal(parsed.isItemlist, true);
  assert.equal(parsed.rows[0].description, 'Description');
  const boxes = mapItemlist(parsed.rows);
  assert.equal(boxes.length, 3);
  assert.equal(boxes[0].code, '3');
  assert.equal(boxes[1].code, '3-2');
  assert.match(boxes[2].items, /Câble × 2/);
  const exported = parseCsv(
    exportItemlist(
      boxes.map((b, i) => ({
        ...emptyCrate,
        ...b,
        id: 'box' + i,
        temporary_location: null,
        moved_at: null,
        return_date: null,
      })),
    ),
  );
  assert.equal(exported.rows.length, 3);
  assert.equal(exported.rows.find((r) => r.type === 'item')?.brand, 'Marque');
});
