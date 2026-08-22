import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { logActivity, currentActor } from '../lib/activityLog';

export function useVehicleTrips(vehicleId) {
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrips = useCallback(async () => {
    if (!vehicleId) {
      setTrips([]);
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('vehicle_trips')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('trip_date', { ascending: false });

    if (error) {
      console.error("Failed to fetch trip history:", error);
    }
    setTrips(data || []);
    setIsLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      if (cancelled) return;
      await fetchTrips();
    })();

    if (!vehicleId) return;

    const channel = supabase
      .channel(`vehicle-trips-realtime-${vehicleId}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicle_trips', filter: `vehicle_id=eq.${vehicleId}` },
        () => fetchTrips()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [vehicleId, fetchTrips]);

  const addTrip = async (vehicleIdArg, { trip_date, start_odometer, end_odometer, description = '' }, createdBy = 'Operator') => {
    const start = Number(start_odometer);
    const end = Number(end_odometer);

    if (!trip_date) {
      throw new Error("Trip date is required");
    }
    if (isNaN(start) || start < 0) {
      throw new Error("Start Odometer must be a valid non-negative number");
    }
    if (isNaN(end) || end < 0) {
      throw new Error("End Odometer must be a valid non-negative number");
    }
    if (end < start) {
      throw new Error("End Odometer cannot be less than Start Odometer");
    }

    const { data, error } = await supabase
      .from('vehicle_trips')
      .insert({
        vehicle_id: vehicleIdArg,
        trip_date,
        start_odometer: start,
        end_odometer: end,
        description: description.trim(),
        created_by: createdBy,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    logActivity({ action: 'create', entityType: 'vehicle_trip', entityId: data?.id, description: `Logged a vehicle trip on ${trip_date}`, performedBy: createdBy });
  };

  const deleteTrip = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'vehicle_trips',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
  };

  return {
    trips,
    isLoading,
    addTrip,
    deleteTrip
  };
}
