import { useEffect, useState } from 'react';
import { Boxes, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { mutateInnerBox } from '@/lib/api';
import { innerBoxCode, type InnerBox } from '@/lib/inner-boxes';

type Props = {
  box: InnerBox | null;
  onClose: () => void;
  onSaved: (box: InnerBox) => void;
};

/** Éditeur plein écran des objets contenus dans une boîte intérieure. */
export default function InnerBoxContentsEditor({ box, onClose, onSaved }: Props) {
  const [items, setItems] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!box) return;
    setItems(box.items);
    setMessage('');
  }, [box]);

  async function save() {
    if (!box) return;
    setBusy(true);
    setMessage('');
    try {
      const saved = items === box.items ? box : await mutateInnerBox('PUT', { ...box, items });
      setMessage('Le contenu de la boîte a été enregistré.');
      onSaved(saved);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!box} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="contents-editor-dialog">
        <header className="contents-editor-header">
          <div>
            <DialogTitle>Objets de {box ? innerBoxCode(box) : ''}</DialogTitle>
            <DialogDescription>
              Modifiez sur une grande page tous les objets contenus dans cette boîte.
            </DialogDescription>
          </div>
          <button className="primary" disabled={busy} onClick={() => void save()}>
            <Save size={17} /> {busy ? 'Enregistrement…' : 'Tout enregistrer'}
          </button>
        </header>
        <div className="contents-editor-grid single-contents-editor-grid">
          <section className="contents-panel inner-box-contents-panel">
            <h3>
              <Boxes size={18} /> {box ? innerBoxCode(box) : ''} · {box?.name}
            </h3>
            <label>
              Objets dans cette boîte <span className="muted">— un par ligne</span>
              <textarea
                rows={18}
                maxLength={10000}
                value={items}
                onChange={(event) => setItems(event.target.value)}
              />
            </label>
          </section>
        </div>
        {message && (
          <p role="status" className={message.includes('enregistré') ? 'login-success' : 'error'}>
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
