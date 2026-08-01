import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message = "This action cannot be undone. Do you want to proceed?",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger", // 'danger', 'primary'
  isLoading = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex items-start space-x-3 py-2">
        <div className={`p-2 rounded-full ${variant === 'danger' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
          <AlertTriangle size={20} />
        </div>
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {message}
          </p>
        </div>
      </div>
      <div className="flex justify-end space-x-3 mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
        <Button variant="secondary" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
