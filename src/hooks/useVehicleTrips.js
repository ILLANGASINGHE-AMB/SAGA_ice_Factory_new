import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
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
      .select('*, employee:employees(id, employee_code, name)')
      .eq('vehicle_id', vehicleId)
      .order('trip_date', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      console.error("Failed to fetch trip history:", error);
    }
    setTrips(data || []);
    setIsLoading(false);
  }, [vehicleId]);

  useEffect(() => {
    const refetchTrips = coalesceRefetch(fetchTrips);
    let cancelled = false;
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        refetchTrips
      )
      .subscribe();

    return () => {
      refetchTrips.cancel();
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [vehicleId, fetchTrips]);

  const addTrip = async (vehicleIdArg, { trip_date, employee_id, start_odometer, end_odometer, description = '' }, createdBy = 'Operator') => {
    const start = Number(start_odometer);
    const end = Number(end_odometer);

    if (!trip_date) {
      throw new Error("Trip date is required");
    }
    if (!employee_id) {
      throw new Error("A driver must be assigned to the trip");
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
        employee_id: Number(employee_id),
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
