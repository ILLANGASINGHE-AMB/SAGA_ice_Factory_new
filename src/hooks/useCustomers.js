import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
    fetchCustomers();

    const channel = supabase
      .channel(`customers-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        () => {
          fetchCustomers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addCustomer = async ({ name, whatsapp_number = '', contact_number = '', address = '', notes = '', is_branch = false }) => {
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

      if (existing) {
        throw new Error("A customer with this WhatsApp number already exists");
      }
    }

    // Auto-generate atomic customer_code. No count(*)-based fallback — a
    // deleted customer makes the count under-represent the highest code
    // already issued, so it can regenerate a code that collides with the
    // `unique` constraint. Refuse cleanly instead of guessing.
    const { data: codeData, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'customer',
      p_prefix: 'CUST'
    });

    if (codeErr || !codeData) {
      throw new Error("Unable to generate a customer code. Please try again.");
    }
    const customer_code = codeData;

    const { data, error: insertErr } = await supabase
      .from('customers')
      .insert({
        customer_code,
        name: name.trim(),
        whatsapp_number: whatsapp_number || null,
        contact_number: contact_number || null,
        address: address.trim(),
        notes: notes ? notes.trim() : '',
        is_branch,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertErr) throw new Error(insertErr.message);

    logActivity({ action: 'create', entityType: 'customer', entityId: data.id, entityLabel: customer_code, description: `Added customer ${customer_code} (${name.trim()})` });
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
