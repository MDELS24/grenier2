import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IScannerControls } from '@zxing/browser';
import { Camera, Printer, QrCode, ScanLine } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { crateCode, type Crate } from '@/lib/crates';
import { crateQrValue, resolveQrValue, type QrAction } from '@/lib/qr';

type Props = {
  boxes: Crate[];
  onOpen: (box: Crate, addContent: boolean) => void;
  requestedCrate?: Crate | null;
};
type Label = { id: string; code: string; name: string; svg: string; value: string };
const captions = { view: 'Voir le contenu', add: 'Ajouter du contenu', code: 'Numéro de caisse' };

/** Les étiquettes SVG et les trames de caméra restent uniquement en mémoire. */
export default function QrManager({ boxes, onOpen, requestedCrate }: Props) {
  const [fixedId, setFixedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<'make' | 'scan'>('make');
  const [selected, setSelected] = useState(''),
    [action, setAction] = useState<QrAction>('view');
  const [labels, setLabels] = useState<Label[]>([]),
    [copies, setCopies] = useState(1);
  const [scanning, setScanning] = useState(false),
    [manual, setManual] = useState('');
  const [error, setError] = useState(''),
    [generationError, setGenerationError] = useState('');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState('');
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<IScannerControls | null>(null);
  const stream = useRef<MediaStream | null>(null),
    cameraRun = useRef(0);
  const selectedBoxes = useMemo(
    () => boxes.filter((b) => (fixedId ? b.id === fixedId : selected === '*' || b.id === selected)),
    [boxes, selected, fixedId],
  );
  // Le détail impose l’identifiant enregistré : aucune autre caisse ne peut être imprimée.
  useEffect(() => {
    if (!requestedCrate) return;
    setFixedId(requestedCrate.id);
    setSelected(requestedCrate.id);
    setTab('make');
    setAction('view');
    setCopies(1);
    setOpen(true);
  }, [requestedCrate]);
  // Empêche une réponse asynchrone ancienne de changer l’étiquette.
  const labelInput = JSON.stringify(
    selectedBoxes.map((b) => ({ id: b.id, code: crateCode(b), name: b.name })),
  );
  const [renderedKey, setRenderedKey] = useState('');
  const labelKey = action + labelInput;
  const ready = labels.length > 0 && renderedKey === labelKey;
  useEffect(() => {
    if (selected !== '*' && !boxes.some((b) => b.id === selected)) setSelected(boxes[0]?.id || '');
  }, [boxes, selected]);
  useEffect(() => {
    if (!open || tab !== 'make') return;
    let cancelled = false;
    setGenerationError('');
    const data = JSON.parse(labelInput) as { id: string; code: string; name: string }[];
    void import('qrcode')
      .then(async ({ default: QRCode }) => {
        const result = await Promise.all(
          data.map(async (b) => {
            const value = crateQrValue(
              b as Crate,
              action,
              new URL(import.meta.env.BASE_URL, location.origin).href,
            );
            return {
              ...b,
              value,
              svg: await QRCode.toString(value, {
                type: 'svg',
                errorCorrectionLevel: 'M',
                margin: 4,
                width: 256,
                color: { dark: '#000000', light: '#ffffff' },
              }),
            };
          }),
        );
        if (!cancelled) {
          setLabels(result);
          setRenderedKey(labelKey);
        }
      })
      .catch(() => {
        if (!cancelled)
          setGenerationError('Impossible de produire les QR. Fermez puis rouvrez cette fenêtre.');
      });
    return () => {
      cancelled = true;
    };
  }, [labelInput, action, labelKey, open, tab]);

  /** Annule aussi une ouverture de caméra encore en attente d’autorisation. */
  const stopCamera = useCallback(() => {
    cameraRun.current++;
    controls.current?.stop();
    controls.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setScanning(false);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stopCamera();
    };
    const printed = () => document.body.classList.remove('printing-qr');
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('afterprint', printed);
    return () => {
      stopCamera();
      printed();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('afterprint', printed);
    };
  }, [stopCamera]);

  function useValue(raw: string) {
    const resolved = resolveQrValue(raw, boxes, location.origin);
    if (!resolved) {
      setError('Aucune caisse ne correspond à ce QR ou à ce repère.');
      return;
    }
    stopCamera();
    setOpen(false);
    setError('');
    onOpen(resolved.box, resolved.action === 'add');
  }
  async function startCamera() {
    stopCamera();
    const run = cameraRun.current;
    setError('');
    setScanning(true);
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      if (run !== cameraRun.current || !video.current) return;
      const capture = await navigator.mediaDevices.getUserMedia({
        video: device ? { deviceId: { exact: device } } : { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (run !== cameraRun.current || !video.current) {
        capture.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = capture;
      void navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (run === cameraRun.current) setCameras(devices.filter((d) => d.kind === 'videoinput'));
        })
        .catch(() => {});
      const reader = new BrowserQRCodeReader();
      const scanner = await reader.decodeFromStream(
        capture,
        video.current,
        (result, _error, activeControls) => {
          if (run !== cameraRun.current) {
            activeControls.stop();
            return;
          }
          if (result) {
            activeControls.stop();
            useValue(result.getText());
            stopCamera();
          }
        },
      );
      if (run !== cameraRun.current) scanner.stop();
      else controls.current = scanner;
    } catch {
      if (run !== cameraRun.current) return;
      stopCamera();
      setError(
        'Caméra indisponible. Autorisez-la dans le navigateur, vérifiez qu’elle n’est pas utilisée ailleurs, ou saisissez le repère.',
      );
    }
  }
  function print() {
    if (!ready) return;
    document.body.classList.add('printing-qr');
    window.print();
    // afterprint fonctionne aussi lorsque Safari rend la main avant la fermeture de l’aperçu.
  }
  const label = (item: Label, key: string) => (
    <section key={key} className="qr-label">
      <div className="qr-image" dangerouslySetInnerHTML={{ __html: item.svg }} />
      <strong>{item.code}</strong>
      <span>{item.name}</span>
      <small>{captions[action]}</small>
    </section>
  );

  return (
    <>
      <button
        className="secondary"
        onClick={() => {
          setFixedId(null);
          setError('');
          setOpen(true);
        }}
      >
        <QrCode size={17} /> QR codes
      </button>
      {open &&
        tab === 'make' &&
        ready &&
        createPortal(
          <div id="qr-print-root" aria-hidden="true">
            {labels.flatMap((item) =>
              Array.from({ length: copies }, (_, i) => label(item, item.id + '-' + i)),
            )}
          </div>,
          document.body,
        )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) stopCamera();
          setOpen(next);
        }}
      >
        <DialogContent className="crate-dialog qr-dialog">
          <DialogTitle>QR codes des caisses</DialogTitle>
          <DialogDescription>
            Imprimez vos étiquettes ou retrouvez une caisse avec la caméra. Aucune image n’est
            enregistrée ni envoyée.
          </DialogDescription>
          <div className="qr-tabs" hidden={!!fixedId}>
            <button
              aria-pressed={tab === 'make'}
              className={tab === 'make' ? 'active' : ''}
              onClick={() => {
                stopCamera();
                setTab('make');
              }}
            >
              <QrCode size={17} /> Produire
            </button>
            <button
              aria-pressed={tab === 'scan'}
              className={tab === 'scan' ? 'active' : ''}
              onClick={() => setTab('scan')}
            >
              <ScanLine size={17} /> Lire
            </button>
          </div>
          {tab === 'make' ? (
            <div className="qr-maker">
              {!boxes.length ? (
                <p>Ajoutez une caisse pour produire son étiquette.</p>
              ) : (
                <>
                  <label>
                    Caisse à encoder
                    <select
                      value={fixedId || selected}
                      disabled={!!fixedId}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {!fixedId && <option value="*">Toutes les caisses ({boxes.length})</option>}
                      {(fixedId ? selectedBoxes : boxes).map((b) => (
                        <option key={b.id} value={b.id}>
                          {crateCode(b)} · {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset>
                    <legend>Action du QR</legend>
                    {(
                      [
                        ['view', 'Ouvrir la fiche et voir le contenu'],
                        ['add', 'Ouvrir pour ajouter du contenu'],
                        ['code', 'Afficher simplement le numéro de caisse'],
                      ] as const
                    ).map(([key, text]) => (
                      <label key={key}>
                        <input
                          name="qr-action"
                          type="radio"
                          checked={action === key}
                          onChange={() => setAction(key)}
                        />
                        {text}
                      </label>
                    ))}
                  </fieldset>
                  <p className="field-help">
                    {action === 'code'
                      ? 'Contient seulement le repère actuel. Après un renommage, réimprimez cette étiquette. Le lecteur Grenier2 retrouve la caisse à partir de ce repère.'
                      : 'Ouvrable avec la caméra du téléphone ou le lecteur ci-dessous. La connexion reste nécessaire. Le lien continue à fonctionner si le repère change.'}
                  </p>
                  <label>
                    Exemplaires par caisse
                    <select value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
                      {[1, 2, 3, 4, 6, 8, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="qr-preview" aria-label="Aperçu des étiquettes">
                    {ready ? (
                      labels.slice(0, 3).map((item) => label(item, item.id))
                    ) : (
                      <p role="status">Génération des étiquettes…</p>
                    )}
                  </div>
                  {ready && labels.length > 3 && (
                    <p>Et {labels.length - 3} autre(s) caisse(s) sur la feuille d’impression.</p>
                  )}
                  {generationError && (
                    <p role="alert" className="error">
                      {generationError}
                    </p>
                  )}
                  <button className="primary qr-print" disabled={!ready} onClick={print}>
                    <Printer size={18} /> Imprimer {ready ? labels.length * copies : ''}{' '}
                    étiquette(s)
                  </button>
                  <p className="field-help">
                    Format A4, étiquettes à découper. Choisissez une échelle de 100 % et désactivez
                    les en-têtes du navigateur. « Enregistrer en PDF » est aussi disponible dans
                    l’impression.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="qr-reader">
              <video ref={video} playsInline muted aria-label="Aperçu de la caméra" />
              {cameras.length > 1 && (
                <label>
                  Caméra
                  <select
                    value={device}
                    disabled={scanning}
                    onChange={(e) => setDevice(e.target.value)}
                  >
                    <option value="">Automatique (arrière si disponible)</option>
                    {cameras.map((c, i) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label || 'Caméra ' + (i + 1)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!scanning ? (
                <button className="primary" onClick={() => void startCamera()}>
                  <Camera size={18} /> Ouvrir la caméra
                </button>
              ) : (
                <button className="secondary" onClick={stopCamera}>
                  Arrêter la caméra
                </button>
              )}
              <p className="field-help">
                Placez le QR face à la caméra. Le traitement reste dans ce navigateur ; la caméra
                s’arrête après la lecture.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  useValue(manual);
                }}
              >
                <label htmlFor="qr-manual">Repère manuel ou lien QR</label>
                <div className="qr-manual">
                  <input
                    id="qr-manual"
                    required
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    placeholder="Ex. G-000123"
                  />
                  <button type="submit" className="secondary">
                    Ouvrir
                  </button>
                </div>
              </form>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
