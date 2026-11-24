import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, QrCode } from 'lucide-react';
import { Field, Input } from './ui/Field';
import Button from './ui/Button';
import { cn } from '../utils/format';

/**
 * QR entry for a rental.
 *
 *  - Camera scanning uses the browser's native BarcodeDetector where it exists
 *    (Chrome/Edge/Android) and falls back to the jsQR decoder elsewhere
 *    (Safari on iPhone, Firefox). Browsers only allow the camera on HTTPS or
 *    on localhost.
 *  - Manual entry always works — type the code printed under the QR label.
 */
export default function QrPanel({ value, onChange, disabled, autoFocus = false }) {
  const canUseCamera =
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    (window.isSecureContext ?? true);

  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const activeRef = useRef(false);

  function stopCamera() {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => stopCamera, []); // release the camera on unmount

  async function buildDecoder() {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        if (!formats || formats.includes('qr_code')) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          return async (video) => {
            const codes = await detector.detect(video);
            return codes[0]?.rawValue || null;
          };
        }
      } catch {
        /* fall through to jsQR */
      }
    }
    const { default: jsQR } = await import('jsqr');
    return async (video) => {
      const canvas = canvasRef.current;
      if (!canvas || !video.videoWidth) return null;
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      return result?.data || null;
    };
  }

  async function startCamera() {
    setCamError('');
    try {
      const decode = await buildDecoder();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      activeRef.current = true;
      setScanning(true);
      // Wait a frame for the <video> element to mount.
      await new Promise((r) => requestAnimationFrame(r));
      const video = videoRef.current;
      if (!video) throw new Error('no video element');
      video.srcObject = stream;
      await video.play();

      const tick = async () => {
        if (!activeRef.current) return;
        try {
          const text = await decode(video);
          if (text) {
            onChange(text.trim());
            stopCamera();
            return;
          }
        } catch {
          /* a frame that failed to decode — keep scanning */
        }
        timerRef.current = setTimeout(tick, 200);
      };
      tick();
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      setCamError(
        denied
          ? 'Camera permission was denied. Allow camera access, or enter the code manually.'
          : 'Could not start the camera on this device. Enter the code printed on the label instead.'
      );
      stopCamera();
    }
  }

  return (
    <div className="space-y-3">
      {scanning ? (
        <div className="relative overflow-hidden rounded-xl bg-slate-900">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-36 w-36 rounded-lg border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(15,23,42,0.35)]" />
          </div>
          <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white/90">
            Point the camera at the QR label on the cycle
          </p>
          <button
            type="button"
            onClick={stopCamera}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700"
          >
            <CameraOff size={14} /> Stop
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
            <QrCode size={22} />
          </span>
          <p className="text-sm text-slate-600">Scan the QR label on the cycle, or type its code below.</p>
          {canUseCamera ? (
            <Button type="button" size="sm" onClick={startCamera} disabled={disabled}>
              <Camera size={16} /> Scan with camera
            </Button>
          ) : (
            <p className="text-xs text-slate-400">
              Camera scanning needs HTTPS (or localhost). Manual entry works everywhere.
            </p>
          )}
        </div>
      )}

      <Field label="Cycle QR code" htmlFor="qr" hint="Printed under the QR label, e.g. CC-QR-04-1">
        <div className="relative">
          <Keyboard
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            id="qr"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="CC-QR-04-1"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={disabled}
            autoFocus={autoFocus}
            className={cn('pl-9 font-mono tracking-wide')}
          />
        </div>
      </Field>

      {camError && <p className="text-xs text-amber-700">{camError}</p>}
    </div>
  );
}
