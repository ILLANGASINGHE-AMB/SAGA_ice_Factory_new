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
