import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ListChecks, MoveRight, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { mutateCrate } from '@/lib/api';
import {
  countItems,
  crateCode,
  currentLocation,
  formatDate,
  shelfLabel,
  type Crate,
} from '@/lib/crates';
import { currentCrateId, innerBoxCode, type InnerBox } from '@/lib/inner-boxes';

type SortKey =
  'code' | 'name' | 'category' | 'home' | 'shelf' | 'current' | 'boxes' | 'items' | 'created';

/** Vue compacte pour trier l'inventaire et appliquer une action à plusieurs caisses. */
export default function CrateTable({
  boxes,
  innerBoxes,
  onChange,
  onOpen,
  openRequest = 0,
}: {
  boxes: Crate[];
  innerBoxes: InnerBox[];
  onChange: () => void;
  onOpen: (box: Crate) => void;
  openRequest?: number;
}) {
  const handledOpenRequest = useRef(openRequest);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('code');
  const [ascending, setAscending] = useState(true);
  const [destination, setDestination] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (openRequest === handledOpenRequest.current) return;
    handledOpenRequest.current = openRequest;
    openTable();
  }, [openRequest]);

  const rows = useMemo(() => {
    const value = (box: Crate) => {
      if (sort === 'code') return crateCode(box);
      if (sort === 'home') return box.location;
      if (sort === 'current') return currentLocation(box);
      if (sort === 'shelf') return shelfLabel(box);
      if (sort === 'boxes')
        return innerBoxes.filter((innerBox) => currentCrateId(innerBox) === box.id).length;
      if (sort === 'items') return countItems(box.items);
      if (sort === 'created') return box.created_at || '';
      return box[sort];
    };
    return [...boxes].sort((a, b) => {
      const left = value(a),
        right = value(b);
      const comparison =
        typeof left === 'number'
          ? left - Number(right)
          : String(left).localeCompare(String(right), 'fr', { numeric: true, sensitivity: 'base' });
      return ascending ? comparison : -comparison;
    });
  }, [boxes, innerBoxes, sort, ascending]);

  function toggleSort(key: SortKey) {
    if (sort === key) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(true);
    }
  }
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function openCrate(box: Crate) {
    setOpen(false);
    onOpen(box);
  }
  async function run(action: 'move' | 'delete') {
    const targets = rows.filter((box) => selected.has(box.id));
    if (!targets.length || (action === 'move' && !destination.trim())) return;
    setBusy(true);
    setMessage('');
    let completed = 0;
    try {
      for (const box of targets) {
        if (action === 'delete')
          await mutateCrate('DELETE', { id: box.id, revision: box.revision });
        else
          await mutateCrate('PATCH', {
            id: box.id,
            revision: box.revision,
            action: 'move',
            destination: destination.trim(),
            return_date: returnDate || null,
            move_note: 'Déplacement groupé',
          });
        completed++;
      }
      setSelected(new Set());
      setConfirmDelete(false);
      setMessage(
        action === 'delete'
          ? `${completed} caisse(s) supprimée(s).`
          : `${completed} caisse(s) déplacée(s) vers « ${destination.trim()} ».`,
      );
    } catch (error) {
      setMessage(
        `${completed} action(s) terminée(s), puis l'opération s'est arrêtée : ${(error as Error).message}`,
      );
    } finally {
      setBusy(false);
      onChange();
    }
  }

  const allSelected = rows.length > 0 && rows.every((box) => selected.has(box.id));
  function openTable() {
    // Une nouvelle session commence sans choix conservé d'une ouverture précédente.
    setSelected(new Set());
    setDestination('');
    setReturnDate('');
    setMessage('');
    setOpen(true);
  }
  const heading = (key: SortKey, label: string) => (
    <button type="button" onClick={() => toggleSort(key)} aria-label={`Trier par ${label}`}>
      {label} <ArrowUpDown size={13} />
      {sort === key && <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>}
    </button>
  );
  return (
    <>
      <button className="secondary" onClick={openTable}>
        <ListChecks size={17} /> Tableau des caisses
      </button>
      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent className="crate-dialog table-dialog">
          <DialogTitle>Tableau des caisses</DialogTitle>
          <DialogDescription>
            Triez les colonnes, cochez plusieurs caisses, puis déplacez-les ou supprimez-les en une
            seule opération.
          </DialogDescription>
          <div className="bulk-toolbar">
            <span>
              <strong>{selected.size}</strong> sélectionnée(s)
            </span>
            <label>
              Destination temporaire
              <input
                value={destination}
                maxLength={100}
                placeholder="Ex. Bureau"
                onChange={(event) => setDestination(event.target.value)}
              />
            </label>
            <label>
              Retour prévu <span className="muted">— facultatif</span>
              <input
                type="date"
                value={returnDate}
                onChange={(event) => setReturnDate(event.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !selected.size || !destination.trim()}
              onClick={() => void run('move')}
            >
              <MoveRight size={16} /> Déplacer
            </button>
            <button
              className="danger"
              disabled={busy || !selected.size}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} /> Supprimer
            </button>
          </div>
          {message && (
            <p role="status" className="bulk-message">
              {message}
            </p>
          )}
          <div className="crate-table-wrap">
            <table className="crate-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Sélectionner toutes les caisses"
                      checked={allSelected}
                      onChange={() =>
                        setSelected(allSelected ? new Set() : new Set(rows.map((box) => box.id)))
                      }
                    />
                  </th>
                  <th>{heading('code', 'Repère')}</th>
                  <th>{heading('name', 'Nom')}</th>
                  <th>{heading('category', 'Catégorie')}</th>
                  <th>{heading('home', 'Place habituelle')}</th>
                  <th>{heading('shelf', 'Étagère')}</th>
                  <th>{heading('current', 'Emplacement actuel')}</th>
                  <th>{heading('boxes', 'Boîtes')}</th>
                  <th>{heading('items', 'Objets')}</th>
                  <th>{heading('created', 'Créée le')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((box) => (
                  <tr
                    key={box.id}
                    className={selected.has(box.id) ? 'selected' : ''}
                    tabIndex={0}
                    aria-label={`Ouvrir ${crateCode(box)} · ${box.name}`}
                    onClick={() => openCrate(box)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCrate(box);
                      }
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${crateCode(box)} · ${box.name}`}
                        checked={selected.has(box.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggle(box.id)}
                      />
                    </td>
                    <td>
                      <strong>{crateCode(box)}</strong>
                    </td>
                    <td>{box.name}</td>
                    <td>{box.category}</td>
                    <td>{box.location}</td>
                    <td>{shelfLabel(box) || '—'}</td>
                    <td>
                      {currentLocation(box)}
                      {box.temporary_location && <span className="table-badge">temporaire</span>}
                    </td>
                    <td className="inner-boxes-cell">
                      {innerBoxes
                        .filter((innerBox) => currentCrateId(innerBox) === box.id)
                        .map((innerBox) => (
                          <span key={innerBox.id} title={innerBox.name}>
                            {innerBoxCode(innerBox)}
                          </span>
                        ))}
                      {!innerBoxes.some((innerBox) => currentCrateId(innerBox) === box.id) && '—'}
                    </td>
                    <td>{countItems(box.items)}</td>
                    <td>{box.created_at ? formatDate(box.created_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={(value) => !busy && setConfirmDelete(value)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer {selected.size} caisse(s) ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les fiches sélectionnées et leurs listes d'objets seront supprimées définitivement.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void run('delete');
              }}
            >
              {busy ? 'Suppression…' : 'Supprimer les caisses'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
