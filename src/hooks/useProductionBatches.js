import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const INITIAL_BATCHES = [
  {
    id: 1,
    batch_code: 'BATCH-20260801-01',
    cubes_produced: 1200,
    electricity_units: 180.5,
    electricity_cost: 3610.00,
    diesel_liters: 15.0,
    diesel_cost: 1200.00,
    total_energy_cost: 4810.00,
    cost_per_cube: 4.0083,
    batch_date: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    notes: 'Morning Shift Freezing Cycle 1',
    created_by: 'Operator'
  },
  {
    id: 2,
    batch_code: 'BATCH-20260731-02',
    cubes_produced: 1500,
    electricity_units: 210.0,
    electricity_cost: 4200.00,
    diesel_liters: 0,
    diesel_cost: 0.00,
    total_energy_cost: 4200.00,
    cost_per_cube: 2.8000,
    batch_date: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    notes: 'Full Grid Power Run',
    created_by: 'Operator'
  }
];

export function useProductionBatches() {
  const [batches, setBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('production_batches')
        .select('*')
        .order('batch_date', { ascending: false });

      if (error || !data || data.length === 0) {
        // Fallback to local storage or initial data
        const saved = localStorage.getItem('saga_production_batches');
        setBatches(saved ? JSON.parse(saved) : INITIAL_BATCHES);
      } else {
        setBatches(data);
        localStorage.setItem('saga_production_batches', JSON.stringify(data));
      }
    } catch (err) {
      console.warn("Using fallback local production batches:", err);
      const saved = localStorage.getItem('saga_production_batches');
      setBatches(saved ? JSON.parse(saved) : INITIAL_BATCHES);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();

    const channel = supabase
      .channel(`production_batches-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => fetchBatches())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addBatch = async ({
    cubes_produced,
    electricity_units = 0,
    electricity_cost = 0,
    diesel_liters = 0,
    diesel_cost = 0,
    notes = '',
    updateInventory = true,
    created_by = 'Operator'
  }) => {
    const qty = parseInt(cubes_produced, 10);
    if (isNaN(qty) || qty <= 0) throw new Error("Cubes produced must be greater than 0");

    const elecCost = parseFloat(electricity_cost) || 0;
    const dslCost = parseFloat(diesel_cost) || 0;
    const totalEnergy = elecCost + dslCost;
    const costPerCube = parseFloat((totalEnergy / qty).toFixed(4));

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const randId = Math.floor(100 + Math.random() * 900);
    const batch_code = `BATCH-${dateStr}-${randId}`;

    const batchData = {
      batch_code,
      cubes_produced: qty,
      electricity_units: parseFloat(electricity_units) || 0,
      electricity_cost: elecCost,
      diesel_liters: parseFloat(diesel_liters) || 0,
      diesel_cost: dslCost,
      total_energy_cost: totalEnergy,
      cost_per_cube: costPerCube,
      batch_date: new Date().toISOString(),
      notes,
      created_by
    };

    let inserted = null;

    try {
      const { data, error } = await supabase
        .from('production_batches')
        .insert([batchData])
        .select('*')
        .single();

      if (!error && data) {
        inserted = data;
      }
    } catch (e) {
      console.warn("Supabase insert production_batches failed, updating locally:", e);
    }

    if (!inserted) {
      inserted = { ...batchData, id: Date.now() };
    }

    const updated = [inserted, ...batches];
    setBatches(updated);
    localStorage.setItem('saga_production_batches', JSON.stringify(updated));

    // Optional stock update for Manufactured Cubes (MFC)
    if (updateInventory) {
      try {
        const { data: inv } = await supabase
          .from('inventory')
          .select('*')
          .eq('type', 'manufactured')
          .single();

        if (inv) {
          await supabase
            .from('inventory')
            .update({ quantity: inv.quantity + qty, updated_at: new Date().toISOString() })
            .eq('id', inv.id);
        }
      } catch (e) {
        console.warn("Inventory update from batch failed:", e);
      }
    }

    return inserted;
  };

  return {
    batches,
    isLoading,
    addBatch,
    refreshBatches: fetchBatches
  };
}
