import React, { useState, useMemo } from 'react';
import { useVehicles } from '../hooks/useVehicles';
import { useDrivers } from '../hooks/useDrivers';
import { useTransportTrips } from '../hooks/useTransportTrips';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { TransportTripFormModal } from '../components/TransportTripFormModal';
import { EndTripModal } from '../components/EndTripModal';
import { Plus, Square } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' }
];

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function isWithinRange(dateStr, dateFrom, dateTo) {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

function pad(n) { return String(n).padStart(2, '0'); }
function toDateInput(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

export function TransportPage() {
  const { vehicles, isLoading: vehiclesLoading } = useVehicles();
  const { drivers, isLoading: driversLoading, addDriver } = useDrivers();
  const { trips, isLoading: tripsLoading, startTrip, endTrip } = useTransportTrips();
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState('all');
  const [activePeriod, setActivePeriod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');

  const [newTripOpen, setNewTripOpen] = useState(false);
  const [endTripTarget, setEndTripTarget] = useState(null);

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [Number(v.id), v])), [vehicles]);
  const driverById = useMemo(() => new Map(drivers.map(d => [Number(d.id), d])), [drivers]);

  const applyPeriod = (period) => {
    const today = new Date();
    setActivePeriod(period);
    if (period === 'daily') {
      const d = toDateInput(today);
      setDateFrom(d);
      setDateTo(d);
    } else if (period === 'monthly') {
      setDateFrom(toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(toDateInput(today));
    } else if (period === 'yearly') {
      setDateFrom(toDateInput(new Date(today.getFullYear(), 0, 1)));
      setDateTo(toDateInput(today));
    }
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setActivePeriod('');
    setDateFrom('');
    setDateTo('');
    setVehicleFilter('');
    setDriverFilter('');
  };

  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      if (vehicleFilter && Number(t.vehicle_id) !== Number(vehicleFilter)) return false;
      if (driverFilter && Number(t.driver_id) !== Number(driverFilter)) return false;
      if (!isWithinRange(t.start_datetime, dateFrom, dateTo)) return false;
      return true;
    });
  }, [trips, vehicleFilter, driverFilter, dateFrom, dateTo]);

  const ongoingTrips = useMemo(
    () => filteredTrips.filter(t => t.status === 'ongoing'),
    [filteredTrips]
  );

  const historyTrips = useMemo(
    () => statusFilter === 'all' ? filteredTrips : filteredTrips.filter(t => t.status === statusFilter),
    [filteredTrips, statusFilter]
  );

  const handleStartTrip = async (data) => {
    await startTrip(data, 'Operator');
    toast.success("Trip started successfully");
  };

  const handleEndTrip = async (id, data, startOdometer) => {
    await endTrip(id, data, startOdometer);
    toast.success("Trip ended successfully");
  };

  const renderFilterBar = ({ withStatus }) => (
    <div className="flex flex-wrap items-center gap-2">
      {withStatus && (
        <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === opt.value ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {['daily', 'monthly', 'yearly'].map(opt => (
        <button
          key={opt}
          onClick={() => applyPeriod(opt)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
            activePeriod === opt
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
        onChange={(e) => { setDateFrom(e.target.value); setActivePeriod(''); }}
        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
      />
      <span className="text-xs text-slate-400">to</span>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => { setDateTo(e.target.value); setActivePeriod(''); }}
        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
      />

      <select
        value={vehicleFilter}
        onChange={(e) => setVehicleFilter(e.target.value)}
        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none font-semibold"
      >
        <option value="">All Vehicles</option>
        {vehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}
      </select>

      <select
        value={driverFilter}
        onChange={(e) => setDriverFilter(e.target.value)}
        className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none font-semibold"
      >
        <option value="">All Drivers</option>
        {drivers.map(d => <option key={d.id} value={d.id}>{d.driver_name}</option>)}
      </select>

      {(statusFilter !== 'all' || activePeriod || dateFrom || dateTo || vehicleFilter || driverFilter) && (
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-navy-600 dark:hover:text-navy-400 transition"
        >
          Clear Filters
        </button>
      )}
    </div>
  );

  const isLoading = vehiclesLoading || driversLoading || tripsLoading;

  return (
    <div className="space-y-6">

      {/* Action Bar */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => setNewTripOpen(true)}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl"
        >
          <Plus size={16} />
          <span>New Trip</span>
        </Button>
      </div>

      {/* Ongoing Trips */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Ongoing Trips</h3>
        {renderFilterBar({ withStatus: false })}

        <Table
          enablePagination={false}
          headers={[
            { key: 'trip_id', label: 'Trip ID' },
            { key: 'vehicle_no', label: 'Vehicle No' },
            { key: 'driver', label: 'Driver' },
            { key: 'start_datetime', label: 'Start Date and Time' },
            { key: 'start_odometer', label: 'Start KM' },
            { key: 'description', label: 'Description' },
            { key: 'actions', label: 'Action', sortable: false }
          ]}
          data={ongoingTrips}
          isLoading={isLoading}
          emptyMessage="No ongoing trips match your filter criteria."
          renderRow={(trip) => (
            <tr key={trip.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">TRP-{String(trip.id).padStart(6, '0')}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{vehicleById.get(Number(trip.vehicle_id))?.vehicle_no || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-700 dark:text-slate-300">{driverById.get(Number(trip.driver_id))?.driver_name || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-500 whitespace-nowrap">{formatDateTime(trip.start_datetime)}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{Number(trip.start_odometer).toLocaleString()}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">{trip.description || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                <button
                  onClick={() => setEndTripTarget(trip)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                  title="End Trip"
                >
                  <Square size={12} />
                  <span>End Trip</span>
                </button>
              </td>
            </tr>
          )}
        />
      </div>

      {/* Trip History */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Trip History</h3>
        {renderFilterBar({ withStatus: true })}

        <Table
          headers={[
            { key: 'trip_id', label: 'Trip ID' },
            { key: 'vehicle_no', label: 'Vehicle No' },
            { key: 'driver', label: 'Driver' },
            { key: 'start_datetime', label: 'Start Date and Time' },
            { key: 'start_odometer', label: 'Start KM' },
            { key: 'end_odometer', label: 'End KM' },
            { key: 'distance_travelled', label: 'Total Distance' },
            { key: 'status', label: 'Status' },
            { key: 'end_datetime', label: 'End Date and Time' },
            { key: 'description', label: 'Description' }
          ]}
          data={historyTrips}
          isLoading={isLoading}
          emptyMessage="No trip records match your filter criteria."
          renderRow={(trip) => (
            <tr key={trip.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">TRP-{String(trip.id).padStart(6, '0')}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{vehicleById.get(Number(trip.vehicle_id))?.vehicle_no || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-700 dark:text-slate-300">{driverById.get(Number(trip.driver_id))?.driver_name || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-500 whitespace-nowrap">{formatDateTime(trip.start_datetime)}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{Number(trip.start_odometer).toLocaleString()}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{trip.end_odometer != null ? Number(trip.end_odometer).toLocaleString() : '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {trip.distance_travelled != null ? `${Number(trip.distance_travelled).toLocaleString()} km` : '—'}
              </td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                <Badge label={trip.status === 'completed' ? 'Completed' : 'Not Completed'} type={trip.status} />
              </td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-500 whitespace-nowrap">{formatDateTime(trip.end_datetime)}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-600 dark:text-slate-300">
                {trip.status === 'completed' ? (trip.end_description || trip.description || '—') : (trip.description || '—')}
              </td>
            </tr>
          )}
        />
      </div>

      {/* New Trip Modal */}
      <TransportTripFormModal
        isOpen={newTripOpen}
        onClose={() => setNewTripOpen(false)}
        vehicles={vehicles}
        drivers={drivers}
        trips={trips}
        addDriver={addDriver}
        onSubmit={handleStartTrip}
      />

      {/* End Trip Modal */}
      <EndTripModal
        isOpen={!!endTripTarget}
        onClose={() => setEndTripTarget(null)}
        trip={endTripTarget}
        onSubmit={handleEndTrip}
      />

    </div>
  );
}
