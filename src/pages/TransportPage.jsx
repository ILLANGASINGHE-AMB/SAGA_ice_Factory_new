import React, { useState, useMemo } from 'react';
import { useVehicles } from '../hooks/useVehicles';
import { useEmployees } from '../hooks/useEmployees';
import { useTransportTrips } from '../hooks/useTransportTrips';
import { useAuth } from '../context/AuthContext';
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

// --- Graph bucketing -------------------------------------------------------
// The distance chart plots one point per time bucket across the *whole*
// selected date range, not just the dates that happen to have trips. Recharts
// needs at least two points to draw a line segment, so a range that collapses
// to a single bucket renders as a lone floating dot.
const GRANULARITY_ORDER = ['daily', 'monthly', 'yearly'];
const GRANULARITY_UNIT = { daily: 'day', monthly: 'month', yearly: 'year' };
const MAX_GRAPH_BUCKETS = 400;

function startOfBucket(date, granularity) {
  if (granularity === 'daily') return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (granularity === 'monthly') return new Date(date.getFullYear(), date.getMonth(), 1);
  return new Date(date.getFullYear(), 0, 1);
}

function nextBucket(date, granularity) {
  if (granularity === 'daily') return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  if (granularity === 'monthly') return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return new Date(date.getFullYear() + 1, 0, 1);
}

function bucketKey(date, granularity) {
  if (granularity === 'daily') return toLocalDateStr(date);
  if (granularity === 'monthly') return `${date.getFullYear()}-${date.getMonth()}`;
  return `${date.getFullYear()}`;
}

function bucketLabel(date, granularity) {
  if (granularity === 'daily') return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (granularity === 'monthly') return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return `${date.getFullYear()}`;
}

// How many buckets the window spans. Stops counting just past the cap so an
// absurd custom range can't spin here.
function countBuckets(start, end, granularity) {
  let count = 0;
  let cursor = startOfBucket(start, granularity);
  const last = startOfBucket(end, granularity);
  while (cursor <= last && count <= MAX_GRAPH_BUCKETS) {
    count += 1;
    cursor = nextBucket(cursor, granularity);
  }
  return count;
}

