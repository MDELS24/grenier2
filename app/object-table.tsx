import { useMemo, useState } from 'react';
import { ArrowUpDown, ListTree, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { crateCode, currentLocation, normalize, type Crate } from '@/lib/crates';
import {
  crateName,
  currentCrateId,
  innerBoxCode,
  innerBoxCurrentLocation,
  type InnerBox,
} from '@/lib/inner-boxes';

type ObjectRow = {
  key: string;
  name: string;
  container: string;
  crate: string;
  location: string;
  crateId?: string;
  innerBoxId?: string;
};
type SortKey = 'name' | 'container' | 'crate' | 'location';

/** Index aplati des objets avec leur chemin boîte, caisse et emplacement. */
export default function ObjectTable({
  crates,
  innerBoxes,
  onOpenCrate,
  onOpenInnerBox,
}: {
  crates: Crate[];
  innerBoxes: InnerBox[];
  onOpenCrate: (crate: Crate) => void;
  onOpenInnerBox: (box: InnerBox) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [ascending, setAscending] = useState(true);

  const rows = useMemo(() => {
    const result: ObjectRow[] = [];
    for (const crate of crates) {
      crate.items
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item, index) =>
          result.push({
            key: `crate-${crate.id}-${index}`,
            name: item,
            container: `Caisse ${crateCode(crate)}`,
            crate: `${crateCode(crate)} · ${crate.name}`,
            location: currentLocation(crate),
            crateId: crate.id,
          }),
        );
    }
    for (const box of innerBoxes) {
      const physicalCrate = currentCrateId(box);
      box.items
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item, index) =>
          result.push({
            key: `box-${box.id}-${index}`,
            name: item,
            container: `Boîte ${innerBoxCode(box)} · ${box.name}`,
            crate: physicalCrate ? crateName(crates, physicalCrate) : 'Hors d’une caisse',
            location: innerBoxCurrentLocation(box, crates),
            innerBoxId: box.id,
          }),
        );
    }
    return result;
  }, [crates, innerBoxes]);

  const visible = useMemo(
    () =>
      rows
        .filter((row) => normalize(Object.values(row).join(' ')).includes(normalize(query)))
        .sort((a, b) => {
          const comparison = a[sort].localeCompare(b[sort], 'fr', {
            numeric: true,
            sensitivity: 'base',
          });
          return ascending ? comparison : -comparison;
        }),
    [rows, query, sort, ascending],
  );

  function toggleSort(key: SortKey) {
    if (sort === key) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(true);
    }
  }

  const heading = (key: SortKey, label: string) => (
    <button onClick={() => toggleSort(key)} aria-label={`Trier par ${label}`}>
      {label} <ArrowUpDown size={13} />
      {sort === key && <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>}
    </button>
  );

  function openRow(row: ObjectRow) {
    setOpen(false);
    if (row.innerBoxId) {
      const box = innerBoxes.find((candidate) => candidate.id === row.innerBoxId);
      if (box) onOpenInnerBox(box);
    } else if (row.crateId) {
      const crate = crates.find((candidate) => candidate.id === row.crateId);
      if (crate) onOpenCrate(crate);
    }
  }

  return (
    <>
      <button className="secondary" onClick={() => setOpen(true)}>
        <ListTree size={17} /> Tableau des objets
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="crate-dialog table-dialog">
          <DialogTitle>Tableau des objets</DialogTitle>
          <DialogDescription>
            Retrouvez le chemin complet d’un objet, qu’il soit directement dans une caisse ou dans
            une boîte.
          </DialogDescription>
          <label className="search object-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un objet, une boîte ou une caisse…"
            />
          </label>
          <p className="field-help">{visible.length} objet(s) affiché(s).</p>
          <div className="crate-table-wrap">
            <table className="crate-table">
              <thead>
                <tr>
                  <th>{heading('name', 'Objet')}</th>
                  <th>{heading('container', 'Contenant')}</th>
                  <th>{heading('crate', 'Caisse actuelle')}</th>
                  <th>{heading('location', 'Emplacement')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={row.key}
                    tabIndex={0}
                    onClick={() => openRow(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openRow(row);
                    }}
                  >
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.container}</td>
                    <td>{row.crate}</td>
                    <td>{row.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && <p>Aucun objet ne correspond à cette recherche.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
