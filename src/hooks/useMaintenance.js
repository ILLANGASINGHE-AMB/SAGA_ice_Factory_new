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
    let updatedList = [];
    try {
      await supabase
        .from('equipment_maintenance')
        .update({ status, notes, last_service_date: status === 'operational' ? new Date().toISOString() : undefined })
        .eq('id', id);
    } catch (e) {
      console.warn("Supabase equipment update failed, updating local state:", e);
    }

    updatedList = equipmentList.map(item => {
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
      // Edit / Update existing equipment log
      const payload = {
        status,
        last_service_date: now,
        next_service_due: next_service_due ? new Date(next_service_due).toISOString() : null,
        cost: serviceCost,
        performed_by,
        notes
      };

      try {
        await supabase
          .from('equipment_maintenance')
          .update(payload)
          .eq('id', id);
      } catch (e) {
        console.warn("Update maintenance error:", e);
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

      let inserted = null;
      try {
        const { data } = await supabase
          .from('equipment_maintenance')
          .insert([newPayload])
          .select('*')
          .single();
        if (data) inserted = data;
      } catch (e) {
        console.warn("Insert equipment error:", e);
      }

      if (!inserted) {
        inserted = { ...newPayload, id: Date.now() };
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
