import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const INITIAL_EQUIPMENT = [
  {
    id: 1,
    equipment_name: 'Industrial Compressor #1 (Sabroe 108)',
    equipment_type: 'Compressor',
    status: 'operational',
    last_service_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    next_service_due: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10).toISOString(),
    cost: 450.00,
    performed_by: 'FrostTech Ltd',
    notes: 'Routine oil filter & valve replacement'
  },
  {
    id: 2,
    equipment_name: 'Ammonia Chiller Unit A',
    equipment_type: 'Chiller',
    status: 'maintenance_due',
    last_service_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    next_service_due: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    cost: 0.00,
    performed_by: 'Pending Tech',
    notes: 'Pressure safety check overdue'
  },
  {
    id: 3,
    equipment_name: 'Backup Diesel Generator (150 kVA)',
    equipment_type: 'Generator',
    status: 'operational',
    last_service_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    next_service_due: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    cost: 120.00,
    performed_by: 'In-house Eng',
    notes: 'Full tank refilled & load test passed'
  },
  {
    id: 4,
    equipment_name: 'RO Water Filtration Plant',
    equipment_type: 'Water System',
    status: 'offline',
    last_service_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 70).toISOString(),
    next_service_due: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    cost: 0.00,
    performed_by: 'AquaPure Services',
    notes: 'Membrane replacement required. System offline.'
  }
];

export function useMaintenance() {
  const [equipmentList, setEquipmentList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEquipment = async () => {
    try {
      const { data, error } = await supabase
        .from('equipment_maintenance')
        .select('*')
        .order('id', { ascending: true });

      if (error || !data || data.length === 0) {
        const saved = localStorage.getItem('saga_equipment_maintenance');
        setEquipmentList(saved ? JSON.parse(saved) : INITIAL_EQUIPMENT);
      } else {
        setEquipmentList(data);
        localStorage.setItem('saga_equipment_maintenance', JSON.stringify(data));
      }
    } catch (err) {
      console.warn("Using fallback local equipment maintenance list:", err);
      const saved = localStorage.getItem('saga_equipment_maintenance');
      setEquipmentList(saved ? JSON.parse(saved) : INITIAL_EQUIPMENT);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();

    const channel = supabase
      .channel(`equipment_maintenance-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment_maintenance' }, () => fetchEquipment())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateEquipmentStatus = async (id, status, notes = '') => {
    // Supabase update calls resolve with { error } rather than throwing on
    // RLS denial or a constraint violation — checking only network-layer
    // exceptions let a rejected update still apply optimistically to local
    // state, showing a change that was never actually saved (and that a
    // later refetch would silently revert with no explanation).
    const { error } = await supabase
      .from('equipment_maintenance')
      .update({ status, notes, last_service_date: status === 'operational' ? new Date().toISOString() : undefined })
      .eq('id', id);

    if (error) {
      throw new Error(error.message || "Failed to update equipment status");
    }

    const updatedList = equipmentList.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status,
          notes: notes || item.notes,
          last_service_date: status === 'operational' ? new Date().toISOString() : item.last_service_date
        };
      }
      return item;
    });

    setEquipmentList(updatedList);
    localStorage.setItem('saga_equipment_maintenance', JSON.stringify(updatedList));
  };

  const logMaintenanceEvent = async ({
    id,
    equipment_name,
    equipment_type = 'Machinery',
    status = 'operational',
    next_service_due,
    cost = 0,
    performed_by = '',
    notes = ''
  }) => {
    const serviceCost = parseFloat(cost) || 0;
    const now = new Date().toISOString();

    if (id) {
      // Edit / Update existing equipment log. Only stamp last_service_date
      // to "now" when the status is actually being set to operational — an
      // edit that marks equipment offline (e.g. after a breakdown) or just
      // updates notes is not a service event, and must not overwrite the
      // real last-serviced date. Mirrors updateEquipmentStatus below.
      const existing = equipmentList.find(item => item.id === id);
      const payload = {
        status,
        last_service_date: status === 'operational' ? now : (existing?.last_service_date ?? null),
        next_service_due: next_service_due ? new Date(next_service_due).toISOString() : null,
        cost: serviceCost,
        performed_by,
        notes
      };

      const { error } = await supabase
        .from('equipment_maintenance')
        .update(payload)
        .eq('id', id);

      if (error) {
        throw new Error(error.message || "Failed to update equipment record");
      }

      const updated = equipmentList.map(item => item.id === id ? { ...item, ...payload } : item);
      setEquipmentList(updated);
      localStorage.setItem('saga_equipment_maintenance', JSON.stringify(updated));
    } else {
      // Add new machinery
      const newPayload = {
        equipment_name,
        equipment_type,
        status,
        last_service_date: now,
        next_service_due: next_service_due ? new Date(next_service_due).toISOString() : null,
        cost: serviceCost,
        performed_by,
        notes,
        created_at: now
      };

      // A failed insert must be surfaced as an error, not silently replaced
      // with a client-only fake record that vanishes on the next refetch
      // while the UI already reported success.
      const { data: inserted, error: insertErr } = await supabase
        .from('equipment_maintenance')
        .insert([newPayload])
        .select('*')
        .single();

      if (insertErr) {
        throw new Error(insertErr.message || "Failed to save equipment record");
      }

      const updated = [...equipmentList, inserted];
      setEquipmentList(updated);
      localStorage.setItem('saga_equipment_maintenance', JSON.stringify(updated));
    }
  };

  // Derive alert items
  const alertItems = equipmentList.filter(item => item.status === 'offline' || item.status === 'maintenance_due');

  return {
    equipmentList,
    alertItems,
    isLoading,
    updateEquipmentStatus,
    logMaintenanceEvent,
    refreshEquipment: fetchEquipment
  };
}
