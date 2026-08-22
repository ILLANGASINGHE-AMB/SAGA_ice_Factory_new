import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { logActivity, currentActor } from '../lib/activityLog';

// Vehicle No format: xx0000 or xxx0000 (2-3 letters followed by 4 digits)
const VEHICLE_NO_REGEX = /^[A-Za-z]{2,3}\d{4}$/;

function validateVehicleInput({ vehicle_no, vehicle_model, vehicle_type, initial_odometer }) {
  if (!vehicle_no || !VEHICLE_NO_REGEX.test(vehicle_no)) {
    throw new Error("Vehicle No must be in the format xx0000 or xxx0000 (e.g. AB1234 or ABC1234)");
  }
  if (!vehicle_model || vehicle_model.trim().length < 1) {
    throw new Error("Vehicle Model is required");
  }
  if (!['lorry', 'pickup'].includes(vehicle_type)) {
    throw new Error("Vehicle Type must be Lorry or Pickup");
  }
  const odometer = Number(initial_odometer);
  if (initial_odometer === '' || initial_odometer === null || initial_odometer === undefined || isNaN(odometer) || odometer < 0) {
    throw new Error("Initial Odometer must be a valid non-negative number");
  }
}

export function useVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setVehicles(data || []);
    } catch (err) {
      console.error("Failed to fetch vehicles:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();

    const channel = supabase
      .channel(`vehicles-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles' },
        () => {
          fetchVehicles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addVehicle = async ({ vehicle_no, vehicle_model, vehicle_type, initial_odometer }) => {
    const normalized = vehicle_no?.trim().toUpperCase();
    validateVehicleInput({ vehicle_no: normalized, vehicle_model, vehicle_type, initial_odometer });

    const { data: existing } = await supabase
      .from('vehicles')
      .select('id')
      .eq('vehicle_no', normalized)
      .maybeSingle();

    if (existing) {
      throw new Error("A vehicle with this Vehicle No already exists");
    }

    const { data, error: insertErr } = await supabase
      .from('vehicles')
      .insert({
        vehicle_no: normalized,
        vehicle_model: vehicle_model.trim(),
        vehicle_type,
        initial_odometer: Number(initial_odometer),
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertErr) throw new Error(insertErr.message);

    logActivity({ action: 'create', entityType: 'vehicle', entityId: data.id, entityLabel: normalized, description: `Added vehicle ${normalized}` });
    return { id: data.id, vehicle_no: normalized };
  };

  const updateVehicle = async (id, { vehicle_no, vehicle_model, vehicle_type, initial_odometer }) => {
    const normalized = vehicle_no?.trim().toUpperCase();
    validateVehicleInput({ vehicle_no: normalized, vehicle_model, vehicle_type, initial_odometer });

    const { data: existing } = await supabase
      .from('vehicles')
      .select('id')
      .eq('vehicle_no', normalized)
      .maybeSingle();

    if (existing && Number(existing.id) !== Number(id)) {
      throw new Error("Another vehicle with this Vehicle No already exists");
    }

    const { error: updateErr } = await supabase
      .from('vehicles')
      .update({
        vehicle_no: normalized,
        vehicle_model: vehicle_model.trim(),
        vehicle_type,
        initial_odometer: Number(initial_odometer)
      })
      .eq('id', id);

    if (updateErr) throw new Error(updateErr.message);
    logActivity({ action: 'update', entityType: 'vehicle', entityId: id, entityLabel: normalized, description: `Updated vehicle ${normalized}` });
  };

  const deleteVehicle = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'vehicles',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
  };

  return {
    vehicles,
    isLoading,
    addVehicle,
    updateVehicle,
    deleteVehicle
  };
}
