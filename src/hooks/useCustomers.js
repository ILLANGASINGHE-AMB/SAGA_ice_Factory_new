import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error("Failed to fetch customers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchCustomers = coalesceRefetch(fetchCustomers);
    fetchCustomers();

    const channel = supabase
      .channel(`customers-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        refetchCustomers
      )
      .subscribe();

    return () => {
      refetchCustomers.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const addCustomer = async ({ name, whatsapp_number = '', contact_number = '', address = '', notes = '', is_branch = false, is_one_time = false }) => {
    if (!name || name.trim().length < 2) {
      throw new Error("Name is required and must be at least 2 characters");
    }
    // A one-time (walk-in) customer often leaves no number at all — that's the
    // point of the flag, so the contact requirement doesn't apply to them.
    if (!is_one_time && !whatsapp_number && !contact_number) {
      throw new Error("Provide at least one number (WhatsApp or Contact)");
    }
    if (whatsapp_number && !/^0\d{9}$/.test(whatsapp_number)) {
      throw new Error("WhatsApp number must be exactly 10 digits and start with 0 (e.g. 0771234567)");
    }
    if (contact_number && !/^0\d{9}$/.test(contact_number)) {
      throw new Error("Contact number must be exactly 10 digits and start with 0 (e.g. 0771234567)");
    }

    // Check duplicate WhatsApp
    if (whatsapp_number) {
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('whatsapp_number', whatsapp_number)
        .maybeSingle();

      if (existing) {
        throw new Error("A customer with this WhatsApp number already exists");
      }
    }

    // customer_code (SIFC_0001 / SIFO_0001) is assigned by a BEFORE INSERT
    // trigger. Doing it server-side keeps the code and the row atomic — the
    // old two-step burned a counter value whenever the insert that followed
    // failed — and saves a round-trip, which is the slowest part of a create
    // on a weak connection.
    const { data, error: insertErr } = await supabase
      .from('customers')
      .insert({
        name: name.trim(),
        whatsapp_number: whatsapp_number || null,
        contact_number: contact_number || null,
        address: address.trim(),
        notes: notes ? notes.trim() : '',
        is_branch,
        is_one_time,
        created_at: new Date().toISOString()
      })
      .select('id, customer_code')
      .single();

    if (insertErr) throw new Error(insertErr.message);
    const customer_code = data.customer_code;

    logActivity({
      action: 'create',
      entityType: 'customer',
      entityId: data.id,
      entityLabel: customer_code,
      description: `Added ${is_one_time ? 'one-time ' : ''}customer ${customer_code} (${name.trim()})`
    });
    return { id: data.id, customer_code };
  };

  const updateCustomer = async (id, { name, whatsapp_number = '', contact_number = '', address = '', notes, is_branch }) => {
    if (!name || name.trim().length < 2) {
      throw new Error("Name is required and must be at least 2 characters");
    }
    if (!whatsapp_number && !contact_number) {
      throw new Error("Provide at least one number (WhatsApp or Contact)");
    }
    if (whatsapp_number && !/^0\d{9}$/.test(whatsapp_number)) {
      throw new Error("WhatsApp number must be exactly 10 digits and start with 0 (e.g. 0771234567)");
    }
    if (contact_number && !/^0\d{9}$/.test(contact_number)) {
      throw new Error("Contact number must be exactly 10 digits and start with 0 (e.g. 0771234567)");
    }

    // Check duplicate WhatsApp
    if (whatsapp_number) {
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .eq('whatsapp_number', whatsapp_number)
        .maybeSingle();

      if (existing && Number(existing.id) !== Number(id)) {
        throw new Error("Another customer with this WhatsApp number already exists");
      }
    }

    // notes/is_branch are only included when explicitly passed (branch
    // management in Settings), so editing a regular customer through the
    // normal Customers-tab form never touches either column.
    const updatePayload = {
      name: name.trim(),
      whatsapp_number: whatsapp_number || null,
      contact_number: contact_number || null,
      address: address.trim()
    };
    if (notes !== undefined) updatePayload.notes = notes.trim();
    if (is_branch !== undefined) updatePayload.is_branch = is_branch;

    const { error: updateErr } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) throw new Error(updateErr.message);
    logActivity({ action: 'update', entityType: 'customer', entityId: id, description: `Updated customer ${name.trim()}` });
  };

  const deleteCustomer = async (id) => {
    // Debts (and their settlement history) cascade-delete with the customer.
    // Block removal while any non-settled debt exists so outstanding money
    // owed can never be silently erased.
    const { data: openDebts, error: debtsErr } = await supabase
      .from('debts')
      .select('remaining_amount')
      .eq('customer_id', id)
      .neq('status', 'settled');

    if (debtsErr) throw new Error(debtsErr.message);

    if (openDebts && openDebts.length > 0) {
      const totalOwed = openDebts.reduce((sum, d) => sum + Number(d.remaining_amount || 0), 0);
      throw new Error(
        `Cannot delete this customer: they have ${openDebts.length} unsettled debt(s) totaling LKR ${totalOwed.toLocaleString()}. Settle or clear these debts first.`
      );
    }

    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'customers',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
  };

  return {
    customers,
    isLoading,
    addCustomer,
    updateCustomer,
    deleteCustomer
  };
}
