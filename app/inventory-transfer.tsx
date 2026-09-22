import { useRef, useState } from 'react';
import { Download, Moon, Settings, Sun, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { client } from '@/lib/supabase';
import { applyTheme, type Theme } from './theme';
import {
  csvFields,
  exportCsv,
  exportItemlist,
  mapItemlist,
  parseCsv,
  suggestMapping,
  mapCsv,
  type CsvField,
  type CsvMapping,
} from '@/lib/inventory-csv';
import type { Crate } from '@/lib/crates';
const labels: Record<CsvField, string> = {
  code: 'Repère de caisse',
  name: 'Nom de caisse',
  location: 'Place habituelle',
  category: 'Catégorie',
  items: 'Contenu / nom de l’objet',
  notes: 'Notes',
  temporary_location: 'Emplacement temporaire',
  moved_at: 'Date de déplacement',
  return_date: 'Date de retour',
  move_note: 'Motif du déplacement',
};
/** Prévisualise le mapping CSV avant une écriture atomique, sans remplacer les caisses existantes. */
export default function InventoryTransfer({
  boxes,
  onChange,
}: {
  boxes: Crate[];
  onChange: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [theme, setTheme] = useState<Theme>(() =>
      document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    ),
    [parsed, setParsed] = useState<ReturnType<typeof parseCsv> | null>(null),
    [mapping, setMapping] = useState<CsvMapping>({}),
    [group, setGroup] = useState(false),
    [skip, setSkip] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');

  /** Change immédiatement l’apparence et conserve le choix sur cet appareil. */
  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }
  let preview: ReturnType<typeof mapCsv> = [],
    previewError = '';
  if (parsed)
    try {
      preview = parsed.isItemlist ? mapItemlist(parsed.rows) : mapCsv(parsed.rows, mapping, group);
    } catch (e) {
      previewError = (e as Error).message;
    }
  async function read(file: File | undefined) {
    setError('');
    setSuccess('');
    setParsed(null);
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error('Fichier trop volumineux (5 Mo maximum).');
      const p = parseCsv(await file.text());
      setParsed(p);
      setMapping(suggestMapping(p.headers));
      setGroup(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download(itemlist = false) {
    const url = URL.createObjectURL(
      new Blob([itemlist ? exportItemlist(boxes) : exportCsv(boxes)], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `grenier2-${itemlist ? 'itemlist-' : ''}${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const { data, error } = await client().rpc('import_inventory', {
        entries: preview,
        skip_duplicates: skip,
      });
      if (error) throw error;
      setSuccess(
        `${data.added} caisse(s) importée(s), ${data.skipped} repère(s) déjà présent(s) ignoré(s).`,
      );
      setParsed(null);
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
        className="secondary"
        onClick={() => {
          setOpen(true);
          setError('');
          setSuccess('');
        }}
      >
        <Settings size={17} /> Maintenance
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="crate-dialog">
          <DialogTitle>Maintenance de l’inventaire</DialogTitle>
          <DialogDescription>
            Réglez l’apparence, exportez une sauvegarde ou importez un inventaire. L’import ajoute
            des caisses sans remplacer celles qui existent.
          </DialogDescription>
          <div className="maintenance-actions">
            <button
              className="secondary theme-toggle"
              onClick={toggleTheme}
              aria-label={`Passer en mode ${theme === 'dark' ? 'clair' : 'sombre'}`}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              <span>
                <strong>Mode {theme === 'dark' ? 'clair' : 'sombre'}</strong>
                <small>
                  {theme === 'dark' ? 'Le mode sombre est actif' : 'Le mode clair est actif'}
                </small>
              </span>
            </button>
            <button className="secondary" onClick={() => download()} disabled={!boxes.length}>
              <Download size={18} />
              <span>
                <strong>Exporter Grenier2</strong>
                <small>Sauvegarde complète de l’inventaire</small>
              </span>
            </button>
            <button className="secondary" onClick={() => download(true)} disabled={!boxes.length}>
              <Download size={18} />
              <span>
                <strong>Exporter Itemlist</strong>
                <small>Format compatible avec l’application iOS</small>
              </span>
            </button>
            <button
              className="secondary"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <Upload size={18} />
              <span>
                <strong>Importer un CSV</strong>
                <small>Grenier2, Itemlist ou colonnes personnalisées</small>
              </span>
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              aria-label="Fichier CSV à importer"
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Permet de sélectionner à nouveau le même fichier après un import.
                e.target.value = '';
                void read(file);
              }}
            />
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {success && <p role="status">{success}</p>}
          {parsed && (
            <>
              {parsed.isItemlist ? (
                <p role="status">
                  Format Itemlist détecté :{' '}
                  {parsed.rows.filter((r) => r.type === 'container').length} conteneurs et{' '}
                  {parsed.rows.filter((r) => r.type === 'item').length} objets. Aucun lien
                  objet/conteneur ni emplacement n’est présent dans cet export : les objets sont
                  regroupés par lots dans des caisses « À classer », les lieux restent à préciser.{' '}
                  {parsed.repaired} ligne(s) de conteneur normalisée(s). Les noms identiques
                  reçoivent un suffixe.
                </p>
              ) : (
                <>
                  <div className="csv-mapping">
                    {csvFields.map((f) => (
                      <label key={f}>
                        {labels[f]}
                        {['name', 'location'].includes(f) ? ' *' : ''}
                        <select
                          disabled={busy}
                          value={mapping[f] || ''}
                          onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
                        >
                          <option value="">Non importé</option>
                          {parsed.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <label>
                    <input
                      type="checkbox"
                      checked={group}
                      disabled={busy}
                      onChange={(e) => setGroup(e.target.checked)}
                    />{' '}
                    Une ligne par objet : regrouper par repère, nom de caisse et lieu
                  </label>
                </>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={skip}
                  disabled={busy}
                  onChange={(e) => setSkip(e.target.checked)}
                />{' '}
                Ignorer les repères déjà présents
              </label>
              <p className="field-help">
                Les colonnes non associées ne sont pas importées. Les photos ne sont pas
                transférées. Sans repère, chaque import crée de nouvelles caisses numérotées
                automatiquement.
              </p>
              {previewError ? (
                <p role="alert" className="error">
                  {previewError}
                </p>
              ) : (
                <>
                  <p>
                    {parsed.rows.length} ligne(s) → {preview.length} caisse(s). Vérifiez cet aperçu
                    avant de confirmer.
                  </p>
                  <ul>
                    {preview.slice(0, 3).map((r, i) => (
                      <li key={i}>
                        <strong>
                          {r.code || 'Repère automatique'} · {r.name || 'Nom manquant'}
                        </strong>{' '}
                        — {r.location || 'Lieu manquant'}
                        <p>{r.items.slice(0, 150)}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                className="primary"
                disabled={busy || !!previewError || !preview.length || preview.length > 1000}
                onClick={() => void submit()}
              >
                {busy ? 'Import en cours…' : `Importer ${preview.length} caisse(s)`}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
