import { useEffect, useMemo, useState } from 'react';
import { Archive, Boxes, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { mutateCrate, mutateInnerBox } from '@/lib/api';
import { crateCode, type Crate } from '@/lib/crates';
import { currentCrateId, innerBoxCode, type InnerBox } from '@/lib/inner-boxes';

type Props = {
  crate: Crate | null;
  innerBoxes: InnerBox[];
  onClose: () => void;
  onSaved: (crate: Crate) => void;
};

/** Éditeur plein écran du contenu direct et imbriqué d'une caisse. */
export default function CrateContentsEditor({ crate, innerBoxes, onClose, onSaved }: Props) {
  const contained = useMemo(
    () => (crate ? innerBoxes.filter((box) => currentCrateId(box) === crate.id) : []),
    [crate, innerBoxes],
  );
  const containedRevision = contained.map((box) => `${box.id}:${box.revision}`).join('|');
  const [crateItems, setCrateItems] = useState('');
  const [boxItems, setBoxItems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!crate) return;
    setCrateItems(crate.items);
    setBoxItems(Object.fromEntries(contained.map((box) => [box.id, box.items])));
  }, [crate?.id, crate?.revision, containedRevision]);

  useEffect(() => {
    setMessage('');
  }, [crate?.id]);

  async function saveAll() {
    if (!crate) return;
    setBusy(true);
    setMessage('');
    try {
      let savedCrate = crate;
      if (crateItems !== crate.items) {
        savedCrate = await mutateCrate('PUT', { ...crate, items: crateItems });
      }
      for (const box of contained) {
        const items = boxItems[box.id] ?? '';
        if (items !== box.items) await mutateInnerBox('PUT', { ...box, items });
      }
      setMessage('Tous les contenus ont été enregistrés.');
      onSaved(savedCrate);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!crate} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="contents-editor-dialog">
        <header className="contents-editor-header">
          <div>
            <DialogTitle>Objets de {crate ? crateCode(crate) : ''}</DialogTitle>
            <DialogDescription>
              Modifiez sur une même page la caisse et toutes les boîtes qu'elle contient
              actuellement.
            </DialogDescription>
          </div>
          <button className="primary" disabled={busy} onClick={() => void saveAll()}>
            <Save size={17} /> {busy ? 'Enregistrement…' : 'Tout enregistrer'}
          </button>
        </header>
        <div className="contents-editor-grid">
          <section className="contents-panel crate-contents-panel">
            <h3>
              <Archive size={18} /> Caisse · {crate?.name}
            </h3>
            <label>
              Objets directement dans la caisse <span className="muted">— un par ligne</span>
              <textarea
                rows={14}
                maxLength={10000}
                value={crateItems}
                onChange={(event) => setCrateItems(event.target.value)}
              />
            </label>
          </section>
          {contained.map((box) => (
            <section className="contents-panel" key={box.id}>
              <h3>
                <Boxes size={18} /> {innerBoxCode(box)} · {box.name}
              </h3>
              <label>
                Objets dans cette boîte <span className="muted">— un par ligne</span>
                <textarea
                  rows={10}
                  maxLength={10000}
                  value={boxItems[box.id] ?? ''}
                  onChange={(event) =>
                    setBoxItems((current) => ({ ...current, [box.id]: event.target.value }))
                  }
                />
              </label>
            </section>
          ))}
          {!contained.length && (
            <p className="field-help">Cette caisse ne contient aucune boîte.</p>
          )}
        </div>
        {message && (
          <p role="status" className={message.includes('enregistrés') ? 'login-success' : 'error'}>
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
