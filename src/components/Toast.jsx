/* eslint-disable react-refresh/only-export-components --
   Colocating a context provider with its consumer hook is the idiomatic
   shape for this pattern, and splitting them would only buy finer Fast
   Refresh granularity in dev. Disabled deliberately so `npx eslint .`
   can be a passing gate in CI rather than a wall of known noise. */
import { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback((msg, dur) => showToast(msg, 'success', dur), [showToast]);
  const error = useCallback((msg, dur) => showToast(msg, 'error', dur), [showToast]);
  const info = useCallback((msg, dur) => showToast(msg, 'info', dur), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full">
        {toasts.map((toast) => {
          const icons = {
            success: <CheckCircle className="text-emerald-500" size={20} />,
            error: <AlertCircle className="text-red-500" size={20} />,
            info: <Info className="text-blue-500" size={20} />
          };

          const borders = {
            success: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/90 dark:bg-emerald-950/20',
            error: 'border-red-200 dark:border-red-900 bg-red-50/90 dark:bg-red-950/20',
            info: 'border-blue-200 dark:border-blue-900 bg-blue-50/90 dark:bg-blue-950/20'
          };

          return (
            <div
              key={toast.id}
              className={`flex items-start justify-between border p-4 rounded-xl shadow-lg backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-4 ${borders[toast.type]}`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {icons[toast.type]}
                </div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {toast.message}
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="ml-4 flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
