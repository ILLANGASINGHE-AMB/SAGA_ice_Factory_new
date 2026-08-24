import React, { useState, useMemo } from 'react';
import { useVehicles } from '../hooks/useVehicles';
import { useEmployees } from '../hooks/useEmployees';
import { useTransportTrips } from '../hooks/useTransportTrips';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { TransportTripFormModal } from '../components/TransportTripFormModal';
import { EndTripModal } from '../components/EndTripModal';
import { Plus, Square, Table2, LineChart as LineChartIcon } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { toLocalDateStr, isWithinLocalRange } from '../utils/date';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' }
];

const VEHICLE_LINE_COLORS = ['#22c55e', '#0ea5e9', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899', '#6366f1', '#84cc16'];

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function pad(n) { return String(n).padStart(2, '0'); }
function toDateInput(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

export function TransportPage() {
  const { vehicles, isLoading: vehiclesLoading } = useVehicles();
  const { employees, isLoading: employeesLoading } = useEmployees();
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

  const [historyViewMode, setHistoryViewMode] = useState('table'); // 'table' | 'graph'
  const [graphGranularity, setGraphGranularity] = useState('daily'); // 'daily' | 'monthly' | 'yearly'

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [Number(v.id), v])), [vehicles]);
  const employeeById = useMemo(() => new Map(employees.map(e => [Number(e.id), e])), [employees]);

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
      if (driverFilter && Number(t.employee_id) !== Number(driverFilter)) return false;
      if (!isWithinLocalRange(t.start_datetime, dateFrom, dateTo)) return false;
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

  // Graph View: one line per vehicle, plotting distance travelled (completed trips only)
  // bucketed by day/month/year according to graphGranularity.
  const graphVehicles = useMemo(() => {
    const idsWithDistance = new Set(
      historyTrips.filter(t => t.distance_travelled != null).map(t => Number(t.vehicle_id))
    );
    return vehicles.filter(v => idsWithDistance.has(Number(v.id)));
  }, [historyTrips, vehicles]);

  const graphData = useMemo(() => {
    let keyFn, labelFn;
    if (graphGranularity === 'daily') {
      keyFn = (d) => toLocalDateStr(d);
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (graphGranularity === 'monthly') {
      keyFn = (d) => `${d.getFullYear()}-${d.getMonth()}`;
      labelFn = (d) => d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    } else {
      keyFn = (d) => `${d.getFullYear()}`;
      labelFn = (d) => `${d.getFullYear()}`;
    }

    const buckets = new Map();
    historyTrips.forEach(t => {
      if (t.distance_travelled == null) return;
      const vehicle = vehicleById.get(Number(t.vehicle_id));
      if (!vehicle) return;

      const dateObj = new Date(t.start_datetime);
      const key = keyFn(dateObj);
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: labelFn(dateObj), sortDate: dateObj });
      }
      const bucket = buckets.get(key);
      bucket[vehicle.vehicle_no] = (bucket[vehicle.vehicle_no] || 0) + Number(t.distance_travelled);
    });

    return Array.from(buckets.values()).sort((a, b) => a.sortDate - b.sortDate);
  }, [historyTrips, graphGranularity, vehicleById]);

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
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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

  const isLoading = vehiclesLoading || employeesLoading || tripsLoading;

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
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-700 dark:text-slate-300">{employeeById.get(Number(trip.employee_id))?.name || '—'}</td>
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Trip History</h3>
          <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
            <button
              onClick={() => setHistoryViewMode('table')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                historyViewMode === 'table' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Table2 size={14} />
              <span>Table</span>
            </button>
            <button
              onClick={() => setHistoryViewMode('graph')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                historyViewMode === 'graph' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <LineChartIcon size={14} />
              <span>Graph View</span>
            </button>
          </div>
        </div>

        {renderFilterBar({ withStatus: true })}

        {historyViewMode === 'table' && (
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
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 text-slate-700 dark:text-slate-300">{employeeById.get(Number(trip.employee_id))?.name || '—'}</td>
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
        )}

        {historyViewMode === 'graph' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">Distance Travelled per Vehicle</h4>
              <div className="flex items-center gap-2">
                {['daily', 'monthly', 'yearly'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setGraphGranularity(opt)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                      graphGranularity === opt
                        ? 'bg-navy-600 text-white border-navy-600 shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {opt === 'daily' ? 'Daily' : opt === 'monthly' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            </div>

            {graphVehicles.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-16">No completed trips match your filter criteria.</p>
            ) : (
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
                      label={{ value: 'Distance (Km)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)', fontSize: '11px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {graphVehicles.map((vehicle, idx) => (
                      <Line
                        key={vehicle.id}
                        type="natural"
                        dataKey={vehicle.vehicle_no}
                        stroke={VEHICLE_LINE_COLORS[idx % VEHICLE_LINE_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: VEHICLE_LINE_COLORS[idx % VEHICLE_LINE_COLORS.length], strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Trip Modal */}
      <TransportTripFormModal
        isOpen={newTripOpen}
        onClose={() => setNewTripOpen(false)}
        vehicles={vehicles}
        employees={employees}
        trips={trips}
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
