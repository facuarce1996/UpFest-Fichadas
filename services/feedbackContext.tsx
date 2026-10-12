import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  isOpen: boolean;
  message: string;
  resolve: (value: boolean) => void;
}

interface FeedbackContextType {
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export const FeedbackProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        message,
        title: options.title || 'Confirmación',
        confirmText: options.confirmText || 'Confirmar',
        cancelText: options.cancelText || 'Cancelar',
        isDestructive: options.isDestructive ?? false,
        resolve,
      });
    });
  }, []);

  const handleConfirmClose = (value: boolean) => {
    if (confirmModal) {
      confirmModal.resolve(value);
      setConfirmModal(null);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts Container */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md animate-in slide-in-from-top-4 duration-300 ${
              t.type === 'success'
                ? 'bg-emerald-900/95 border-emerald-500/50 text-white'
                : t.type === 'error'
                ? 'bg-rose-950/95 border-rose-500/50 text-white'
                : t.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/50 text-white'
                : 'bg-slate-900/95 border-slate-700 text-white'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {t.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400" />}
              {t.type === 'error' && <XCircle size={18} className="text-rose-400" />}
              {t.type === 'warning' && <AlertTriangle size={18} className="text-amber-400" />}
              {t.type === 'info' && <Info size={18} className="text-sky-400" />}
            </div>
            <p className="text-xs font-bold leading-relaxed flex-1">{t.message}</p>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 z-[9998] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[36px] shadow-2xl p-8 border border-slate-100 animate-in zoom-in-95 duration-200 text-center">
            <div
              className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-inner ${
                confirmModal.isDestructive ? 'bg-rose-50 text-rose-600' : 'bg-orange-50 text-orange-600'
              }`}
            >
              {confirmModal.isDestructive ? <AlertTriangle size={32} /> : <Info size={32} />}
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 mb-2">
              {confirmModal.title}
            </h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed mb-8">
              {confirmModal.message}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleConfirmClose(false)}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all"
              >
                {confirmModal.cancelText}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmClose(true)}
                className={`flex-1 py-4 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg ${
                  confirmModal.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                    : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200'
                }`}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = (): FeedbackContextType => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};
