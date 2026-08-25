import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// Modals can stack (a ConfirmDialog opened from inside a form modal, for
// example), so the open ones are tracked as a stack rather than a count:
//   - the background scroll lock is released only when the LAST one closes;
//   - Escape is handled only by the TOP one. Every modal used to register its
//     own window listener, so one Escape press fired all of them: dismissing a
//     confirm dialog also destroyed the half-filled form behind it.
const modalStack = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md', // 'sm', 'md', 'lg', 'xl', '2xl'
  // Set by forms that hold unsaved input: a stray backdrop click then asks
  // before discarding instead of throwing the work away silently.
  confirmOnBackdropClose = false
}) {
  const titleId = useId();
  const panelRef = useRef(null);

  // Callers pass an inline arrow almost universally (`onClose={() => setOpen(false)}`),
  // so `onClose` has a fresh identity on every parent render. While it sat in
  // the dependency array of the effect below, every keystroke in a modal form
  // tore that effect down and set it back up: the cleanup handed focus back to
  // `previouslyFocused`, and the setup then focused the panel's first focusable
  // element — the header's close button. Typing a single character threw focus
  // out of the field, which is why typing appeared to stop dead with the close
  // button selected.
  //
  // The effect has to key on `isOpen` alone. Escape still needs the *current*
  // callback though, so it is reached through a ref rather than captured.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const token = {};
    modalStack.push(token);

    const handleKeyDown = (e) => {
      // Only the topmost modal reacts.
      if (modalStack[modalStack.length - 1] !== token) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab' || !panelRef.current) return;

      // Focus trap: Tab cycles inside the dialog rather than wandering out
      // into the page behind it.
      const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Remember where focus came from so it can be handed back on close —
    // otherwise a keyboard user is dropped at the top of the document.
    const previouslyFocused = document.activeElement;

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      if (!panelRef.current) return;
      // Never yank focus off something the user is already working in. The
      // dependency fix above is what stops this running mid-edit, but a modal
      // that renders its own content asynchronously could still land here
      // after the user has started typing.
      if (panelRef.current.contains(document.activeElement)) return;
      const focusable = panelRef.current.querySelectorAll(FOCUSABLE);
      (focusable[0] || panelRef.current).focus?.();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const idx = modalStack.indexOf(token);
      if (idx !== -1) modalStack.splice(idx, 1);
      if (modalStack.length === 0) document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.();
    };
    // `onClose` is deliberately absent — see the ref above.
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl'
  };

  const handleBackdropClick = () => {
    if (confirmOnBackdropClose) {
      const discard = window.confirm("Discard your unsaved changes?");
      if (!discard) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleBackdropClick}
      />

      {/* Modal Content Box */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${sizes[size]} max-h-[92vh] landscape:max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-6 landscape:p-4 transform transition-all duration-300 animate-in fade-in-50 zoom-in-95 my-auto z-10 focus:outline-none`}
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
