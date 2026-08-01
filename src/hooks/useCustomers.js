import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

  const addCustomer = async ({ name, whatsapp_number, address = '', email = '' }) => {
    if (!name || name.trim().length < 2) {
      throw new Error("Name is required and must be at least 2 characters");
    }
    if (!whatsapp_number || !/^\d{10}$/.test(whatsapp_number)) {
      throw new Error("WhatsApp number must be exactly 10 digits");
    }

    // Check duplicate WhatsApp
    const { data: existing } = await supabase
      .from('customers')
      .select('*')
      .eq('whatsapp_number', whatsapp_number)
      .maybeSingle();

    if (existing) {
      throw new Error("A customer with this WhatsApp number already exists");
    }

    // Auto-generate customer_code
    const { count, error: countErr } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw new Error(countErr.message);

    const newCount = count !== null ? count : 0;
    const customer_code = `CUST-${String(newCount + 1).padStart(4, '0')}`;

    const { data, error: insertErr } = await supabase
      .from('customers')
      .insert({
        customer_code,
        name: name.trim(),
        whatsapp_number,
        address: address.trim(),
        email: email.trim(),
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertErr) throw new Error(insertErr.message);

    return { id: data.id, customer_code };
  };

  const updateCustomer = async (id, { name, whatsapp_number, address = '', email = '' }) => {
    if (!name || name.trim().length < 2) {
      throw new Error("Name is required and must be at least 2 characters");
    }
    if (!whatsapp_number || !/^\d{10}$/.test(whatsapp_number)) {
      throw new Error("WhatsApp number must be exactly 10 digits");
    }

    // Check duplicate WhatsApp
    const { data: existing } = await supabase
      .from('customers')
      .select('*')
      .eq('whatsapp_number', whatsapp_number)
      .maybeSingle();

    if (existing && Number(existing.id) !== Number(id)) {
      throw new Error("Another customer with this WhatsApp number already exists");
    }

    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        name: name.trim(),
        whatsapp_number,
        address: address.trim(),
        email: email.trim()
      })
      .eq('id', id);

    if (updateErr) throw new Error(updateErr.message);
  };

  const deleteCustomer = async (id) => {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
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
