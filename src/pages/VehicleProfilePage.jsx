import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useVehicles } from '../hooks/useVehicles';
import { useVehicleTrips } from '../hooks/useVehicleTrips';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { VehicleFormModal } from '../components/VehicleFormModal';
import { VehicleTripFormModal } from '../components/VehicleTripFormModal';
import {
  ArrowLeft, Edit2, Trash2, Table2, LineChart as LineChartIcon, Plus
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const GRAPH_COLOR = '#22c55e'; // Distance Travelled - green
const VEHICLE_TYPE_LABELS = { lorry: 'Lorry', pickup: 'Pickup' };

function isWithinRange(dateStr, dateFrom, dateTo) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

export function VehicleProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const vehicleId = Number(id);

  const { vehicles, isLoading: vehiclesLoading, updateVehicle, deleteVehicle } = useVehicles();
  const { trips, isLoading: tripsLoading, addTrip } = useVehicleTrips(vehicleId);
  const { isAdmin } = useAuth();
  const toast = useToast();

  const vehicle = useMemo(() => vehicles.find(v => Number(v.id) === vehicleId), [vehicles, vehicleId]);

  const [viewMode, setViewMode] = useState('table'); // 'table' | 'graph'
  const [granularity, setGranularity] = useState('daily'); // 'daily' | 'monthly' | 'yearly'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addTripOpen, setAddTripOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const filteredTrips = useMemo(() => {
    return trips.filter(t => isWithinRange(t.trip_date, dateFrom, dateTo));
  }, [trips, dateFrom, dateTo]);

  const totalDistance = filteredTrips.reduce((sum, t) => sum + Number(t.distance_travelled || 0), 0);

  const graphData = useMemo(() => {
    let keyFn, labelFn;
    if (granularity === 'daily') {
      keyFn = (d) => d.toISOString().slice(0, 10);
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (granularity === 'monthly') {
      keyFn = (d) => `${d.getFullYear()}-${d.getMonth()}`;
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    } else {
      keyFn = (d) => `${d.getFullYear()}`;
      labelFn = (d) => `${d.getFullYear()}`;
    }

    const buckets = new Map();
    filteredTrips.forEach(t => {
      const dateObj = new Date(t.trip_date);
      const key = keyFn(dateObj);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: labelFn(dateObj), sortDate: dateObj, 'Distance Travelled': 0 });
      }
      buckets.get(key)['Distance Travelled'] += Number(t.distance_travelled || 0);
    });

    return Array.from(buckets.values()).sort((a, b) => a.sortDate - b.sortDate);
  }, [filteredTrips, granularity]);

  const handleAddTrip = async (data) => {
    await addTrip(vehicleId, data, 'Operator');
    toast.success("Trip recorded successfully");
  };

  const handleSaved = ({ mode, vehicle_no, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else {
      toast.success(`Successfully updated vehicle: ${vehicle_no}`);
    }
  };

  const handleConfirmDelete = async () => {
    setActionLoading(true);
    try {
      await deleteVehicle(vehicleId);
      toast.success("Vehicle removed successfully");
      navigate('/vehicles');
    } catch (err) {
      toast.error(err.message || "Failed to delete vehicle");
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  };

  if (vehiclesLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl" />
        <div className="h-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-sm text-slate-500">Vehicle not found.</p>
        <Button variant="secondary" onClick={() => navigate('/vehicles')} className="mx-auto flex items-center space-x-1.5">
          <ArrowLeft size={14} />
          <span>Back to Vehicles</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Back link */}
      <button
        onClick={() => navigate('/vehicles')}
        className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-navy-600 dark:hover:text-navy-400 transition cursor-pointer"
      >
        <ArrowLeft size={14} />
        <span>Back to Vehicles</span>
      </button>

      {/* Vehicle Details Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[11px] font-mono font-semibold text-navy-600 dark:text-navy-400">Vehicle Details</span>
            <h2 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-slate-100">
              {vehicle.vehicle_no}
            </h2>
          </div>
          {isAdmin ? (
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} className="flex items-center space-x-1.5">
                <Edit2 size={14} />
                <span>Edit</span>
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)} className="flex items-center space-x-1.5">
                <Trash2 size={14} />
                <span>Delete</span>
              </Button>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-medium">Read Only</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 text-xs sm:text-sm">
          <div className="flex justify-between sm:block">
            <span className="text-slate-400">Vehicle Model</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 sm:block sm:mt-0.5">{vehicle.vehicle_model}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-400">Type</span>
            <span className="sm:block sm:mt-0.5">
              <Badge label={VEHICLE_TYPE_LABELS[vehicle.vehicle_type] || vehicle.vehicle_type} type={vehicle.vehicle_type} />
            </span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-slate-400">Initial Odometer</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 sm:block sm:mt-0.5">
              {Number(vehicle.initial_odometer).toLocaleString()} km
            </span>
          </div>
        </div>
      </div>

      {/* Trip History / Graph View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'table' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Table2 size={14} />
              <span>Trip History</span>
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === 'graph' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <LineChartIcon size={14} />
              <span>Graph View</span>
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setAddTripOpen(true)}
            className="flex items-center space-x-1.5"
          >
            <Plus size={14} />
            <span>Add Trip</span>
          </Button>
        </div>

        {/* Filter Options */}
        <div className="flex flex-wrap items-center gap-2">
          {['daily', 'monthly', 'yearly'].map(opt => (
            <button
              key={opt}
              onClick={() => setGranularity(opt)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                granularity === opt
                  ? 'bg-navy-600 text-white border-navy-600 shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {opt === 'daily' ? 'Daily' : opt === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
          />
        </div>

        {viewMode === 'table' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Trip History</h3>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Total Distance Travelled: {totalDistance.toLocaleString()} km
              </span>
            </div>
            <Table
              enablePagination={false}
              headers={[
                { key: 'trip_date', label: 'Date' },
                { key: 'distance_travelled', label: 'Distance Travelled' },
                { key: 'start_odometer', label: 'Start Odometer' },
                { key: 'end_odometer', label: 'End Odometer' },
                { key: 'description', label: 'Description' }
              ]}
              data={filteredTrips}
              isLoading={tripsLoading}
              emptyMessage="No trip records found for the selected filters."
              renderRow={(trip) => (
                <tr key={trip.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-slate-500">{new Date(trip.trip_date).toLocaleDateString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {Number(trip.distance_travelled).toLocaleString()} km
                  </td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{Number(trip.start_odometer).toLocaleString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{Number(trip.end_odometer).toLocaleString()}</td>
                  <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">{trip.description || '—'}</td>
                </tr>
              )}
            />
          </div>
        )}

        {viewMode === 'graph' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Distance Travelled</h3>
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 capitalize">
                {granularity} view
              </span>
            </div>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={graphData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:hidden" />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" className="hidden dark:block" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={9}
                    tickLine={false}
                    label={{ value: 'Distance Travelled (Km)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="Distance Travelled" stroke={GRAPH_COLOR} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Edit Vehicle Modal */}
      <VehicleFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        editingVehicle={vehicle}
        updateVehicle={updateVehicle}
        onSaved={handleSaved}
      />

      {/* Add Trip Modal */}
      <VehicleTripFormModal
        isOpen={addTripOpen}
        onClose={() => setAddTripOpen(false)}
        onSubmit={handleAddTrip}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Remove Vehicle?"
        message="Deleting this vehicle will remove it and its entire trip history from the system database permanently. Please confirm you want to proceed."
        confirmLabel="Confirm Delete"
        isLoading={actionLoading}
      />

    </div>
  );
}
