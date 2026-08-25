import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

export function useEmployeeAttendance() {
  const [attendance, setAttendance] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('employee_attendance')
        .select('*')
        .order('attendance_date', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      setAttendance(data || []);
    } catch (err) {
      console.error("Failed to fetch employee attendance:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchAttendance = coalesceRefetch(fetchAttendance);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAttendance();

    const channel = supabase
      .channel(`employee-attendance-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_attendance' },
        refetchAttendance
      )
      .subscribe();

    return () => {
      refetchAttendance.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const validateRow = ({ employee_id, attendance_date }) => {
    if (!employee_id) {
      throw new Error("An employee must be selected for every row");
    }
    if (!attendance_date) {
      throw new Error("Date is required for every row");
    }
  };

  const addAttendance = async ({ employee_id, attendance_date, start_time = '', end_time = '', description = '' }) => {
    validateRow({ employee_id, attendance_date });

    const { data, error } = await supabase
      .from('employee_attendance')
      .insert({
        employee_id: Number(employee_id),
        attendance_date,
        start_time: start_time || null,
        end_time: end_time || null,
        description: description.trim(),
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    logActivity({ action: 'create', entityType: 'employee_attendance', entityId: data.id, description: `Logged attendance for ${attendance_date}` });
    return { id: data.id };
  };

  const updateAttendance = async (id, { employee_id, attendance_date, start_time = '', end_time = '', description = '' }) => {
    validateRow({ employee_id, attendance_date });

    const { error } = await supabase
      .from('employee_attendance')
      .update({
        employee_id: Number(employee_id),
        attendance_date,
        start_time: start_time || null,
        end_time: end_time || null,
        description: description.trim()
      })
      .eq('id', id);

    if (error) throw new Error(error.message);
    logActivity({ action: 'update', entityType: 'employee_attendance', entityId: id, description: `Updated attendance for ${attendance_date}` });
  };

  const deleteAttendance = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'employee_attendance',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
  };

  return {
    attendance,
    isLoading,
    addAttendance,
    updateAttendance,
    deleteAttendance
  };
}
