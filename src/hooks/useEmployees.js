import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
    fetchEmployees();

    const channel = supabase
      .channel(`employees-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          fetchEmployees();
        }
      )
      .subscribe();

    return () => {
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

    // Auto-generate atomic employee_code, same pattern as customer_code —
    // no count(*)-based fallback so a deleted employee can't cause a
    // regenerated code to collide with the `unique` constraint.
    const { data: codeData, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'employee',
      p_prefix: 'EMP'
    });

    if (codeErr || !codeData) {
      throw new Error("Unable to generate an employee code. Please try again.");
    }
    const employee_code = codeData;

    const { data, error: insertErr } = await supabase
      .from('employees')
      .insert({
        employee_code,
        name: name.trim(),
        nic: normalizedNic,
        phone: phone.trim(),
        address: address.trim(),
        job_type: job_type.trim(),
        status,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertErr) throw new Error(insertErr.message);

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
  };

  const deleteEmployee = async (id) => {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('id', id);
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
