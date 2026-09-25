import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  Boxes,
  ChevronRight,
  ListChecks,
  MoveRight,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
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
import { mutateCrate, mutateInnerBox } from '@/lib/api';
import {
  countItems,
  crateCode,
  currentLocation,
  formatDate,
  normalize,
  shelfLabel,
  type Crate,
} from '@/lib/crates';
import {
  currentCrateId,
  innerBoxCode,
  innerBoxCurrentLocation,
  innerBoxFollowsMovedCrate,
  innerBoxIsMoved,
  type InnerBox,
} from '@/lib/inner-boxes';

type SortKey = 'code' | 'name' | 'type' | 'home' | 'current' | 'items' | 'created';

/** Explorateur compact des caisses et des boîtes qu'elles contiennent. */
export default function CrateTable({
  boxes,
  innerBoxes,
  onChange,
  onOpen,
  onOpenInnerBox,
  onPrintSelection,
  openRequest = 0,
}: {
  boxes: Crate[];
  innerBoxes: InnerBox[];
  onChange: () => void;
  onOpen: (box: Crate) => void;
  onOpenInnerBox: (box: InnerBox) => void;
  onPrintSelection: (keys: string[]) => void;
  openRequest?: number;
}) {
  const handledOpenRequest = useRef(openRequest);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
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

  const visibleCrates = useMemo(() => {
    const needle = normalize(query);
    const matchingParents = new Set(
      innerBoxes
        .filter((box) => normalize([box.code, box.name, box.items].join(' ')).includes(needle))
        .map(currentCrateId)
        .filter(Boolean),
    );
    const value = (box: Crate): string | number => {
      if (sort === 'code') return crateCode(box);
      if (sort === 'type') return 'Caisse';
      if (sort === 'home') return `${box.location} ${shelfLabel(box)}`;
      if (sort === 'current') return currentLocation(box);
      if (sort === 'items') return countItems(box.items);
      if (sort === 'created') return box.created_at || '';
      return box.name;
    };
    return boxes
      .filter(
        (box) =>
          !needle ||
          normalize(
            [crateCode(box), box.name, box.category, box.location, shelfLabel(box), box.items].join(
              ' ',
            ),
          ).includes(needle) ||
          matchingParents.has(box.id),
      )
      .sort((a, b) => {
        const left = value(a),
          right = value(b);
        const comparison =
          typeof left === 'number'
            ? left - Number(right)
            : String(left).localeCompare(String(right), 'fr', {
                numeric: true,
                sensitivity: 'base',
              });
        return ascending ? comparison : -comparison;
      });
  }, [boxes, innerBoxes, query, sort, ascending]);

  const visibleKeys = useMemo(
    () =>
      visibleCrates.flatMap((crate) => [
        `crate:${crate.id}`,
        ...innerBoxes
          .filter((box) => currentCrateId(box) === crate.id)
          .map((box) => `box:${box.id}`),
      ]),
    [visibleCrates, innerBoxes],
  );
  const selectedCrates = boxes.filter((box) => selected.has(`crate:${box.id}`));
  const selectedBoxes = innerBoxes.filter((box) => selected.has(`box:${box.id}`));

  function toggleSort(key: SortKey) {
    if (sort === key) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(true);
    }
  }
  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function openTable() {
    setSelected(new Set());
    setExpanded(new Set());
    setDestination('');
    setReturnDate('');
    setMessage('');
    setOpen(true);
  }

  async function moveSelected() {
    if (!selected.size || !destination.trim()) return;
    setBusy(true);
    setMessage('');
    let completed = 0;
    try {
      const boxesToMove = selectedBoxes.filter(
        (box) => !selected.has(`crate:${currentCrateId(box)}`),
      );
      for (const box of boxesToMove) {
        await mutateInnerBox('PATCH', {
          id: box.id,
          revision: box.revision,
          action: 'move_outside',
          destination: destination.trim(),
          return_date: returnDate || null,
          move_note: 'Déplacement groupé',
        });
        completed++;
      }
      for (const crate of selectedCrates) {
        await mutateCrate('PATCH', {
          id: crate.id,
          revision: crate.revision,
          action: 'move',
          destination: destination.trim(),
          return_date: returnDate || null,
          move_note: 'Déplacement groupé',
        });
        completed++;
      }
      setSelected(new Set());
      setMessage(`${completed} contenant(s) déplacé(s) vers « ${destination.trim()} ».`);
    } catch (error) {
      setMessage(`${completed} action(s) terminée(s), puis arrêt : ${(error as Error).message}`);
    } finally {
      setBusy(false);
      onChange();
    }
  }

  async function removeSelected() {
    setBusy(true);
    setMessage('');
    let completed = 0;
    try {
      for (const box of selectedBoxes) {
        await mutateInnerBox('DELETE', { id: box.id, revision: box.revision });
        completed++;
      }
      for (const crate of selectedCrates) {
        await mutateCrate('DELETE', { id: crate.id, revision: crate.revision });
        completed++;
      }
      setSelected(new Set());
      setMessage(`${completed} contenant(s) supprimé(s).`);
    } catch (error) {
      setMessage(
        `${completed} suppression(s) terminée(s), puis arrêt : ${(error as Error).message}`,
      );
    } finally {
      setConfirmDelete(false);
      setBusy(false);
      onChange();
    }
  }

  const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key));
  const heading = (key: SortKey, label: string) => (
    <button type="button" onClick={() => toggleSort(key)} aria-label={`Trier par ${label}`}>
      {label} <ArrowUpDown size={13} />
      {sort === key && <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <>
      <button
        className="secondary menu-icon-button"
        onClick={openTable}
        aria-label="Tableau des contenants"
        title="Tableau des contenants"
      >
        <ListChecks />
      </button>
      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent className="crate-dialog table-dialog storage-table-dialog">
          <DialogTitle>Tableau des caisses et boîtes</DialogTitle>
          <DialogDescription>
            Recherchez, triez et dépliez une caisse pour voir ses boîtes comme dans un explorateur
            de fichiers.
          </DialogDescription>
          <label className="search storage-table-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un contenant ou un objet…"
            />
          </label>
          <div className="bulk-toolbar">
            <span>
              <strong>{selected.size}</strong> sélectionné(s)
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
              onClick={() => void moveSelected()}
            >
              <MoveRight size={16} /> Déplacer
            </button>
            <button
              className="secondary"
              disabled={!selected.size}
              onClick={() => onPrintSelection([...selected])}
            >
              <Printer size={16} /> QR
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
            <table className="crate-table storage-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(visibleKeys))}
                    />
                  </th>
                  <th>{heading('code', 'Repère')}</th>
                  <th>{heading('name', 'Nom')}</th>
                  <th>{heading('type', 'Type')}</th>
                  <th>{heading('home', 'Place habituelle')}</th>
                  <th>{heading('current', 'Emplacement actuel')}</th>
                  <th>{heading('items', 'Objets')}</th>
                  <th>{heading('created', 'Créé le')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleCrates.map((crate) => {
                  const children = innerBoxes.filter((box) => currentCrateId(box) === crate.id);
                  const showChildren = expanded.has(crate.id) || Boolean(query.trim());
                  return [
                    <tr
                      key={`crate:${crate.id}`}
                      className={selected.has(`crate:${crate.id}`) ? 'selected' : ''}
                      tabIndex={0}
                      onClick={() => {
                        setOpen(false);
                        onOpen(crate);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setOpen(false);
                          onOpen(crate);
                        }
                      }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner ${crateCode(crate)}`}
                          checked={selected.has(`crate:${crate.id}`)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggle(`crate:${crate.id}`)}
                        />
                      </td>
                      <td>
                        <span className="tree-cell">
                          <button
                            type="button"
                            className={showChildren ? 'tree-toggle expanded' : 'tree-toggle'}
                            aria-label={showChildren ? 'Replier la caisse' : 'Déplier la caisse'}
                            disabled={!children.length}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleExpanded(crate.id);
                            }}
                          >
                            <ChevronRight size={16} />
                          </button>
                          <strong>{crateCode(crate)}</strong>
                        </span>
                      </td>
                      <td>{crate.name}</td>
                      <td>
                        <span className="type-badge">
                          <Archive size={14} /> Caisse
                        </span>
                      </td>
                      <td>
                        {crate.location}
                        {shelfLabel(crate) && (
                          <small className="table-subline">{shelfLabel(crate)}</small>
                        )}
                      </td>
                      <td>
                        {currentLocation(crate)}
                        {crate.temporary_location && (
                          <span className="table-badge">
                            temporaire · {children.length} boîte(s) suivent
                          </span>
                        )}
                      </td>
                      <td>{countItems(crate.items)}</td>
                      <td>{crate.created_at ? formatDate(crate.created_at) : '—'}</td>
                    </tr>,
                    ...(showChildren
                      ? children.map((box) => (
                          <tr
                            key={`box:${box.id}`}
                            className={`tree-child ${selected.has(`box:${box.id}`) ? 'selected' : ''}`}
                            tabIndex={0}
                            onClick={() => {
                              setOpen(false);
                              onOpenInnerBox(box);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                setOpen(false);
                                onOpenInnerBox(box);
                              }
                            }}
                          >
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Sélectionner ${innerBoxCode(box)}`}
                                checked={selected.has(`box:${box.id}`)}
                                onClick={(event) => event.stopPropagation()}
                                onChange={() => toggle(`box:${box.id}`)}
                              />
                            </td>
                            <td>
                              <span className="tree-cell child">
                                <span className="tree-guide" />
                                <strong>{innerBoxCode(box)}</strong>
                              </span>
                            </td>
                            <td>{box.name}</td>
                            <td>
                              <span className="type-badge box">
                                <Boxes size={14} /> Boîte
                              </span>
                            </td>
                            <td>
                              {crateCode(
                                boxes.find((candidate) => candidate.id === box.home_crate_id) ||
                                  crate,
                              )}
                            </td>
                            <td>
                              {innerBoxCurrentLocation(box, boxes)}
                              {innerBoxIsMoved(box) && (
                                <span className="table-badge">temporaire</span>
                              )}
                              {innerBoxFollowsMovedCrate(box, boxes) && (
                                <span className="table-badge inherited">suit la caisse</span>
                              )}
                            </td>
                            <td>{countItems(box.items)}</td>
                            <td>{formatDate(box.created_at)}</td>
                          </tr>
                        ))
                      : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
          {!visibleCrates.length && <p>Aucun contenant ne correspond à cette recherche.</p>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={(value) => !busy && setConfirmDelete(value)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer {selected.size} contenant(s) ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les fiches et leurs objets seront supprimés. Une caisse contenant encore une boîte non
            sélectionnée reste protégée.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void removeSelected();
              }}
            >
              {busy ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
