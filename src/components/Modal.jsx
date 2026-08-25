import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

// Modals can stack (a ConfirmDialog opened from inside a form modal, for
// example). Setting/clearing document.body.style.overflow directly would
// release the background scroll lock as soon as the *inner* modal closed, so
// count how many are open and only unlock when the last one goes away.
let openModalCount = 0;

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md' // 'sm', 'md', 'lg', 'xl', '2xl'
}) {
  const titleId = useId();

  // Close modal on escape key press + lock background scrolling
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    openModalCount += 1;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Modal Content Box */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${sizes[size]} max-h-[92vh] landscape:max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 landscape:p-4 transform transition-all duration-300 animate-in fade-in-50 zoom-in-95 my-auto z-10`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 shrink-0">
          <h3 id={titleId} className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-50 truncate pr-2">
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Body.
            The -m-1/p-1 pair keeps a 4px gutter inside the scrollport without
            shifting content: overflow-y-auto clips anything painted outside the
            padding box, which otherwise cut off the focus ring on the first and
            last focusable elements (most visibly the top edge of a search input
            sitting flush against the body). */}
        <div className="overflow-y-auto touch-scroll flex-1 -m-1 p-1">
          {children}
        </div>
      </div>
    </div>
  );
}