// Parses a yyyy-mm-dd date input as a *local* calendar date (new Date(str)
// would read it as UTC midnight and shift the day in negative-offset zones).
function parseDateInput(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

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
  const { user, isAdmin } = useAuth();
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

  // The window the chart covers: the filter bar's range when one is set,
  // otherwise the span of the trips actually being charted.
  const graphWindow = useMemo(() => {
    let start = parseDateInput(dateFrom);
    let end = parseDateInput(dateTo);

    if (!start || !end) {
      const times = historyTrips
        .filter(t => t.distance_travelled != null && t.start_datetime)
        .map(t => new Date(t.start_datetime).getTime())
        .filter(n => Number.isFinite(n));
      if (times.length === 0) return null;
      if (!start) start = new Date(Math.min(...times));
      if (!end) end = new Date(Math.max(...times));
    }

    return start <= end ? { start, end } : null;
  }, [historyTrips, dateFrom, dateTo]);

  // Granularity that the selected range can actually render. Bucketing
  // Aug 1-25 by year gives one point, which draws as a dot with no line, so
  // step to a finer bucket until the window yields at least two. Conversely a
  // multi-year range bucketed daily blows past the point cap, so coarsen.
  const effectiveGranularity = useMemo(() => {
    if (!graphWindow) return graphGranularity;
    const counts = GRANULARITY_ORDER.map(g => countBuckets(graphWindow.start, graphWindow.end, g));
    const requested = GRANULARITY_ORDER.indexOf(graphGranularity);

    if (counts[requested] > MAX_GRAPH_BUCKETS) {
      for (let i = requested + 1; i < GRANULARITY_ORDER.length; i += 1) {
        if (counts[i] <= MAX_GRAPH_BUCKETS) return GRANULARITY_ORDER[i];
      }
    }
    if (counts[requested] < 2) {
      for (let i = requested - 1; i >= 0; i -= 1) {
        if (counts[i] >= 2 && counts[i] <= MAX_GRAPH_BUCKETS) return GRANULARITY_ORDER[i];
      }
    }
    return graphGranularity;
  }, [graphWindow, graphGranularity]);

  const graphData = useMemo(() => {
    if (!graphWindow) return [];
    const granularity = effectiveGranularity;

    // Seed every bucket across the window up front so the series has no holes:
    // a vehicle that didn't run in a given period travelled 0 km, which is a
    // real data point, not a gap. Previously only dates with trips produced a
    // bucket, so the line jumped straight between distant dates - or, with a
    // single qualifying date, had nothing to connect to at all.
    const buckets = new Map();
    let cursor = startOfBucket(graphWindow.start, granularity);
    const last = startOfBucket(graphWindow.end, granularity);
    while (cursor <= last && buckets.size < MAX_GRAPH_BUCKETS) {
      const seed = { key: bucketKey(cursor, granularity), label: bucketLabel(cursor, granularity), sortDate: cursor };
      graphVehicles.forEach(v => { seed[v.vehicle_no] = 0; });
      buckets.set(seed.key, seed);
      cursor = nextBucket(cursor, granularity);
    }

    historyTrips.forEach(t => {
      if (t.distance_travelled == null || !t.start_datetime) return;
      const vehicle = vehicleById.get(Number(t.vehicle_id));
      if (!vehicle) return;
      const bucket = buckets.get(bucketKey(new Date(t.start_datetime), granularity));
      if (!bucket) return;
      bucket[vehicle.vehicle_no] = (bucket[vehicle.vehicle_no] || 0) + Number(t.distance_travelled);
    });

    return Array.from(buckets.values()).sort((a, b) => a.sortDate - b.sortDate);
  }, [historyTrips, effectiveGranularity, graphWindow, graphVehicles, vehicleById]);

  // A single-day range (the filter bar's "Daily" preset) yields one bucket at
  // every granularity, so there is no trend to draw. Say so rather than
  // rendering a lone dot that looks like a broken chart.
  const graphNotice = useMemo(() => {
    if (graphVehicles.length === 0 || graphData.length === 0) {
      return 'No completed trips match your filter criteria.';
    }
    if (graphData.length < 2) {
      return 'The selected date range covers a single period, so there is no trend to plot. Widen the date range to chart distance over time.';
    }
    return null;
  }, [graphVehicles, graphData]);

  const handleStartTrip = async (data) => {
    await startTrip(data, user?.fullName || 'Operator');
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
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">{trip.trip_code || '—'}</td>
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
                <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">{trip.trip_code || '—'}</td>
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
                {GRANULARITY_ORDER.map(opt => {
                  // A bucket size the selected range can't plot is disabled rather
                  // than silently rendering a single dot.
                  const count = graphWindow ? countBuckets(graphWindow.start, graphWindow.end, opt) : 0;
                  const unusable = Boolean(graphWindow) && (count < 2 || count > MAX_GRAPH_BUCKETS);
                  const unit = GRANULARITY_UNIT[opt];
                  return (
                    <button
                      key={opt}
                      onClick={() => setGraphGranularity(opt)}
                      disabled={unusable}
                      title={unusable
                        ? (count < 2
                            ? `The selected date range spans less than two ${unit}s, so there is nothing to plot a trend across.`
                            : `The selected date range spans too many ${unit}s to chart. Narrow the range or use a larger bucket.`)
                        : undefined}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                        effectiveGranularity === opt
                          ? 'bg-navy-600 text-white border-navy-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      } ${unusable ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {opt === 'daily' ? 'Daily' : opt === 'monthly' ? 'Monthly' : 'Yearly'}
                    </button>
                  );
                })}
              </div>
            </div>

            {graphNotice ? (
              <p className="text-xs text-slate-400 text-center py-16 max-w-md mx-auto">{graphNotice}</p>
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
        isAdmin={isAdmin}
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
