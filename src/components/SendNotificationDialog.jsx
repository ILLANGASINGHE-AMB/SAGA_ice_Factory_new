import { Modal } from './Modal';
import { Button } from './Button';
import { MessageCircle, MessageSquare, X } from 'lucide-react';
import { smsPartCount, toSmsNumber } from '../utils/notifications';

// Post-sale / post-settlement notification prompt.
//
// Not every customer has WhatsApp, so the operator picks the channel rather
// than the system assuming one: WhatsApp opens wa.me, SMS opens the phone's
// own messaging app with the same text pre-filled. Either way the message is
// identical and is recorded against the customer, so the notification history
// stays complete whichever route was used.
export function SendNotificationDialog({
  isOpen,
  onClose,
  onSend,          // (channel: 'whatsapp' | 'sms') => void
  title = 'Send notification?',
  intro,
  customerName,
  phone,
  message = '',
  isSending = false
}) {
  const parts = smsPartCount(message);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {intro || `Send this to ${customerName || 'the customer'}?`}
        </p>

        <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">Sending to</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
            {toSmsNumber(phone) || '—'}
          </span>
        </div>

        {/* The exact text that will be handed to the messaging app. */}
        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Message
          </span>
          <pre className="max-h-48 overflow-y-auto touch-scroll whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
            {message}
          </pre>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            variant="primary"
            onClick={() => onSend('whatsapp')}
            disabled={isSending}
            className="flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 hover:border-emerald-700"
          >
            <MessageCircle size={16} />
            <span>Send via WhatsApp</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => onSend('sms')}
            disabled={isSending}
            className="flex items-center justify-center space-x-1.5"
            title="Opens your phone's messaging app with this text ready to send"
          >
            <MessageSquare size={16} />
            <span>Send as SMS</span>
          </Button>
        </div>

        {parts > 1 && (
          <p className="text-[11px] text-slate-400">
            As an SMS this is about {parts} message parts, so it may be charged as {parts} texts.
          </p>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            disabled={isSending}
            className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer disabled:opacity-50"
          >
            <X size={14} />
            <span>Skip notification</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
