import { useState, useEffect } from 'react';
import { Tags } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { listCategories, manageCategory, type InventoryCategory } from '@/lib/api';
/** Édite les catégories privées et explique la réaffectation avant suppression. */
export default function CategoryManager({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<InventoryCategory[]>([]),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<InventoryCategory | null>(null);
  async function reload() {
    try {
      setRows(await listCategories());
    } catch {
      setError('Impossible de charger les catégories.');
    }
  }
  useEffect(() => {
    if (open) {
      setError('');
      void reload();
    }
  }, [open]);
  async function save(action: 'add' | 'delete', value: string) {
    setBusy(true);
    setError('');
    try {
      await manageCategory(action, value);
      setName('');
      setRemove(null);
      await reload();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="secondary menu-icon-button"
        onClick={() => setOpen(true)}
        aria-label="Gérer les catégories"
        title="Gérer les catégories"
      >
        <Tags />
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="crate-dialog">
          <DialogTitle>Mes catégories</DialogTitle>
          <DialogDescription>
            Les catégories communes restent disponibles. Ajoutez vos propres catégories de
            rangement.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save('add', name);
            }}
          >
            <label>
              Nouvelle catégorie
              <input
                required
                maxLength={60}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Ajouter
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <ul className="category-management">
            {rows.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                {c.owner_id ? (
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => setRemove(c)}
                    aria-label={`Supprimer ${c.name}`}
                  >
                    Supprimer
                  </button>
                ) : (
                  <small>Commune</small>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!busy && !v) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer « {remove?.name} » ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les caisses de cette catégorie seront classées dans « Autre ». Les caisses et leur
            contenu seront conservés.
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (remove) void save('delete', remove.name);
              }}
            >
              Supprimer la catégorie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
