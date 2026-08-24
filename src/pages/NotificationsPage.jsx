import { Fragment, useMemo, useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { Table } from '../components/Table';
import { Select } from '../components/FormFields';
import { Send, MessageSquare } from 'lucide-react';
import { isWithinLocalRange } from '../utils/date';

const TYPE_LABELS = {
  sale_invoice: 'Sale Invoice',
  debt_settlement: 'Settlement Receipt'
};

const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  other: 'Other'
};

const money = (n) =>
  n == null ? '—' : `LKR ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

// A record of every invoice and settlement receipt actually dispatched to a
// customer, including the exact message text they received. Until this existed
// there was no way to answer "was this customer notified, when, and what were
// they told?" after the fact.
export function NotificationsPage() {
  const { notifications, isLoading } = useNotifications();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notifications.filter(n => {
      if (typeFilter !== 'all' && n.notification_type !== typeFilter) return false;
      if (channelFilter !== 'all' && (n.channel || 'whatsapp') !== channelFilter) return false;
      if ((dateFrom || dateTo) && !isWithinLocalRange(n.sent_at, dateFrom, dateTo)) return false;
      if (!q) return true;
      return (
        (n.customer_name || '').toLowerCase().includes(q) ||
        (n.reference_code || '').toLowerCase().includes(q) ||
        (n.recipient_phone || '').toLowerCase().includes(q) ||
        (n.sent_by || '').toLowerCase().includes(q)
      );
    });
  }, [notifications, search, typeFilter, channelFilter, dateFrom, dateTo]);

  const summary = useMemo(() => ({
    total: filtered.length,
    invoices: filtered.filter(n => n.notification_type === 'sale_invoice').length,
    receipts: filtered.filter(n => n.notification_type === 'debt_settlement').length,
    whatsapp: filtered.filter(n => (n.channel || 'whatsapp') === 'whatsapp').length,
    sms: filtered.filter(n => n.channel === 'sms').length
  }), [filtered]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center space-x-2">
          <Send className="w-5 h-5 text-navy-600 dark:text-sky-400" />
          <h2 className="text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
            Notifications Sent
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Every WhatsApp invoice and settlement receipt dispatched to a customer, with the exact
          message they were sent. Tap a row to read the full message.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block truncate">Total Sent</span>
          <h3 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
            {summary.total.toLocaleString()}
          </h3>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block truncate">Sale Invoices</span>
          <h3 className="text-base sm:text-lg font-bold font-heading text-sky-600 dark:text-sky-400">
            {summary.invoices.toLocaleString()}
          </h3>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">Settlement Receipts</span>
          <h3 className="text-base sm:text-lg font-bold font-heading text-emerald-600 dark:text-emerald-400">
            {summary.receipts.toLocaleString()}
          </h3>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">Via WhatsApp</span>
          <h3 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
            {summary.whatsapp.toLocaleString()}
          </h3>
        </div>
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 block truncate">Via SMS</span>
          <h3 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
            {summary.sms.toLocaleString()}
          </h3>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, reference, number, sender..."
          className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-400"
        />
        <Select
          className="sm:w-52"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Notification Types' },
            { value: 'sale_invoice', label: TYPE_LABELS.sale_invoice },
            { value: 'debt_settlement', label: TYPE_LABELS.debt_settlement }
          ]}
        />
        <Select
          className="sm:w-40"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All Channels' },
            { value: 'whatsapp', label: CHANNEL_LABELS.whatsapp },
            { value: 'sms', label: CHANNEL_LABELS.sms }
          ]}
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
          />
        </div>
      </div>

      <Table
        compact
        maxHeight="60vh"
        headers={[
          { key: 'sent_at', label: 'Sent' },
          { key: 'notification_type', label: 'Type' },
          { key: 'channel', label: 'Channel' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'reference_code', label: 'Reference' },
          { key: 'recipient_phone', label: 'Sent To' },
          { key: 'amount', label: 'Amount' },
          { key: 'remaining_amount', label: 'Remaining' },
          { key: 'sent_by', label: 'Sent By' }
        ]}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No notifications have been sent yet."
        renderRow={(note) => (
          <Fragment key={note.id}>
            <tr
              onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
              className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 cursor-pointer"
            >
              <td className="px-2.5 sm:px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                {new Date(note.sent_at).toLocaleString()}
              </td>
              <td className="px-2.5 sm:px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  note.notification_type === 'sale_invoice'
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}>
                  {TYPE_LABELS[note.notification_type] || note.notification_type}
                </span>
              </td>
              <td className="px-2.5 sm:px-4 py-2.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                  (note.channel || 'whatsapp') === 'sms'
                    ? 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}>
                  {CHANNEL_LABELS[note.channel] || CHANNEL_LABELS.whatsapp}
                </span>
              </td>
              <td className="px-2.5 sm:px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                {note.customer_name || '—'}
              </td>
              <td className="px-2.5 sm:px-4 py-2.5 font-mono text-navy-600 dark:text-navy-400">
                {note.reference_code || '—'}
              </td>
              <td className="px-2.5 sm:px-4 py-2.5 font-mono text-slate-500">{note.recipient_phone || '—'}</td>
              <td className="px-2.5 sm:px-4 py-2.5 font-mono">{money(note.amount)}</td>
              <td className="px-2.5 sm:px-4 py-2.5 font-mono text-rose-600 dark:text-rose-400">{money(note.remaining_amount)}</td>
              <td className="px-2.5 sm:px-4 py-2.5 text-slate-600 dark:text-slate-300">{note.sent_by}</td>
            </tr>
            {expandedId === note.id && (
              <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                <td colSpan={9} className="px-2.5 sm:px-4 py-3">
                  <div className="flex items-start gap-2">
                    <MessageSquare size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Message sent
                      </span>
                      <pre className="text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans">
                        {note.message}
                      </pre>
                      {note.link_url && (
                        <a
                          href={note.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-navy-600 dark:text-sky-400 hover:underline mt-1.5 inline-block break-all"
                        >
                          {note.link_url}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        )}
      />
    </div>
  );
}
