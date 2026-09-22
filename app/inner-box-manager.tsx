import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Box as BoxIcon,
  Boxes,
  MoveRight,
  Plus,
  QrCode,
  Trash2,
  Undo2,
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
import { mutateInnerBox } from '@/lib/api';
import { countItems, crateCode, dateInDays, formatDate, type Crate } from '@/lib/crates';
import {
  crateName,
  currentCrateId,
  emptyInnerBox,
  innerBoxCode,
  innerBoxCurrentLocation,
  innerBoxIsMoved,
  type InnerBox,
} from '@/lib/inner-boxes';

export type InnerBoxRequest = { token: number; id?: string; homeCrateId?: string };
type SortKey = 'code' | 'name' | 'home' | 'current' | 'items' | 'created';
type MoveMode = 'permanent' | 'temporary-crate' | 'outside';
type MoveDraft = {
  box: InnerBox;
  mode: MoveMode;
  destinationCrateId: string;
  destination: string;
  returnDate: string;
  note: string;
};

/** Gestion des petites boîtes : rangement permanent, déplacement, contenu et tableau. */
export default function InnerBoxManager({
  innerBoxes,
  crates,
  onChange,
  request,
  onPrintQr,
}: {
  innerBoxes: InnerBox[];
  crates: Crate[];
  onChange: () => void;
  request?: InnerBoxRequest;
  onPrintQr: (box: InnerBox) => void;
}) {
  const handledRequest = useRef(0);
  const [tableOpen, setTableOpen] = useState(false);
  const [editor, setEditor] = useState<InnerBox | null>(null);
  const [movement, setMovement] = useState<MoveDraft | null>(null);
  const [deleting, setDeleting] = useState<InnerBox | null>(null);
  const [sort, setSort] = useState<SortKey>('code');
  const [ascending, setAscending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!request || request.token === handledRequest.current) return;
    handledRequest.current = request.token;
    const existing = request.id ? innerBoxes.find((box) => box.id === request.id) : null;
    setEditor(
      existing
        ? { ...existing }
        : { ...emptyInnerBox, home_crate_id: request.homeCrateId || crates[0]?.id || '' },
    );
    setTableOpen(false);
    setError('');
  }, [request, innerBoxes, crates]);

  const rows = useMemo(() => {
    const value = (box: InnerBox) => {
      if (sort === 'home') return crateName(crates, box.home_crate_id);
      if (sort === 'current') return innerBoxCurrentLocation(box, crates);
      if (sort === 'items') return countItems(box.items);
      if (sort === 'created') return box.created_at;
      return box[sort];
    };
    return [...innerBoxes].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const comparison =
        typeof left === 'number'
          ? left - Number(right)
          : String(left).localeCompare(String(right), 'fr', { numeric: true, sensitivity: 'base' });
      return ascending ? comparison : -comparison;
    });
  }, [innerBoxes, crates, sort, ascending]);

  function toggleSort(key: SortKey) {
    if (sort === key) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(true);
    }
  }

  const heading = (key: SortKey, label: string) => (
    <button type="button" onClick={() => toggleSort(key)} aria-label={`Trier par ${label}`}>
      {label} <ArrowUpDown size={13} />
      {sort === key && <span aria-hidden="true">{ascending ? '↑' : '↓'}</span>}
    </button>
  );

  function openEditor(box: InnerBox) {
    setTableOpen(false);
    setEditor({ ...box });
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError('');
    try {
      await mutateInnerBox(editor.id ? 'PUT' : 'POST', editor);
      setEditor(null);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await mutateInnerBox('DELETE', { id: deleting.id, revision: deleting.revision });
      setDeleting(null);
      setEditor(null);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startMove(box: InnerBox) {
    const mode: MoveMode = box.temporary_location
      ? 'outside'
      : box.temporary_crate_id
        ? 'temporary-crate'
        : 'temporary-crate';
    setEditor(null);
    setMovement({
      box,
      mode,
      destinationCrateId: box.temporary_crate_id || '',
      destination: box.temporary_location || '',
      returnDate: innerBoxIsMoved(box) ? box.return_date || '' : dateInDays(7),
      note: box.move_note || '',
    });
    setError('');
  }

  async function saveMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!movement) return;
    setBusy(true);
    setError('');
    try {
      const common = { id: movement.box.id, revision: movement.box.revision };
      if (movement.mode === 'permanent') {
        await mutateInnerBox('PATCH', {
          ...common,
          action: 'relocate',
          destination_crate_id: movement.destinationCrateId,
        });
      } else if (movement.mode === 'temporary-crate') {
        await mutateInnerBox('PATCH', {
          ...common,
          action: 'move_crate',
          destination_crate_id: movement.destinationCrateId,
          return_date: movement.returnDate || null,
          move_note: movement.note,
        });
      } else {
        await mutateInnerBox('PATCH', {
          ...common,
          action: 'move_outside',
          destination: movement.destination,
          return_date: movement.returnDate || null,
          move_note: movement.note,
        });
      }
      setMovement(null);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function returnHome(box: InnerBox) {
    setBusy(true);
    setError('');
    try {
      await mutateInnerBox('PATCH', { id: box.id, revision: box.revision, action: 'return' });
      setEditor(null);
      onChange();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="secondary" onClick={() => setTableOpen(true)}>
        <Boxes size={17} /> Tableau des boîtes
      </button>
      <button
        className="secondary"
        onClick={() => setEditor({ ...emptyInnerBox, home_crate_id: crates[0]?.id || '' })}
        disabled={!crates.length}
      >
        <Plus size={17} /> Nouvelle boîte
      </button>

      <Dialog open={tableOpen} onOpenChange={(value) => !busy && setTableOpen(value)}>
        <DialogContent className="crate-dialog table-dialog">
          <DialogTitle>Tableau des boîtes</DialogTitle>
          <DialogDescription>
            Une boîte B-… se range dans une caisse G-…. Cliquez sur une ligne pour la modifier ou la
            déplacer.
          </DialogDescription>
          <div className="crate-table-wrap">
            <table className="crate-table">
              <thead>
                <tr>
                  <th>{heading('code', 'Repère')}</th>
                  <th>{heading('name', 'Nom')}</th>
                  <th>{heading('home', 'Caisse habituelle')}</th>
                  <th>{heading('current', 'Emplacement actuel')}</th>
                  <th>{heading('items', 'Objets')}</th>
                  <th>{heading('created', 'Créée le')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((box) => (
                  <tr
                    key={box.id}
                    tabIndex={0}
                    aria-label={`Ouvrir ${innerBoxCode(box)} · ${box.name}`}
                    onClick={() => openEditor(box)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') openEditor(box);
                    }}
                  >
                    <td>
                      <strong>{innerBoxCode(box)}</strong>
                    </td>
                    <td>{box.name}</td>
                    <td>{crateName(crates, box.home_crate_id)}</td>
                    <td>
                      {innerBoxCurrentLocation(box, crates)}
                      {innerBoxIsMoved(box) && <span className="table-badge">temporaire</span>}
                    </td>
                    <td>{countItems(box.items)}</td>
                    <td>{formatDate(box.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="field-help">Aucune boîte enregistrée.</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editor} onOpenChange={(value) => !busy && !value && setEditor(null)}>
        <DialogContent className="crate-dialog inner-box-dialog">
          <DialogTitle>
            {editor?.id ? `${innerBoxCode(editor)} · Ma boîte` : 'Une nouvelle boîte'}
          </DialogTitle>
          <DialogDescription>
            Les boîtes portent un repère B-… pour ne pas les confondre avec les caisses G-….
          </DialogDescription>
          {editor?.id && (
            <div className="detail-movement inner-box-location">
              <span className="where-label">Actuellement</span>
              <strong>{innerBoxCurrentLocation(editor, crates)}</strong>
              <p>Caisse habituelle : {crateName(crates, editor.home_crate_id)}</p>
              {editor.return_date && <p>Retour prévu : {formatDate(editor.return_date)}</p>}
              <div className="crate-actions">
                <button className="secondary" onClick={() => startMove(editor)}>
                  <MoveRight size={16} /> Déplacer la boîte
                </button>
                {innerBoxIsMoved(editor) && (
                  <button className="return-button" onClick={() => void returnHome(editor)}>
                    <Undo2 size={16} /> Remettre dans sa caisse
                  </button>
                )}
              </div>
            </div>
          )}
          {editor && (
            <form onSubmit={save}>
              <label>
                Repère / numéro de boîte
                <input
                  maxLength={60}
                  value={editor.code}
                  required={!!editor.id}
                  placeholder="Automatique : B-000001"
                  onChange={(event) => setEditor({ ...editor, code: event.target.value })}
                />
              </label>
              <p className="field-help">
                Le préfixe B distingue immédiatement une boîte intérieure d’une caisse G.
              </p>
              <label>
                Nom de la boîte
                <input
                  required
                  maxLength={100}
                  value={editor.name}
                  placeholder="Ex. Visserie M3"
                  onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                />
              </label>
              <label>
                Caisse habituelle
                <select
                  required
                  value={editor.home_crate_id}
                  disabled={innerBoxIsMoved(editor)}
                  onChange={(event) => setEditor({ ...editor, home_crate_id: event.target.value })}
                >
                  <option value="">Choisir une caisse</option>
                  {crates.map((crate) => (
                    <option key={crate.id} value={crate.id}>
                      {crateCode(crate)} · {crate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Contenu <span className="muted">— un objet par ligne</span>
                <textarea
                  rows={5}
                  maxLength={10000}
                  value={editor.items}
                  onChange={(event) => setEditor({ ...editor, items: event.target.value })}
                />
              </label>
              <label>
                Notes <span className="muted">— facultatif</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={editor.notes}
                  onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
                />
              </label>
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                {editor.id && (
                  <button type="button" className="secondary" onClick={() => onPrintQr(editor)}>
                    <QrCode size={17} /> QR de la boîte
                  </button>
                )}
                {editor.id && (
                  <button
                    type="button"
                    className="danger"
                    aria-label="Supprimer la boîte"
                    onClick={() => setDeleting(editor)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Enregistrer la boîte'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!movement} onOpenChange={(value) => !busy && !value && setMovement(null)}>
        <DialogContent className="crate-dialog movement-dialog">
          <DialogTitle>Déplacer la boîte</DialogTitle>
          <DialogDescription>
            {movement && `${innerBoxCode(movement.box)} · ${movement.box.name}`}
          </DialogDescription>
          {movement && (
            <form onSubmit={saveMovement}>
              <div className="movement-mode" role="radiogroup" aria-label="Type de déplacement">
                {(
                  [
                    ['temporary-crate', 'Autre caisse temporairement'],
                    ['outside', 'À l’extérieur temporairement'],
                    ['permanent', 'Changer de caisse définitivement'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="move-mode"
                      checked={movement.mode === value}
                      onChange={() => setMovement({ ...movement, mode: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {movement.mode === 'outside' ? (
                <label>
                  Emplacement actuel
                  <input
                    required
                    maxLength={100}
                    placeholder="Ex. Bureau"
                    value={movement.destination}
                    onChange={(event) =>
                      setMovement({ ...movement, destination: event.target.value })
                    }
                  />
                </label>
              ) : (
                <label>
                  Caisse de destination
                  <select
                    required
                    value={movement.destinationCrateId}
                    onChange={(event) =>
                      setMovement({ ...movement, destinationCrateId: event.target.value })
                    }
                  >
                    <option value="">Choisir une caisse</option>
                    {crates
                      .filter((crate) => crate.id !== movement.box.home_crate_id)
                      .map((crate) => (
                        <option key={crate.id} value={crate.id}>
                          {crateCode(crate)} · {crate.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {movement.mode !== 'permanent' && (
                <>
                  <label>
                    Retour prévu <span className="muted">— facultatif</span>
                    <input
                      type="date"
                      value={movement.returnDate}
                      onChange={(event) =>
                        setMovement({ ...movement, returnDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Motif <span className="muted">— facultatif</span>
                    <textarea
                      rows={2}
                      value={movement.note}
                      onChange={(event) => setMovement({ ...movement, note: event.target.value })}
                    />
                  </label>
                </>
              )}
              {error && <p className="error">{error}</p>}
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setMovement(null)}>
                  Annuler
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Confirmer le déplacement'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(value) => !busy && !value && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer cette boîte ?</AlertDialogTitle>
          <AlertDialogDescription>
            La boîte « {deleting?.name} » et sa liste d’objets seront supprimées.
          </AlertDialogDescription>
          {error && <p className="error">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              Supprimer la boîte
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
