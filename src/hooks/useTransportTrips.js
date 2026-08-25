import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

export function useTransportTrips() {
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrips = async () => {
    try {
      const { data, error } = await supabase
        .from('transport_trips')
        .select('*')
        .order('start_datetime', { ascending: false });
      if (error) throw error;
      setTrips(data || []);
    } catch (err) {
      console.error("Failed to fetch trips:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchTrips = coalesceRefetch(fetchTrips);
    fetchTrips();

    const channel = supabase
      .channel(`transport-trips-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transport_trips' },
        refetchTrips
      )
      .subscribe();

    return () => {
      refetchTrips.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const startTrip = async ({ vehicle_id, employee_id, start_odometer, start_datetime, description = '' }, createdBy = 'Operator') => {
    const start = Number(start_odometer);

    if (!vehicle_id) throw new Error("Vehicle is required");
    if (!employee_id) throw new Error("Driver is required");
    if (!start_datetime) throw new Error("Start Date and Time is required");
    if (isNaN(start) || start < 0) throw new Error("Start KM must be a valid non-negative number");

    // A vehicle can only be on one trip at a time. Checked here for a clear,
    // immediate error message; a partial unique index on
    // (vehicle_id) where status = 'ongoing' is the actual guarantee — it
    // catches the race if two operators start the same vehicle at once,
    // which this pre-check alone cannot.
    const { data: existingOngoing } = await supabase
      .from('transport_trips')
      .select('id')
      .eq('vehicle_id', vehicle_id)
      .eq('status', 'ongoing')
      .limit(1)
      .maybeSingle();
    if (existingOngoing) {
      throw new Error("This vehicle already has a trip in progress. End it before starting a new one.");
    }

    const { data, error } = await supabase
      .from('transport_trips')
      .insert({
        vehicle_id,
        employee_id,
        start_odometer: start,
        start_datetime: new Date(start_datetime).toISOString(),
        description: description.trim(),
        status: 'ongoing',
        created_by: createdBy,
        created_at: new Date().toISOString()
      })
      .select('id, trip_code')
      .single();

    if (error) {
      // 23505 = unique_violation — the partial unique index caught a race
      // the pre-check above missed (two operators starting the same vehicle
      // within the same instant).
      if (error.code === '23505') {
        throw new Error("This vehicle already has a trip in progress. End it before starting a new one.");
      }
      throw new Error(error.message);
    }
    logActivity({ action: 'create', entityType: 'transport_trip', entityId: data.id, description: `Started a transport trip`, performedBy: createdBy });
    return data;
  };

  const endTrip = async (id, { end_odometer, end_datetime, description = '' }, startOdometer) => {
    const end = Number(end_odometer);

    if (!end_datetime) throw new Error("End Date and Time is required");
    if (isNaN(end) || end < 0) throw new Error("Final KM must be a valid non-negative number");
    // Strictly greater — a trip covering zero distance isn't a real trip, and
    // the odometer only ever moves forward.
    if (startOdometer !== undefined && end <= Number(startOdometer)) {
      throw new Error("Final KM must be greater than the Start KM");
    }

    const { error } = await supabase
      .from('transport_trips')
      .update({
        end_odometer: end,
        end_datetime: new Date(end_datetime).toISOString(),
        end_description: description.trim(),
        status: 'completed'
      })
      .eq('id', id);

    if (error) throw new Error(error.message);
    logActivity({ action: 'update', entityType: 'transport_trip', entityId: id, description: `Completed a transport trip` });
  };

  const deleteTrip = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'transport_trips',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
  };

  return {
    trips,
    isLoading,
    startTrip,
    endTrip,
    deleteTrip
  };
}
