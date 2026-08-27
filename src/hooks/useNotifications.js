import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';

// Read/write access to notification_log — the record of every invoice and
// settlement receipt actually dispatched to a customer.
//
// `recordNotification` is deliberately best-effort: the message has already
// been handed to WhatsApp by the time it runs, so a logging failure must not
// surface as "sending failed". It's reported to the console and swallowed.
export function useNotifications({ customerId = null, autoLoad = true } = {}) {
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(autoLoad);

  const fetchNotifications = useCallback(async () => {
    let query = supabase
      .from('notification_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(500);

    if (customerId) query = query.eq('customer_id', customerId);

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch notification history:", error);
    }
    setNotifications(data || []);
    setIsLoading(false);
  }, [customerId]);

  useEffect(() => {
    const refetchNotifications = coalesceRefetch(fetchNotifications);
    if (!autoLoad) return;
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();

    const channel = supabase
      .channel(`notification-log-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_log' }, refetchNotifications)
      .subscribe();

    return () => {
      refetchNotifications.cancel();
      supabase.removeChannel(channel);
    };
  }, [autoLoad, fetchNotifications]);

  return { notifications, isLoading, refresh: fetchNotifications };
}

export async function recordNotification({
  channel = 'whatsapp',
  notificationType,
  customerId = null,
  customerName = null,
  recipientPhone = null,
  referenceCode = null,
  amount = null,
  remainingAmount = null,
  paymentType = null,
  message,
  linkUrl = null,
  sentBy = 'Operator'
}) {
  try {
    const { error } = await supabase.from('notification_log').insert([{
      channel,
      notification_type: notificationType,
      customer_id: customerId ? Number(customerId) : null,
      customer_name: customerName,
      recipient_phone: recipientPhone,
      reference_code: referenceCode,
      amount: amount == null ? null : Number(amount),
      remaining_amount: remainingAmount == null ? null : Number(remainingAmount),
      payment_type: paymentType,
      message,
      link_url: linkUrl,
      sent_by: sentBy
    }]);
    if (error) throw error;
  } catch (err) {
    console.warn("Failed to record notification dispatch:", err);
  }
}

/**
 * "Has this reference been notified?" for a whole ledger at once.
 *
 * The Sales table needs a Yes/No per order, so fetching a notification history
 * per row is out. This pulls just the identifying columns for one
 * notification_type and returns a Map keyed by reference_code (a sale_code or
 * settlement_code) holding the MOST RECENT dispatch for it — rows arrive
 * newest-first and the first one seen for a code wins.
 *
 * Deliberately narrow (`reference_code, channel, sent_at`) rather than
 * `select('*')`: the message body is the bulk of a notification_log row and
 * nothing here renders it.
 */
export function useNotificationStatus(notificationType) {
  const [statusMap, setStatusMap] = useState(() => new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('notification_log')
      .select('reference_code, channel, sent_at')
      .eq('notification_type', notificationType)
      .order('sent_at', { ascending: false });

    if (error) {
      console.error("Failed to fetch notification statuses:", error);
      setIsLoading(false);
      return;
    }

    const map = new Map();
    (data || []).forEach(row => {
      if (!row.reference_code || map.has(row.reference_code)) return;
      map.set(row.reference_code, { channel: row.channel, sentAt: row.sent_at });
    });
    setStatusMap(map);
    setIsLoading(false);
  }, [notificationType]);

  useEffect(() => {
    const refetchStatuses = coalesceRefetch(fetchStatuses);
    // Subscribing to an external system (Supabase) and pushing what it reports
    // into state — the case the rule explicitly allows for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatuses();

    const channel = supabase
      .channel(`notification-status-${notificationType}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_log' }, refetchStatuses)
      .subscribe();

    return () => {
      refetchStatuses.cancel();
      supabase.removeChannel(channel);
    };
  }, [notificationType, fetchStatuses]);

  return { statusMap, isLoading };
}
