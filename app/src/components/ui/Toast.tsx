'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

let globalId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++globalId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 380 }}>
        {toasts.map(t => (
          <ToastMessage key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => setVisible(false), 3600);
    return () => clearTimeout(timer);
  }, []);

  const colors: Record<ToastType, { bg: string; border: string; text: string }> = {
    success: { bg: 'rgba(0,255,157,0.12)', border: 'rgba(0,255,157,0.3)', text: '#00ff9d' },
    error: { bg: 'rgba(255,82,82,0.12)', border: 'rgba(255,82,82,0.3)', text: '#ff5252' },
    info: { bg: 'rgba(100,181,246,0.12)', border: 'rgba(100,181,246,0.3)', text: '#64b5f6' },
  };

  const c = colors[item.type];

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg backdrop-blur-sm"
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.3s ease',
      }}
    >
      <span className="flex-1">{item.message}</span>
      <button onClick={() => onDismiss(item.id)} className="flex-shrink-0 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
