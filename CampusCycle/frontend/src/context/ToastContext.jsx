import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../utils/format';

const ToastContext = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (type, message) => {
      counter += 1;
      const id = counter;
      setToasts((list) => [...list, { id, type, message }]);
      timers.current[id] = setTimeout(() => dismiss(id), 4000);
      return id;
    },
    [dismiss]
  );

  // Stable identity, so pages can list `toast` as a hook dependency safely.
  const toast = useMemo(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg ring-1 ring-black/5',
              t.type === 'success'
                ? 'border-emerald-100'
                : t.type === 'info'
                  ? 'border-blue-100'
                  : 'border-rose-100'
            )}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
            ) : t.type === 'info' ? (
              <Info className="mt-0.5 shrink-0 text-blue-600" size={18} />
            ) : (
              <AlertCircle className="mt-0.5 shrink-0 text-rose-600" size={18} />
            )}
            <p className="flex-1 text-sm text-slate-700">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-slate-400 transition hover:text-slate-600"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
