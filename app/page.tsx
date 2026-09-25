import InventoryTransfer from './inventory-transfer';
import CategoryManager from './category-manager';
import QrManager from './qr-manager';
import CrateTable, { type ContainerTableMode, type ContainerTableRequest } from './crate-table';
import InnerBoxManager, { type InnerBoxRequest } from './inner-box-manager';
import ObjectTable from './object-table';
import CrateContentsEditor from './crate-contents-editor';
import { appendContents, takePendingQr } from '@/lib/qr';
import { listCrates, mutateCrate, CrateError, listCategories, listInnerBoxes } from '@/lib/api';
('use client');
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Plus,
  Search,
  MapPin,
  ArrowUpRight,
  Shell,
  PackageOpen,
  Layers,
  Archive,
  Trash2,
  MoveRight,
  Undo2,
  Clock3,
  RefreshCw,
  ListChecks,
  Maximize2,
  Boxes,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  categories as defaultCategories,
  crateCode,
  emptyCrate,
  currentLocation,
  countItems,
  localDate,
  dateInDays,
  overdue,
  due,
  searchCrates,
  formatDate,
  shelfLabel,
  type Crate,
} from '@/lib/crates';
import {
  currentCrateId,
  innerBoxCode,
  innerBoxFollowsMovedCrate,
  innerBoxIsMoved,
  searchInnerBoxes,
  type InnerBox,
} from '@/lib/inner-boxes';

