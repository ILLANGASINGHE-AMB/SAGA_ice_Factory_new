import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useDrivers() {
  const [drivers, setDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('driver_name', { ascending: true });
      if (error) throw error;
      setDrivers(data || []);
    } catch (err) {
      console.error("Failed to fetch drivers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();

    const channel = supabase
      .channel(`drivers-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        () => {
          fetchDrivers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addDriver = async ({ driver_name, phone = '' }) => {
    const normalized = driver_name?.trim();
    if (!normalized) {
      throw new Error("Driver Name is required");
    }

    const { data: existing } = await supabase
      .from('drivers')
      .select('id')
      .ilike('driver_name', normalized)
      .maybeSingle();

    if (existing) {
      throw new Error("A driver with this name already exists");
    }

    const { data, error: insertErr } = await supabase
      .from('drivers')
      .insert({
        driver_name: normalized,
        phone: phone.trim(),
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertErr) throw new Error(insertErr.message);

    return { id: data.id, driver_name: normalized };
  };

  return {
    drivers,
    isLoading,
    addDriver
  };
}
