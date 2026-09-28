import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

// ---------------------------------------------------------------------
// Notificaciones (toasts)
// ---------------------------------------------------------------------
type ToastKind = 'success' | 'error' | 'info' | 'warning';
type Toast = { id: number; kind: ToastKind; title: string; body?: string; action?: { label: string; onClick: () => void } };

type ToastApi = {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string, action?: Toast['action']) => void;
  warning: (title: string, body?: string) => void;
};

// ---------------------------------------------------------------------
// Confirmaciones
// ---------------------------------------------------------------------
type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

const ToastContext = createContext<ToastApi | null>(null);
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, body?: string, action?: Toast['action']) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, kind, title, body, action }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const toastApi = useMemo<ToastApi>(
    () => ({
      success: (t, b) => push('success', t, b),
      error: (t, b) => push('error', t, b),
      info: (t, b, a) => push('info', t, b, a),
      warning: (t, b) => push('warning', t, b),
    }),
    [push],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        {createPortal(
          <div className="toast-region" role="region" aria-live="polite" aria-label="Notificaciones">
            {toasts.map((t) => {
              const Icon = ICONS[t.kind];
              return (
                <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
                  <Icon size={18} className="toast-icon" />
                  <div className="toast-content">
                    <strong>{t.title}</strong>
                    {t.body && <p>{t.body}</p>}
                    {t.action && (
                      <button
                        type="button"
                        className="toast-action"
                        onClick={() => {
                          t.action?.onClick();
                          dismiss(t.id);
                        }}
                      >
                        {t.action.label}
                      </button>
                    )}
                  </div>
                  <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Cerrar notificación">
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
        <Modal
          open={!!confirmState}
          onClose={() => closeConfirm(false)}
          title={confirmState?.title ?? ''}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => closeConfirm(false)}>
                {confirmState?.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => closeConfirm(true)} data-autofocus>
                {confirmState?.confirmLabel ?? 'Confirmar'}
              </Button>
            </>
          }
        >
          <div className="confirm-body">
            {confirmState?.danger && <AlertTriangle className="confirm-icon" size={22} />}
            <div>{typeof confirmState?.message === 'string' ? <p>{confirmState.message}</p> : confirmState?.message}</div>
          </div>
        </Modal>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de FeedbackProvider');
  return ctx;
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de FeedbackProvider');
  return ctx;
}
