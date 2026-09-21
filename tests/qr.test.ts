import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCrate } from '../lib/crates.ts';
import {
  crateQrValue,
  resolveQrValue,
  appendContents,
  rememberQr,
  takePendingQr,
} from '../lib/qr.ts';
import QRCode from 'qrcode';
import ZXing from '@zxing/library';

// L’export par défaut assure la compatibilité CommonJS avec Node 22 et 24.
const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, QRCodeReader } = ZXing;

test('QR: lien stable, mode ajout et repère seul', () => {
  const box = { ...emptyCrate, id: 'internal-1', code: 'PLA / 42', name: 'Bobines' };
  const boxes = [box];
  const link = crateQrValue(box, 'add', 'https://example.test/grenier2/');
  assert.equal(link, 'https://example.test/grenier2/?caisse=internal-1&action=add');
  assert.deepEqual(resolveQrValue(link, boxes, 'https://example.test'), { box, action: 'add' });
  assert.deepEqual(resolveQrValue('pla / 42', boxes, 'https://example.test'), {
    box,
    action: 'view',
  });
  assert.equal(crateQrValue(box, 'code', 'https://example.test/grenier2/'), 'PLA / 42');
  assert.equal(resolveQrValue('inconnu', boxes, 'https://example.test'), null);
});

test('QR: les trois valeurs générées sont lisibles par le décodeur caméra', () => {
  const box = { ...emptyCrate, id: 'G-A1B2C3D4', code: 'Noël / Étagère 3 & PLA' };
  for (const action of ['view', 'add', 'code'] as const) {
    const value = crateQrValue(box, action, 'https://mdels24.github.io/grenier2/');
    const modules = QRCode.create(value, { errorCorrectionLevel: 'M' }).modules;
    const size = (modules.size + 8) * 6;
    const pixels = new Uint8ClampedArray(size * size).fill(255);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const mx = Math.floor(x / 6) - 4,
          my = Math.floor(y / 6) - 4;
        if (mx >= 0 && my >= 0 && mx < modules.size && my < modules.size && modules.get(my, mx))
          pixels[y * size + x] = 0;
      }
    const decoded = new QRCodeReader().decode(
      new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, size, size))),
    );
    assert.equal(decoded.getText(), value);
  }
});

test('QR: connexion différée, expiration et ajout sans perte de contenu', () => {
  const data = new Map<string, string>();
  const storage = {
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
  rememberQr('?caisse=G-123&action=add', storage, 1000);
  assert.deepEqual(takePendingQr(storage, 1500), { id: 'G-123', action: 'add', at: 1000 });
  assert.equal(takePendingQr(storage, 1600), null);
  rememberQr('?caisse=G-123', storage, 1000);
  assert.equal(takePendingQr(storage, 4000000), null);
  assert.equal(
    appendContents('PLA blanc\nPETG', 'PLA bleu\nCâble'),
    'PLA blanc\nPETG\nPLA bleu\nCâble',
  );
  assert.throws(() => appendContents('PLA', '  '));
  assert.throws(() => appendContents('x'.repeat(10000), 'PLA'));
  const before = { ...emptyCrate, id: 'internal-1', code: 'Ancien' };
  const link = crateQrValue(before, 'view', 'https://example.test/grenier2/');
  assert.equal(
    resolveQrValue(link, [{ ...before, code: 'Nouveau' }], 'https://example.test')?.box.code,
    'Nouveau',
  );
  assert.equal(
    resolveQrValue(
      link.replace('example.test', 'malicious.test'),
      [before],
      'https://example.test',
    ),
    null,
  );
});
