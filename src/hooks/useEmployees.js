import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

// Sri Lankan NIC: old format (9 digits + V/X) or new format (12 digits)
const NIC_REGEX = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
const PHONE_REGEX = /^0\d{9}$/;

function validateEmployeeInput({ name, nic, phone }) {
  if (!name || name.trim().length < 2) {
    throw new Error("Name is required and must be at least 2 characters");
  }
  if (!nic || !NIC_REGEX.test(nic.trim())) {
    throw new Error("NIC must be a valid Sri Lankan NIC (e.g. 123456789V or 200012345678)");
  }
  if (phone && !PHONE_REGEX.test(phone)) {
    throw new Error("Phone number must be exactly 10 digits and start with 0 (e.g. 0771234567)");
  }
}

export function useEmployees() {
  const [employees, setEmployees] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error("Failed to fetch employees:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchEmployees = coalesceRefetch(fetchEmployees);
    fetchEmployees();

    const channel = supabase
      .channel(`employees-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        refetchEmployees
      )
      .subscribe();

    return () => {
      refetchEmployees.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const addEmployee = async ({ name, nic, phone = '', address = '', job_type = '', status = 'active' }) => {
    const normalizedNic = nic?.trim().toUpperCase();
    validateEmployeeInput({ name, nic: normalizedNic, phone });

    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('nic', normalizedNic)
      .maybeSingle();

    if (existing) {
      throw new Error("An employee with this NIC already exists");
    }

    // employee_code (SIFE_0001) is assigned by a BEFORE INSERT trigger — same
    // reasoning as customer_code: atomic with the row, and one fewer
    // round-trip.
    const { data, error: insertErr } = await supabase
      .from('employees')
      .insert({
        name: name.trim(),
        nic: normalizedNic,
        phone: phone.trim(),
        address: address.trim(),
        job_type: job_type.trim(),
        status,
        created_at: new Date().toISOString()
      })
      .select('id, employee_code')
      .single();

    if (insertErr) throw new Error(insertErr.message);
    const employee_code = data.employee_code;

    logActivity({ action: 'create', entityType: 'employee', entityId: data.id, entityLabel: employee_code, description: `Added employee ${employee_code} (${name.trim()})` });
    return { id: data.id, employee_code };
  };

  const updateEmployee = async (id, { name, nic, phone = '', address = '', job_type = '', status = 'active' }) => {
    const normalizedNic = nic?.trim().toUpperCase();
    validateEmployeeInput({ name, nic: normalizedNic, phone });

    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('nic', normalizedNic)
      .maybeSingle();

    if (existing && Number(existing.id) !== Number(id)) {
      throw new Error("Another employee with this NIC already exists");
    }

    const { error: updateErr } = await supabase
      .from('employees')
      .update({
        name: name.trim(),
        nic: normalizedNic,
        phone: phone.trim(),
        address: address.trim(),
        job_type: job_type.trim(),
        status
      })
      .eq('id', id);

    if (updateErr) throw new Error(updateErr.message);
    logActivity({ action: 'update', entityType: 'employee', entityId: id, description: `Updated employee ${name.trim()}` });
  };

  const deleteEmployee = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'employees',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message);
  };

  return {
    employees,
    isLoading,
    addEmployee,
    updateEmployee,
    deleteEmployee
  };
}
