import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Printer } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';

/**
 * Printable QR label for one bicycle. The QR encodes the bicycle's qr_code
 * value, and the same value is printed underneath for manual entry.
 */
export default function BicycleQrModal({ open, onClose, bicycle }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !bicycle) return;
    setDataUrl('');
    setError('');
    QRCode.toDataURL(bicycle.qr_code, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then(setDataUrl)
      .catch(() => setError('Could not generate the QR image.'));
  }, [open, bicycle]);

  // The parent clears `bicycle` when closing; render nothing rather than a
  // stale image for a bicycle that is no longer selected.
  if (!open || !bicycle) return null;

  function print() {
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) return;
    const doc = w.document;
    doc.title = `QR label ${bicycle.cycle_code}`;
    const style = doc.createElement('style');
    style.textContent =
      'body{font-family:system-ui,sans-serif;text-align:center;margin:24px;color:#0f172a}' +
      'img{width:280px;height:280px}h1{font-size:22px;margin:8px 0 2px}' +
      'p{margin:2px 0;font-size:13px;color:#475569}code{font-size:16px;letter-spacing:.06em}';
    doc.head.appendChild(style);
    const img = doc.createElement('img');
    img.src = dataUrl;
    img.alt = `QR code for ${bicycle.cycle_code}`;
    const h1 = doc.createElement('h1');
    h1.textContent = `CampusCycle · ${bicycle.cycle_code}`;
    const code = doc.createElement('p');
    const codeEl = doc.createElement('code');
    codeEl.textContent = bicycle.qr_code;
    code.appendChild(codeEl);
    const hint = doc.createElement('p');
    hint.textContent = 'Scan to unlock, or type the code above in the app.';
    doc.body.append(img, h1, code, hint);
    img.onload = () => {
      w.focus();
      w.print();
    };
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={bicycle ? `QR label — ${bicycle.cycle_code}` : 'QR label'}
      description="Print and attach this label to the bicycle. Students scan it to start a ride."
      size="sm"
      footer={
        <>
          {dataUrl && (
            <Button
              as="a"
              variant="secondary"
              href={dataUrl}
              download={`${bicycle?.cycle_code || 'bicycle'}-qr.png`}
            >
              <Download size={15} /> PNG
            </Button>
          )}
          <Button onClick={print} disabled={!dataUrl}>
            <Printer size={15} /> Print label
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center py-2">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : !dataUrl ? (
          <div className="grid h-60 place-items-center text-slate-400">
            <Spinner size={24} />
          </div>
        ) : (
          <img
            src={dataUrl}
            alt={`QR code for ${bicycle.cycle_code}`}
            className="h-60 w-60 rounded-lg ring-1 ring-slate-200"
          />
        )}
        <p className="mt-3 font-mono text-sm tracking-wide text-slate-800">{bicycle?.qr_code}</p>
      </div>
    </Modal>
  );
}