type Movement = { box: Crate; destination: string; return_date: string; move_note: string };
type Status = 'all' | 'moved' | 'due';
function ReturnDate({ box, today }: { box: Crate; today: string }) {
  if (!box.return_date) return <span>Date de retour non définie</span>;
  return (
    <span className={overdue(box, today) ? 'late' : ''}>
      {overdue(box, today)
        ? 'Retour en retard · '
        : box.return_date === today
          ? 'À remettre aujourd’hui · '
          : 'Retour prévu · '}
      {formatDate(box.return_date)}
    </span>
  );
}
/** Inventaire : la place habituelle reste distincte de l’emplacement temporaire. */
export default function Home() {
  const [categories, setCategories] = useState(defaultCategories);
  const [qrCrate, setQrCrate] = useState<Crate | null>(null);
  const [qrInnerBox, setQrInnerBox] = useState<InnerBox | null>(null);
  const [qrSelection, setQrSelection] = useState<{ token: number; keys: string[] } | null>(null);
  const [contentsCrate, setContentsCrate] = useState<Crate | null>(null);
  const [tableRequest, setTableRequest] = useState<ContainerTableRequest>();
  const [objectTableRequest, setObjectTableRequest] = useState(0);
  const [innerBoxRequest, setInnerBoxRequest] = useState<InnerBoxRequest>();
  const innerBoxRequestToken = useRef(0);
  const [boxes, setBoxes] = useState<Crate[]>([]),
    [innerBoxes, setInnerBoxes] = useState<InnerBox[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [formError, setFormError] = useState('');
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('Toutes'),
    [location, setLocation] = useState('Tous'),
    [shelf, setShelf] = useState('Toutes'),
    [locationMode, setLocationMode] = useState('current'),
    [status, setStatus] = useState<Status>('all');
  const [draft, setDraft] = useState<Crate>(emptyCrate),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [movement, setMovement] = useState<Movement | null>(null),
    [returning, setReturning] = useState<Crate | null>(null),
    [today, setToday] = useState(localDate());
  const sequence = useRef(0);
  const [addingTo, setAddingTo] = useState<Crate | null>(null);
  const [addition, setAddition] = useState('');
  const handledQrLink = useRef(false);
  // Ignore les réponses anciennes qui arrivent après une nouvelle requête ou écriture.
  const refresh = useCallback(async (showLoading = false) => {
    const request = ++sequence.current;
    if (showLoading) setLoading(true);
    try {
      const [data, categoryRows, innerBoxRows] = await Promise.all([
        listCrates(),
        listCategories(),
        listInnerBoxes(),
      ]);
      if (request === sequence.current) {
        setBoxes(data);
        setCategories(categoryRows.map((c) => c.name));
        setInnerBoxes(innerBoxRows);
        setLoadError('');
      }
    } catch {
      if (request === sequence.current)
        setLoadError(
          'Impossible d’actualiser l’inventaire. Les emplacements affichés peuvent avoir changé.',
        );
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh(true);
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    const timer = setInterval(() => {
      setToday(localDate());
      if (!document.hidden) void refresh();
    }, 30000);
    return () => {
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (loading || loadError || handledQrLink.current) return;
    const params = new URLSearchParams(window.location.search);
    let pending: ReturnType<typeof takePendingQr> = null;
    try {
      pending = takePendingQr(localStorage);
    } catch {
      /* Stockage optionnel. */
    }
    const kind = params.has('boite') ? 'box' : params.has('caisse') ? 'crate' : pending?.kind;
    const id = params.get(kind === 'box' ? 'boite' : 'caisse') || pending?.id;
    if (!id) return;
    handledQrLink.current = true;
    if (kind === 'box') {
      const target = innerBoxes.find((box) => box.id === id);
      if (!target) toast.error('Cette boîte n’existe plus ou n’est pas accessible.');
      else
        setInnerBoxRequest({
          token: ++innerBoxRequestToken.current,
          id: target.id,
        });
      params.delete('boite');
      params.delete('action');
      history.replaceState(
        null,
        '',
        window.location.pathname +
          (params.size ? '?' + params.toString() : '') +
          window.location.hash,
      );
      return;
    }
    const target = boxes.find((box) => box.id === id);
    if (!target) {
      toast.error('Cette caisse n’existe plus ou n’est pas accessible.');
      return;
    }
    const add = params.has('caisse') ? params.get('action') === 'add' : pending?.action === 'add';
    params.delete('caisse');
    params.delete('action');
    history.replaceState(
      null,
      '',
      window.location.pathname +
        (params.size ? '?' + params.toString() : '') +
        window.location.hash,
    );
    edit(target, add);
  }, [boxes, innerBoxes, loading, loadError]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: { registerTool: (tool: unknown, options: unknown) => void | Promise<void> };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'search_crates',
            description:
              'Rechercher les caisses, leur contenu, leur emplacement actuel et leur place habituelle.',
            inputSchema: {
              type: 'object',
              properties: { query: { type: 'string' } },
              required: ['query'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input: unknown) {
              if (
                !input ||
                typeof input !== 'object' ||
                !('query' in input) ||
                typeof input.query !== 'string'
              )
                throw Error('Un texte de recherche est requis.');
              setQuery(input.query);
              setCategory('Toutes');
              setLocation('Tous');
              setStatus('all');
              return searchCrates(boxes, input.query);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(console.error);
    } catch (e) {
      console.error(e);
    }
    return () => lifecycle.abort();
  }, [boxes]);
  const homes = [...new Set(boxes.map((b) => b.location))].sort();
  const places = [...new Set(boxes.flatMap((b) => [b.location, currentLocation(b)]))].sort();
  const shelves = [...new Set(boxes.map((b) => b.shelf?.trim()).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }),
  );
  const moved = boxes.filter((b) => b.temporary_location),
    toReturn = boxes.filter((b) => due(b, today));
  const movedInnerBoxes = innerBoxes.filter(
    (box) => innerBoxIsMoved(box) || innerBoxFollowsMovedCrate(box, boxes),
  );
  const matchingInnerCrateIds = new Set(
    searchInnerBoxes(innerBoxes, boxes, query).flatMap(
      (box) => [box.home_crate_id, currentCrateId(box)].filter(Boolean) as string[],
    ),
  );
  const filtered = boxes.filter(
    (b) =>
      (searchCrates([b], query).length > 0 || matchingInnerCrateIds.has(b.id)) &&
      (category === 'Toutes' || b.category === category) &&
      (location === 'Tous' ||
        (locationMode === 'current' ? currentLocation(b) : b.location) === location) &&
      (shelf === 'Toutes' || b.shelf === shelf) &&
      (status === 'all' || (status === 'moved' ? !!b.temporary_location : due(b, today))),
  );
  function clearFilters() {
    setQuery('');
    setCategory('Toutes');
    setLocation('Tous');
    setShelf('Toutes');
    setStatus('all');
  }
  function requestInnerBox(id?: string, homeCrateId?: string) {
    setInnerBoxRequest({ token: ++innerBoxRequestToken.current, id, homeCrateId });
  }
  function openContainerTable(mode: ContainerTableMode) {
    setTableRequest({ token: Date.now(), mode });
  }
  /** Remplace une fiche par la version confirmée par PostgreSQL. */
  function applyRow(row: Crate) {
    ++sequence.current;
    setBoxes((prev) => [row, ...prev.filter((b) => b.id !== row.id)]);
    setDraft(row);
    setLoading(false);
    setLoadError('');
  }
  /** Recharge les données en cas de conflit de révision entre appareils. */
  async function requestRow(method: string, data: unknown) {
    try {
      return await mutateCrate(method, data);
    } catch (error) {
      if (error instanceof CrateError && error.status === 409) void refresh();
      throw error;
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      applyRow(await requestRow(draft.id ? 'PUT' : 'POST', draft));
      setOpen(false);
      toast.success('Caisse enregistrée.');
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** Enregistre la destination et l’échéance sans modifier la place habituelle. */
  async function saveMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!movement) return;
    setBusy(true);
    setFormError('');
    try {
      const row = await requestRow('PATCH', {
        id: movement.box.id,
        revision: movement.box.revision,
        action: 'move',
        destination: movement.destination,
        return_date: movement.return_date || null,
        move_note: movement.move_note,
      });
      applyRow(row);
      setMovement(null);
      toast.success(`Caisse déplacée : ${currentLocation(row)}.`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  /** Le retour physique nécessite toujours une confirmation explicite. */
  async function confirmReturn() {
    if (!returning) return;
    setBusy(true);
    setFormError('');
    try {
      const row = await requestRow('PATCH', {
        id: returning.id,
        revision: returning.revision,
        action: 'return',
      });
      applyRow(row);
      setReturning(null);
      toast.success(`Caisse remise à sa place : ${row.location}.`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setFormError('');
    try {
      await requestRow('DELETE', { id: draft.id, revision: draft.revision });
      ++sequence.current;
      setBoxes((p) => p.filter((b) => b.id !== draft.id));
      setDeleting(false);
      setOpen(false);
      toast.success('Caisse supprimée.');
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(b: Crate, addContent = false) {
    if (addContent) {
      setAddingTo({ ...b });
      setAddition('');
      setFormError('');
      return;
    }
    setDraft({ ...b });
    setFormError('');
    setOpen(true);
  }
  async function saveAddition(e: React.FormEvent) {
    e.preventDefault();
    if (!addingTo) return;
    setBusy(true);
    setFormError('');
    try {
      const row = await requestRow('PUT', {
        ...addingTo,
        items: appendContents(addingTo.items, addition),
      });
      applyRow(row);
      setAddingTo(null);
      edit(row);
      toast.success('Objets ajoutés à la caisse.');
    } catch (error) {
      setFormError((error as Error).message);
      // Conserve la saisie et recharge la fiche pour pouvoir retenter après un conflit.
      if (error instanceof CrateError && error.status === 409) {
        try {
          const rows = await listCrates();
          const fresh = rows.find((b) => b.id === addingTo.id);
          if (fresh) setAddingTo(fresh);
        } catch {
          /* Le message reste affiché. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  /** Propose sept jours pour un nouveau déplacement et conserve les données existantes. */
  function startMove(b: Crate) {
    setOpen(false);
    setFormError('');
    setMovement({
      box: b,
      destination: b.temporary_location || '',
      return_date: b.temporary_location ? b.return_date || '' : dateInDays(7),
      move_note: b.move_note || '',
    });
  }
  function startReturn(b: Crate) {
    setOpen(false);
    setFormError('');
    setReturning(b);
  }
  return (
    <>
      <Toaster theme="light" />
      <header className="topbar">
        <a href={import.meta.env.BASE_URL} className="brand">
          <span className="brand-icon">
            <Archive size={23} />
          </span>
          grenier2<span className="brand-dot">.</span>
        </a>
        <h1 className="topbar-slogan">Chaque caisse, au bon endroit.</h1>
        <QrManager
          boxes={boxes}
          innerBoxes={innerBoxes}
          onOpen={edit}
          onOpenInnerBox={(box) => requestInnerBox(box.id)}
          requestedCrate={qrCrate}
          requestedInnerBox={qrInnerBox}
          requestedSelection={qrSelection}
          triggerClassName="topbar-qr"
        />
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">MON INVENTAIRE</div>
            <p>Sa place habituelle, son emplacement actuel. Même le temps d’un projet.</p>
          </div>
          <button className="primary" onClick={() => edit(emptyCrate)}>
            <Plus size={19} /> Nouvelle caisse
          </button>
        </div>
        <section className="stats has-boxes" aria-label="Résumé de votre rangement">
          <button
            type="button"
            className="stat-button"
            aria-label={`${boxes.length} caisses répertoriées. Ouvrir le tableau des caisses.`}
            onClick={() => openContainerTable('crates')}
          >
            <strong>{boxes.length.toString().padStart(2, '0')}</strong>
            <span className="stat-icon" title="Caisses répertoriées" aria-hidden="true">
              <Archive />
            </span>
          </button>
          <button
            type="button"
            className="stat-button"
            aria-label={`${innerBoxes.length} boîtes intérieures. Ouvrir tous les contenants déployés.`}
            onClick={() => openContainerTable('expanded')}
          >
            <strong>{innerBoxes.length.toString().padStart(2, '0')}</strong>
            <span className="stat-icon" title="Boîtes intérieures" aria-hidden="true">
              <Boxes />
            </span>
          </button>
          <button
            type="button"
            className="stat-button"
            aria-label={`${countItems(
              [...boxes.map((b) => b.items), ...innerBoxes.map((b) => b.items)].join('\n'),
            )} objets répertoriés. Ouvrir le tableau des objets.`}
            onClick={() => setObjectTableRequest((request) => request + 1)}
          >
            <strong>
              {countItems(
                [...boxes.map((b) => b.items), ...innerBoxes.map((b) => b.items)].join('\n'),
              )
                .toString()
                .padStart(2, '0')}
            </strong>
            <span className="stat-icon" title="Objets répertoriés" aria-hidden="true">
              <Shell />
            </span>
          </button>
          <button
            type="button"
            className="stat-button"
            aria-label={`${moved.length + movedInnerBoxes.length} contenants déplacés. Ouvrir les contenants déplacés.`}
            onClick={() => openContainerTable('moved')}
          >
            <strong>{(moved.length + movedInnerBoxes.length).toString().padStart(2, '0')}</strong>
            <span className="stat-icon" title="Contenants déplacés" aria-hidden="true">
              <MoveRight />
            </span>
          </button>
          <aside>
            <span className="mini-label">UNE CAISSE EMPRUNTÉE ?</span>
            <p>
              Notez où vous l’emportez.
              <br />
              Sa place habituelle reste mémorisée.
            </p>
          </aside>
        </section>
        <div className="inventory-actions">
          <InventoryTransfer boxes={boxes} onChange={() => void refresh()} />
          <CrateTable
            boxes={boxes}
            innerBoxes={innerBoxes}
            onChange={() => void refresh()}
            onOpen={edit}
            onOpenInnerBox={(box) => requestInnerBox(box.id)}
            onPrintSelection={(keys) => setQrSelection({ token: Date.now(), keys })}
            openRequest={tableRequest}
          />
          <InnerBoxManager
            crates={boxes}
            innerBoxes={innerBoxes}
            onChange={() => void refresh()}
            request={innerBoxRequest}
            onPrintQr={(box) => setQrInnerBox({ ...box })}
            showTableButton={false}
          />
          <ObjectTable
            crates={boxes}
            innerBoxes={innerBoxes}
            onOpenCrate={edit}
            onOpenInnerBox={(box) => requestInnerBox(box.id)}
            openRequest={objectTableRequest}
          />
          <CategoryManager
            onChange={() => {
              setCategory('Toutes');
              void refresh();
            }}
          />
        </div>
        <section className="inventory">
          <div className="section-heading">
            <h2>
              Mes caisses <span>{boxes.length}</span>
            </h2>
            <button
              className="refresh-button"
              onClick={() => refresh()}
              aria-label="Actualiser l’inventaire"
            >
              <RefreshCw size={15} /> Actualiser
            </button>
          </div>
          <div className="movement-filters" aria-label="État du rangement">
            {(
              [
                ['all', 'Toutes les caisses', boxes.length],
                ['moved', 'Déplacées temporairement', moved.length],
                ['due', 'À remettre', toReturn.length],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                aria-pressed={status === key}
                className={status === key ? 'selected' : ''}
                onClick={() => setStatus(key)}
              >
                {label}
                <span>{n}</span>
              </button>
            ))}
          </div>
          {status === 'due' && (
            <p className="filter-help">
              Retours prévus aujourd’hui ou en retard. Les caisses restent à leur emplacement actuel
              jusqu’à confirmation du retour.
            </p>
          )}
          <div className="tools">
            <label className="search">
              <Search size={20} />
              <input
                placeholder="Rechercher un objet, un lieu, un repère…"
                aria-label="Rechercher"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Effacer la recherche">
                  ×
                </button>
              )}
            </label>
            <Select
              value={locationMode}
              onValueChange={(v) => {
                setLocationMode(v);
                setLocation('Tous');
              }}
            >
              <SelectTrigger aria-label="Type d’emplacement" className="location-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Emplacement actuel</SelectItem>
                <SelectItem value="home">Place habituelle</SelectItem>
              </SelectContent>
            </Select>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger aria-label="Filtrer par emplacement" className="location-select">
                <MapPin size={17} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Tous">Tous les emplacements</SelectItem>
                {(locationMode === 'home' ? homes : places).map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={shelf} onValueChange={setShelf}>
              <SelectTrigger aria-label="Filtrer par étagère" className="location-select">
                <Layers size={17} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Toutes">Toutes les étagères</SelectItem>
                {shelves.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="filters" aria-label="Catégories">
            {['Toutes', ...categories].map((c) => (
              <button
                key={c}
                aria-pressed={category === c}
                className={category === c ? 'active' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {loadError && (
            <div role="alert" className="error">
              {loadError} <button onClick={() => refresh()}>Réessayer</button>
            </div>
          )}
          {loading ? (
            <div className="empty">Chargement de votre inventaire…</div>
          ) : filtered.length ? (
            <div className="cards">
              {filtered.map((b) => (
                <article
                  className={'crate ' + (b.temporary_location ? 'is-moved' : '')}
                  key={b.id}
                  aria-label={b.name}
                >
                  <button
                    className="crate-detail"
                    onClick={() => edit(b)}
                    aria-label={`Ouvrir ${b.name}`}
                  >
                    <div className="crate-top">
                      <span className={'category cat-' + categories.indexOf(b.category)}>
                        {b.category}
                      </span>
                      <ArrowUpRight size={19} />
                    </div>
                    <div className="crate-label">
                      <Box size={28} />
                      <span>{crateCode(b)}</span>
                    </div>
                    <h3>{b.name}</h3>
                  </button>
                  <div className="whereabouts">
                    <div>
                      <MapPin size={16} />
                      <div>
                        <span className="where-label">Actuellement</span>
                        <strong>{currentLocation(b)}</strong>
                      </div>
                    </div>
                    <div>
                      <Archive size={16} />
                      <div>
                        <span className="where-label">Place habituelle</span>
                        <span>{b.location}</span>
                        {shelfLabel(b) && <small className="shelf-label">{shelfLabel(b)}</small>}
                      </div>
                    </div>
                  </div>
                  <div className="inner-box-summary">
                    <strong>
                      <Boxes size={15} /> Boîtes à l’intérieur
                    </strong>
                    <div>
                      {innerBoxes
                        .filter((innerBox) => currentCrateId(innerBox) === b.id)
                        .map((innerBox) => (
                          <button key={innerBox.id} onClick={() => requestInnerBox(innerBox.id)}>
                            {innerBoxCode(innerBox)} · {innerBox.name}
                          </button>
                        ))}
                      {!innerBoxes.some((innerBox) => currentCrateId(innerBox) === b.id) && (
                        <span>Aucune boîte</span>
                      )}
                    </div>
                  </div>
                  {b.temporary_location ? (
                    <div className="movement-info">
                      <span className="movement-badge">
                        <MoveRight size={14} /> Déplacement temporaire
                      </span>
                      <p>
                        <Clock3 size={14} />
                        <ReturnDate box={b} today={today} />
                      </p>
                      {b.move_note && <p className="move-reason">{b.move_note}</p>}
                    </div>
                  ) : (
                    <div className="at-home">À sa place habituelle</div>
                  )}
                  <div className="items-preview">
                    {b.items
                      .split('\n')
                      .filter(Boolean)
                      .slice(0, 3)
                      .map((item, i) => (
                        <span key={i}>{item}</span>
                      ))}
                    {!b.items && <span>Aucun objet renseigné</span>}
                  </div>
                  <div className="crate-actions">
                    <button className="secondary" onClick={() => startMove(b)}>
                      <MoveRight size={16} />
                      {b.temporary_location ? 'Modifier le déplacement' : 'Déplacer temporairement'}
                    </button>
                    {b.temporary_location && (
                      <button className="return-button" onClick={() => startReturn(b)}>
                        <Undo2 size={16} /> Remettre à sa place
                      </button>
                    )}
                  </div>
                  <footer>
                    <span>
                      {countItems(b.items)} objet{countItems(b.items) > 1 ? 's' : ''}
                    </span>
                    <button onClick={() => edit(b)}>
                      Voir la caisse <ArrowUpRight size={14} />
                    </button>
                  </footer>
                </article>
              ))}
              <button className="add-card" onClick={() => edit(emptyCrate)}>
                <span>
                  <Plus size={26} />
                </span>
                Une place pour la suite<small>Ajouter une caisse</small>
              </button>
            </div>
          ) : (
            <div className="empty">
              <PackageOpen size={42} />
              <h3>
                {boxes.length
                  ? 'Aucune caisse dans cette sélection'
                  : 'Votre grenier commence ici.'}
              </h3>
              <p>
                {boxes.length
                  ? 'Changez les filtres ou recherchez un autre objet.'
                  : 'Ajoutez votre première caisse et notez ce qu’elle contient.'}
              </p>
              <button
                className="primary"
                onClick={() => (boxes.length ? clearFilters() : edit(emptyCrate))}
              >
                {boxes.length ? 'Afficher toutes les caisses' : 'Ajouter ma première caisse'}
              </button>
            </div>
          )}
        </section>
        <div className="bottom-note">
          <Archive size={15} /> Une échéance ne déplace jamais une caisse automatiquement.
        </div>
      </main>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="crate-dialog">
          <DialogTitle>
            {draft.id ? `${crateCode(draft)} · Ma caisse` : 'Une nouvelle caisse'}
          </DialogTitle>
          <DialogDescription>
            {draft.id
              ? 'Son rangement permanent et les objets qu’elle contient.'
              : 'Donnez-lui un nom et une place habituelle.'}
          </DialogDescription>
          {draft.id && (
            <div className="edit-dialog-nav">
              <button
                type="button"
                className="secondary"
                onClick={() => openContainerTable('crates')}
              >
                <ListChecks size={16} /> Tableau des caisses
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setOpen(false);
                  setContentsCrate(boxes.find((box) => box.id === draft.id) || draft);
                }}
              >
                <Maximize2 size={16} /> Tous les objets
              </button>
            </div>
          )}
          {draft.id && (
            <div className="detail-movement">
              <span className="where-label">Actuellement</span>
              <strong>{currentLocation(draft)}</strong>
              {innerBoxes.filter((box) => currentCrateId(box) === draft.id).length > 0 && (
                <p>
                  Les {innerBoxes.filter((box) => currentCrateId(box) === draft.id).length} boîte(s)
                  à l’intérieur suivent cette caisse.
                </p>
              )}
              {draft.temporary_location && (
                <>
                  <p>Place habituelle : {draft.location}</p>
                  <p>
                    Déplacée le {formatDate(draft.moved_at!)} ·{' '}
                    <ReturnDate box={draft} today={today} />
                  </p>
                  {draft.move_note && <p>{draft.move_note}</p>}
                </>
              )}
              <div className="crate-actions">
                <button
                  className="secondary"
                  onClick={() => startMove(boxes.find((b) => b.id === draft.id) || draft)}
                >
                  <MoveRight size={16} />
                  {draft.temporary_location ? 'Modifier le déplacement' : 'Déplacer temporairement'}
                </button>
                {draft.temporary_location && (
                  <button
                    className="return-button"
                    onClick={() => startReturn(boxes.find((b) => b.id === draft.id) || draft)}
                  >
                    <Undo2 size={16} /> Remettre à sa place
                  </button>
                )}
              </div>
            </div>
          )}
          {draft.id && (
            <section className="crate-inner-boxes" aria-label="Boîtes de cette caisse">
              <div className="crate-inner-boxes-heading">
                <div>
                  <strong>Boîtes à l’intérieur</strong>
                  <span>
                    {innerBoxes.filter((box) => currentCrateId(box) === draft.id).length} boîte(s)
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setOpen(false);
                    requestInnerBox(undefined, draft.id);
                  }}
                >
                  <Plus size={15} /> Ajouter une boîte
                </button>
              </div>
              <div className="crate-inner-box-list">
                {innerBoxes
                  .filter((box) => currentCrateId(box) === draft.id)
                  .map((box) => (
                    <button
                      type="button"
                      key={box.id}
                      onClick={() => {
                        setOpen(false);
                        requestInnerBox(box.id);
                      }}
                    >
                      <Boxes size={16} />
                      <span>
                        <strong>{innerBoxCode(box)}</strong>
                        <small>
                          {box.name} · {countItems(box.items)} objet(s)
                        </small>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                {!innerBoxes.some((box) => currentCrateId(box) === draft.id) && (
                  <p>Aucune boîte ne se trouve actuellement dans cette caisse.</p>
                )}
              </div>
              {innerBoxes.some(
                (box) => box.home_crate_id === draft.id && currentCrateId(box) !== draft.id,
              ) && (
                <p className="field-help">
                  Boîtes habituelles actuellement déplacées :{' '}
                  {innerBoxes
                    .filter(
                      (box) => box.home_crate_id === draft.id && currentCrateId(box) !== draft.id,
                    )
                    .map((box) => innerBoxCode(box))
                    .join(', ')}
                </p>
              )}
            </section>
          )}
          <form onSubmit={save}>
            <label>
              Repère / numéro de caisse
              <input
                maxLength={60}
                value={draft.code ?? draft.id}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="Automatique : G-000001"
                required={!!draft.id}
              />
            </label>
            <p className="field-help">
              Laissez vide à la création pour un numéro automatique. Vous pouvez ensuite choisir
              librement un repère unique : 3D-01, Noël, A12…
            </p>
            <label>
              Nom de la caisse
              <input
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Ex. Rouleaux d’imprimante 3D"
              />
            </label>
            <div className="form-row">
              <label>
                Place habituelle
                <input
                  required
                  maxLength={100}
                  list="locations"
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder="Ex. Grenier · Étagère A · Niveau 2"
                />
                <datalist id="locations">
                  {homes.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Catégorie
                <Select
                  value={draft.category}
                  onValueChange={(category) => setDraft({ ...draft, category })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="form-row shelf-fields">
              <label>
                Étagère <span className="muted">— facultatif</span>
                <input
                  maxLength={100}
                  value={draft.shelf || ''}
                  onChange={(e) => setDraft({ ...draft, shelf: e.target.value })}
                  placeholder="Ex. Étagère A"
                />
              </label>
              <label>
                Niveau / position <span className="muted">— facultatif</span>
                <input
                  maxLength={100}
                  value={draft.shelf_position || ''}
                  onChange={(e) => setDraft({ ...draft, shelf_position: e.target.value })}
                  placeholder="Ex. Niveau 2 · gauche"
                />
              </label>
            </div>
            <p className="field-help">
              Ces repères permettent de retrouver la caisse rapidement sur une étagère.
            </p>
            <p className="field-help">
              Pour un changement provisoire, utilisez « Déplacer temporairement » : cette place
              reste votre point de retour.
            </p>
            <label>
              Contenu <span className="muted">— un objet par ligne</span>
              <textarea
                rows={5}
                maxLength={10000}
                value={draft.items}
                onChange={(e) => setDraft({ ...draft, items: e.target.value })}
                placeholder={'PLA blanc\nPLA noir\nPETG transparent'}
              />
            </label>
            <label>
              Notes <span className="muted">— facultatif</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Fragile, à garder au-dessus…"
              />
            </label>
            {formError && (
              <p role="alert" className="error">
                {formError}
              </p>
            )}
            <div className="form-actions">
              {draft.id && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const saved = boxes.find((box) => box.id === draft.id);
                    // Une étiquette ne doit jamais porter un numéro encore non enregistré.
                    if (!saved || saved.code !== draft.code || saved.name !== draft.name) {
                      setFormError(
                        'Enregistrez le numéro et le nom de la caisse avant d’imprimer son QR code.',
                      );
                      return;
                    }
                    setFormError('');
                    setQrCrate({ ...saved });
                  }}
                >
                  Imprimer le QR code
                </button>
              )}
              {draft.id && (
                <button
                  type="button"
                  aria-label="Supprimer la caisse"
                  className="danger"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button type="submit" disabled={busy} className="primary">
                {busy ? 'Enregistrement…' : 'Enregistrer la caisse'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!addingTo}
        onOpenChange={(v) => {
          if (!busy && !v) setAddingTo(null);
        }}
      >
        <DialogContent className="crate-dialog">
          <DialogTitle>Ajouter du contenu · {addingTo && crateCode(addingTo)}</DialogTitle>
          <DialogDescription>
            {addingTo?.name} — les objets déjà enregistrés sont conservés.
          </DialogDescription>
          <details>
            <summary>Contenu actuel</summary>
            <p style={{ whiteSpace: 'pre-wrap' }}>{addingTo?.items || 'Aucun objet renseigné'}</p>
          </details>
          <form onSubmit={saveAddition}>
            <label>
              Nouveaux objets — un par ligne
              <textarea
                autoFocus
                required
                rows={5}
                maxLength={10000}
                value={addition}
                onChange={(e) => setAddition(e.target.value)}
              />
            </label>
            {formError && (
              <p role="alert" className="error">
                {formError}
              </p>
            )}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Ajouter ces objets'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!movement}
        onOpenChange={(v) => {
          if (!busy && !v) setMovement(null);
        }}
      >
        <DialogContent className="crate-dialog movement-dialog">
          <DialogTitle>
            {movement?.box.temporary_location
              ? 'Modifier le déplacement'
              : 'Déplacer temporairement'}
          </DialogTitle>
          <DialogDescription>
            {movement?.box.name} · {movement ? crateCode(movement.box) : ''}
          </DialogDescription>
          {movement && (
            <form onSubmit={saveMovement}>
              <div className="home-reminder">
                <Archive size={19} />
                <div>
                  <span className="where-label">Sa place habituelle reste</span>
                  <strong>{movement.box.location}</strong>
                </div>
              </div>
              <label htmlFor="destination">Emplacement temporaire</label>
              <input
                id="destination"
                required
                maxLength={100}
                list="temporary-locations"
                value={movement.destination}
                onChange={(event) =>
                  setMovement((current) =>
                    current ? { ...current, destination: event.target.value } : current,
                  )
                }
                placeholder="Choisir un emplacement ou saisir Bureau…"
              />
              <datalist id="temporary-locations">
                {places
                  .filter((place) => place !== movement.box.location)
                  .map((place) => (
                    <option key={place} value={place} />
                  ))}
              </datalist>
              <p className="field-help">
                Choisissez un rangement existant ou saisissez un autre lieu, comme le bureau.
              </p>
              <label>
                Retour prévu <span className="muted">— facultatif</span>
                <input
                  name="return_date"
                  type="date"
                  value={movement.return_date}
                  onInput={(e) => {
                    const value = e.currentTarget.value;
                    setMovement((m) => (m ? { ...m, return_date: value } : m));
                  }}
                  onChange={(e) =>
                    setMovement((m) => (m ? { ...m, return_date: e.target.value } : m))
                  }
                />
              </label>
              <div className="date-shortcuts">
                {[
                  [1, 'Demain'],
                  [7, 'Dans 1 semaine'],
                  [14, 'Dans 2 semaines'],
                ].map(([days, label]) => (
                  <button
                    type="button"
                    key={days}
                    onClick={() =>
                      setMovement({ ...movement, return_date: dateInDays(Number(days)) })
                    }
                  >
                    {label}
                  </button>
                ))}
                <button type="button" onClick={() => setMovement({ ...movement, return_date: '' })}>
                  Sans date
                </button>
              </div>
              <label>
                Projet ou motif <span className="muted">— facultatif</span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  placeholder="Ex. Projet d’impression 3D dans le bureau"
                  value={movement.move_note}
                  onChange={(e) => setMovement({ ...movement, move_note: e.target.value })}
                />
              </label>
              <p className="field-help">
                Vous pourrez prolonger la date ou changer de lieu. Le retour sera confirmé par vous.
              </p>
              {formError && (
                <p role="alert" className="error">
                  {formError}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setMovement(null)}
                >
                  Annuler
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Enregistrer le déplacement'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!returning}
        onOpenChange={(v) => {
          if (!busy && !v) setReturning(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Remettre la caisse à sa place ?</AlertDialogTitle>
          <AlertDialogDescription>
            Confirmez après avoir remis « {returning?.name} » depuis{' '}
            {returning && currentLocation(returning)} à sa place habituelle :
          </AlertDialogDescription>
          <strong className="return-destination">{returning?.location}</strong>
          {formError && (
            <p role="alert" className="error">
              {formError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmReturn();
              }}
            >
              {busy ? 'Enregistrement…' : 'Confirmer le retour'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogTitle>Supprimer cette caisse ?</AlertDialogTitle>
          <AlertDialogDescription>
            La fiche « {draft.name} » et sa liste d’objets seront supprimées. Une caisse contenant
            des boîtes doit d’abord être vidée.
          </AlertDialogDescription>
          {formError && (
            <p role="alert" className="error">
              {formError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CrateContentsEditor
        crate={contentsCrate}
        innerBoxes={innerBoxes}
        onClose={() => setContentsCrate(null)}
        onSaved={() => void refresh()}
      />
    </>
  );
}
