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

    // Atomic sequential code (mirrors sale_code/customer_code/expense_code).
    // The previous 900-value random daily suffix had a real chance of
    // colliding with an existing batch_code (unique constraint), which used
    // to fail the insert silently.
    const { data: batch_code, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'batch',
      p_prefix: 'BATCH'
    });

    if (codeErr || !batch_code) {
      throw new Error("Unable to generate a batch code. Please try again.");
    }

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

    // Insert must actually succeed — a failed insert (RLS denial, unique
    // constraint on batch_code, network error) is surfaced as an error
    // instead of being silently replaced with a client-only fake record,
    // which previously caused the UI to report success for a batch that was
    // never persisted to the database.
    const { data: inserted, error: insertErr } = await supabase
      .from('production_batches')
      .insert([batchData])
      .select('*')
      .single();

    if (insertErr) {
      throw new Error(insertErr.message || "Failed to save production batch");
    }

    const updated = [inserted, ...batches];
    setBatches(updated);
    localStorage.setItem('saga_production_batches', JSON.stringify(updated));

    // Optional stock update for Production Cubes (MFC) — uses the atomic,
    // row-locked RPC instead of a plain read-then-write, which previously
    // allowed two concurrently-logged batches to both read the same starting
    // quantity and have one write silently clobber the other.
    if (updateInventory) {
      try {
        const { error: invRpcErr } = await supabase.rpc('add_inventory_stock_by_type', {
          p_cube_type: 'manufactured',
          p_amount: qty,
          p_reference_code: batch_code,
          p_created_by: created_by
        });
        if (invRpcErr) throw invRpcErr;
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
