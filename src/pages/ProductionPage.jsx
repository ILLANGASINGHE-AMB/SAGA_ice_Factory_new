import React, { useState } from 'react';
import { useProductionBatches } from '../hooks/useProductionBatches';
import { useMaintenance } from '../hooks/useMaintenance';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { 
  Zap, 
  Flame, 
  ShieldAlert, 
  Plus, 
  Wrench, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Boxes, 
  TrendingUp, 
  Activity, 
  Clock,
  Search,
  Filter
} from 'lucide-react';

export function ProductionPage() {
  const [activeTab, setActiveTab] = useState('batches'); // 'batches' | 'maintenance'
  const { batches, isLoading: loadingBatches, addBatch } = useProductionBatches();
  const { equipmentList, alertItems, isLoading: loadingMaintenance, updateEquipmentStatus, logMaintenanceEvent } = useMaintenance();
  const toast = useToast();

  // Search & Filter state
  const [batchSearch, setBatchSearch] = useState('');
  const [equipSearch, setEquipSearch] = useState('');

  // Modals state
  const [isAddBatchOpen, setIsAddBatchOpen] = useState(false);
  const [isLogMaintenanceOpen, setIsLogMaintenanceOpen] = useState(false);
  const [selectedEquipForMaintenance, setSelectedEquipForMaintenance] = useState(null);

  // New Batch Form State
  const [cubesProduced, setCubesProduced] = useState('');
  const [elecUnits, setElecUnits] = useState('');
  const [elecCost, setElecCost] = useState('');
  const [dieselLiters, setDieselLiters] = useState('');
  const [dieselCost, setDieselCost] = useState('');
  const [notes, setNotes] = useState('');
  const [autoAddStock, setAutoAddStock] = useState(true);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  // Maintenance Form State
  const [equipId, setEquipId] = useState('');
  const [equipName, setEquipName] = useState('');
  const [equipType, setEquipType] = useState('Compressor');
  const [status, setStatus] = useState('operational');
  const [nextDue, setNextDue] = useState('');
  const [maintCost, setMaintCost] = useState('');
  const [techName, setTechName] = useState('');
  const [maintNotes, setMaintNotes] = useState('');
  const [isSubmittingMaint, setIsSubmittingMaint] = useState(false);

  // Calculations for KPI Cards
  const totalCubes = batches.reduce((acc, b) => acc + (b.cubes_produced || 0), 0);
  const totalEnergyCost = batches.reduce((acc, b) => acc + (parseFloat(b.total_energy_cost) || 0), 0);
  const avgCostPerCube = totalCubes > 0 ? (totalEnergyCost / totalCubes).toFixed(4) : '0.00';
  const totalElecCost = batches.reduce((acc, b) => acc + (parseFloat(b.electricity_cost) || 0), 0);
  const totalDieselCost = batches.reduce((acc, b) => acc + (parseFloat(b.diesel_cost) || 0), 0);

  // Batch Form Submit
  const handleBatchSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmittingBatch(true);
      const newBatch = await addBatch({
        cubes_produced: cubesProduced,
        electricity_units: elecUnits,
        electricity_cost: elecCost,
        diesel_liters: dieselLiters,
        diesel_cost: dieselCost,
        notes,
        updateInventory: autoAddStock
      });

      toast.success(`Freezing Batch ${newBatch.batch_code} logged! Cost per cube: LKR ${newBatch.cost_per_cube}`);
      setIsAddBatchOpen(false);
      resetBatchForm();
    } catch (err) {
      toast.error(err.message || "Failed to log batch");
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  const resetBatchForm = () => {
    setCubesProduced('');
    setElecUnits('');
    setElecCost('');
    setDieselLiters('');
    setDieselCost('');
    setNotes('');
  };

  // Maintenance Submit
  const handleMaintenanceSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmittingMaint(true);
      await logMaintenanceEvent({
        id: equipId ? Number(equipId) : null,
        equipment_name: equipName,
        equipment_type: equipType,
        status,
        next_service_due: nextDue,
        cost: maintCost,
        performed_by: techName,
        notes: maintNotes
      });

      toast.success("Machinery maintenance log saved successfully");
      setIsLogMaintenanceOpen(false);
      resetMaintForm();
    } catch (err) {
      toast.error(err.message || "Failed to save maintenance log");
    } finally {
      setIsSubmittingMaint(false);
    }
  };

  const openMaintenanceForEquipment = (item) => {
    setEquipId(item.id);
    setEquipName(item.equipment_name);
    setEquipType(item.equipment_type || 'Machinery');
    setStatus(item.status);
    setNextDue(item.next_service_due ? item.next_service_due.slice(0, 10) : '');
    setMaintCost(item.cost || '');
    setTechName(item.performed_by || '');
    setMaintNotes(item.notes || '');
    setIsLogMaintenanceOpen(true);
  };

  const resetMaintForm = () => {
    setEquipId('');
    setEquipName('');
    setEquipType('Compressor');
    setStatus('operational');
    setNextDue('');
    setMaintCost('');
    setTechName('');
    setMaintNotes('');
  };

  // Filtered Batches
  const filteredBatches = batches.filter(b => 
    b.batch_code.toLowerCase().includes(batchSearch.toLowerCase()) ||
    (b.notes && b.notes.toLowerCase().includes(batchSearch.toLowerCase()))
  );

  // Filtered Equipment
  const filteredEquipment = equipmentList.filter(e => 
    e.equipment_name.toLowerCase().includes(equipSearch.toLowerCase()) ||
    e.equipment_type.toLowerCase().includes(equipSearch.toLowerCase())
  );

  const getStatusBadge = (st) => {
    if (st === 'operational') return <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"><CheckCircle2 size={13} /><span>Operational</span></span>;
    if (st === 'maintenance_due') return <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800"><AlertTriangle size={13} /><span>Service Due</span></span>;
    return <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800"><XCircle size={13} /><span>Offline / Downtime</span></span>;
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Tab Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Zap className="text-navy-500" size={24} />
            Production & Operations Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Freezing batch energy logging, cost-per-cube analytics, and equipment downtime alerts.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl">
          <button
            onClick={() => setActiveTab('batches')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'batches'
                ? 'bg-white dark:bg-slate-900 text-navy-600 dark:text-navy-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Freezing & Energy Logger
          </button>
          <button
            onClick={() => setActiveTab('maintenance')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'maintenance'
                ? 'bg-white dark:bg-slate-900 text-navy-600 dark:text-navy-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span>Machinery Maintenance</span>
            {alertItems.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            )}
          </button>
        </div>
      </div>

      {/* Equipment Downtime Warning Banner */}
      {alertItems.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white font-bold">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                Machinery Alerts Active ({alertItems.length})
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {alertItems.map(i => `${i.equipment_name} (${i.status === 'offline' ? 'OFFLINE' : 'Service Due'})`).join(' • ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('maintenance')}
            className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition whitespace-nowrap"
          >
            Inspect Equipment
          </button>
        </div>
      )}

      {/* TAB 1: FREEZING BATCH & ENERGY consumption LOGGER */}
      {activeTab === 'batches' && (
        <div className="space-y-6">
          
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <Boxes size={22} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cubes Produced</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  {totalCubes.toLocaleString()} <span className="text-xs font-normal text-slate-400">cubes</span>
                </h3>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <Zap size={22} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Energy Cost</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  LKR {totalEnergyCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <TrendingUp size={22} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Avg Cost / Cube</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  LKR {avgCostPerCube}
                </h3>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <Flame size={22} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Fuel vs Grid Split</span>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                  Grid: LKR {totalElecCost.toLocaleString()} <br/>
                  Diesel: LKR {totalDieselCost.toLocaleString()}
                </div>
              </div>
            </div>

          </div>

          {/* Table Header Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search batch code or notes..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-navy-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <Button
              variant="primary"
              onClick={() => setIsAddBatchOpen(true)}
              className="w-full sm:w-auto text-xs"
            >
              <Plus size={16} className="mr-1.5" />
              Log Freezing Batch
            </Button>
          </div>

          {/* Batches Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {loadingBatches ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredBatches.length === 0 ? (
              <div className="p-12 text-center">
                <Boxes size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Freezing Batches Logged</h3>
                <p className="text-xs text-slate-400 mt-1">Click "Log Freezing Batch" to record electricity and diesel costs per cycle.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase text-[10px] font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Batch Code</th>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4 text-right">Cubes Produced</th>
                      <th className="py-3 px-4 text-right">Elec Cost</th>
                      <th className="py-3 px-4 text-right">Diesel Cost</th>
                      <th className="py-3 px-4 text-right">Total Energy</th>
                      <th className="py-3 px-4 text-right">Cost / Cube</th>
                      <th className="py-3 px-4">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {filteredBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100 font-mono">
                          {b.batch_code}
                        </td>
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                          {new Date(b.batch_date).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                          {b.cubes_produced?.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">
                          LKR {parseFloat(b.electricity_cost || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">
                          LKR {parseFloat(b.diesel_cost || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                          LKR {parseFloat(b.total_energy_cost || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="inline-block px-2 py-0.5 rounded font-mono font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            LKR {b.cost_per_cube}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                          {b.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: MACHINERY MAINTENANCE & DOWNTIME ALERTS */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search machinery name or type..."
                value={equipSearch}
                onChange={(e) => setEquipSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-navy-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <Button
              variant="primary"
              onClick={() => { resetMaintForm(); setIsLogMaintenanceOpen(true); }}
              className="w-full sm:w-auto text-xs"
            >
              <Wrench size={16} className="mr-1.5" />
              Register Equipment / Log Service
            </Button>
          </div>

          {/* Machinery Status Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {loadingMaintenance ? (
              <Skeleton className="h-36 w-full rounded-2xl" />
            ) : filteredEquipment.map((equip) => (
              <div
                key={equip.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {equip.equipment_type || 'Machinery'}
                    </span>
                    {getStatusBadge(equip.status)}
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-heading mt-3">
                    {equip.equipment_name}
                  </h3>
                </div>

                <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span>Last Service:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {equip.last_service_date ? new Date(equip.last_service_date).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Due:</span>
                    <span className={`font-semibold ${equip.status === 'maintenance_due' ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300'}`}>
                      {equip.next_service_due ? new Date(equip.next_service_due).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  {equip.performed_by && (
                    <div className="flex justify-between text-[11px]">
                      <span>Technician:</span>
                      <span className="text-slate-600 dark:text-slate-400">{equip.performed_by}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={() => openMaintenanceForEquipment(equip)}
                    className="flex-1 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg transition"
                  >
                    Update Log
                  </button>
                  {equip.status !== 'operational' && (
                    <button
                      onClick={() => updateEquipmentStatus(equip.id, 'operational', 'Marked operational by user')}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                      title="Set to Operational"
                    >
                      Clear Alert
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* MODAL: LOG FREEZING BATCH */}
      <Modal
        isOpen={isAddBatchOpen}
        onClose={() => setIsAddBatchOpen(false)}
        title="Log Freezing Cycle & Energy Usage"
      >
        <form onSubmit={handleBatchSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Manufactured Ice Cubes Produced <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="1"
              placeholder="e.g. 1200"
              value={cubesProduced}
              onChange={(e) => setCubesProduced(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Electricity Units (kWh)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 180.5"
                value={elecUnits}
                onChange={(e) => setElecUnits(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Electricity Cost (LKR)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 3610.00"
                value={elecCost}
                onChange={(e) => setElecCost(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Diesel Liters
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 15.0"
                value={dieselLiters}
                onChange={(e) => setDieselLiters(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Diesel Cost (LKR)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 1200.00"
                value={dieselCost}
                onChange={(e) => setDieselCost(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Live Unit Cost Calculation Display */}
          {cubesProduced && (
            <div className="p-3 bg-navy-50 dark:bg-navy-950/40 border border-navy-200 dark:border-navy-900 rounded-xl text-xs flex justify-between items-center">
              <span className="font-bold text-navy-800 dark:text-navy-200">Estimated Cost per Cube:</span>
              <span className="font-mono font-bold text-navy-600 dark:text-navy-400 text-sm">
                LKR {(((parseFloat(elecCost)||0) + (parseFloat(dieselCost)||0)) / (parseInt(cubesProduced)||1)).toFixed(4)}
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Shift / Cycle Notes</label>
            <input
              type="text"
              placeholder="e.g. Compressor #1 morning run"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="autoStock"
              checked={autoAddStock}
              onChange={(e) => setAutoAddStock(e.target.checked)}
              className="w-4 h-4 text-navy-600 rounded border-slate-300 focus:ring-navy-500"
            />
            <label htmlFor="autoStock" className="text-xs text-slate-700 dark:text-slate-300">
              Automatically add produced cubes to Manufactured Stock (MFC) inventory
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setIsAddBatchOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmittingBatch}>
              {isSubmittingBatch ? 'Logging...' : 'Confirm & Save Batch'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: LOG EQUIPMENT MAINTENANCE */}
      <Modal
        isOpen={isLogMaintenanceOpen}
        onClose={() => setIsLogMaintenanceOpen(false)}
        title="Schedule / Log Machinery Maintenance"
      >
        <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Equipment Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              placeholder="e.g. Sabroe Industrial Compressor #2"
              value={equipName}
              onChange={(e) => setEquipName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Equipment Type</label>
              <select
                value={equipType}
                onChange={(e) => setEquipType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              >
                <option value="Compressor">Compressor</option>
                <option value="Chiller">Chiller</option>
                <option value="Generator">Generator</option>
                <option value="Water System">Water System</option>
                <option value="Other Machinery">Other Machinery</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Current Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              >
                <option value="operational">Operational 🟢</option>
                <option value="maintenance_due">Service Due 🟡</option>
                <option value="offline">Offline / Downtime 🔴</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Next Scheduled Service Date</label>
              <input
                type="date"
                value={nextDue}
                onChange={(e) => setNextDue(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Service Cost (LKR)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={maintCost}
                onChange={(e) => setMaintCost(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Service Contractor / Technician</label>
            <input
              type="text"
              placeholder="e.g. FrostTech Refrigeration Services"
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Maintenance Details & Notes</label>
            <textarea
              rows="3"
              placeholder="Oil change, gas pressure top up, filter replacement..."
              value={maintNotes}
              onChange={(e) => setMaintNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
            ></textarea>
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setIsLogMaintenanceOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmittingMaint}>
              {isSubmittingMaint ? 'Saving...' : 'Save Maintenance Record'}
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
