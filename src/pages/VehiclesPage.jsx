import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVehicles } from '../hooks/useVehicles';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { VehicleFormModal } from '../components/VehicleFormModal';
import { Plus, Search, Eye } from 'lucide-react';

const VEHICLE_TYPE_LABELS = { lorry: 'Lorry', pickup: 'Pickup' };

export function VehiclesPage() {
  const { vehicles, isLoading, addVehicle, updateVehicle } = useVehicles();
  const toast = useToast();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const handleSaved = ({ mode, vehicle_no, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else if (mode === 'add') {
      toast.success(`Successfully registered vehicle: ${vehicle_no}`);
    } else {
      toast.success(`Successfully updated vehicle: ${vehicle_no}`);
    }
  };

  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return vehicles;
    return vehicles.filter(v =>
      v.vehicle_no.toLowerCase().includes(query) ||
      v.vehicle_model.toLowerCase().includes(query)
    );
  }, [vehicles, searchQuery]);

  return (
    <div className="space-y-6">

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 focus:ring-navy-500 focus:border-navy-500 rounded-xl text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-opacity-50 transition"
            placeholder="Search by vehicle number, model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Button
          variant="primary"
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl"
        >
          <Plus size={16} />
          <span>Add New Vehicle</span>
        </Button>
      </div>

      {/* Vehicles Registry Grid */}
      <Table
        enablePagination={false}
        headers={[
          { key: 'vehicle_no', label: 'Vehicle Number' },
          { key: 'vehicle_model', label: 'Vehicle Model' },
          { key: 'vehicle_type', label: 'Vehicle Type' },
          { key: 'actions', label: 'View', sortable: false }
        ]}
        data={filteredVehicles}
        isLoading={isLoading}
        emptyMessage="No vehicle records match your filter criteria."
        renderRow={(vehicle) => (
          <tr key={vehicle.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">{vehicle.vehicle_no}</td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-semibold text-slate-900 dark:text-slate-100">{vehicle.vehicle_model}</td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
              <Badge label={VEHICLE_TYPE_LABELS[vehicle.vehicle_type] || vehicle.vehicle_type} type={vehicle.vehicle_type} />
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
              <button
                onClick={() => navigate(`/vehicles/${vehicle.id}`)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 transition cursor-pointer"
                title="View Vehicle Profile"
              >
                <Eye size={14} />
                <span>View</span>
              </button>
            </td>
          </tr>
        )}
      />

      {/* Add Vehicle Form Modal */}
      <VehicleFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editingVehicle={null}
        addVehicle={addVehicle}
        updateVehicle={updateVehicle}
        onSaved={handleSaved}
      />

    </div>
  );
}
