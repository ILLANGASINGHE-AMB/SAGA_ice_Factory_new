import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { CustomerFormModal } from '../components/CustomerFormModal';
import { Plus, Search, Eye } from 'lucide-react';

export function CustomersPage() {
  const { customers, isLoading, addCustomer, updateCustomer } = useCustomers();
  const toast = useToast();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // Walk-in buyers are recorded so their sales stay attributed, but they
  // aren't accounts — they're hidden from the registry unless asked for.
  const [showOneTime, setShowOneTime] = useState(false);

  const handleSaved = ({ mode, name, customer_code, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else if (mode === 'add') {
      toast.success(`Successfully registered customer: ${name} (${customer_code})`);
    } else {
      toast.success(`Successfully updated customer: ${name}`);
    }
  };

  // Filtered customer records based on Search query
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const scoped = showOneTime ? customers : customers.filter(c => !c.is_one_time);
    const query = searchQuery.toLowerCase().trim();
    if (!query) return scoped;
    return scoped.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.whatsapp_number?.includes(query) ||
      c.contact_number?.includes(query) ||
      c.customer_code.toLowerCase().includes(query)
    );
  }, [customers, searchQuery, showOneTime]);

  const oneTimeCount = useMemo(
    () => (customers || []).filter(c => c.is_one_time).length,
    [customers]
  );

  return (
    <div className="space-y-6">

      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 focus:ring-navy-500 focus:border-navy-500 rounded-xl text-slate-900 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-opacity-50 transition"
            placeholder="Search by customer name, number, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOneTime(v => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap ${
              showOneTime
                ? 'bg-navy-600 text-white border-navy-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
            title="One-time walk-in buyers recorded at the till"
          >
            One-Time ({oneTimeCount.toLocaleString()})
          </button>

          {/* Add customer button */}
          <Button
            variant="primary"
            onClick={() => setModalOpen(true)}
            className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl"
          >
            <Plus size={16} />
            <span>Add New Customer</span>
          </Button>
        </div>
      </div>

      {/* Customer Registry Grid */}
      <Table
        enablePagination={false}
        headers={[
          { key: 'customer_code', label: 'Customer ID' },
          { key: 'name', label: 'Customer Name' },
          { key: 'actions', label: 'View', sortable: false }
        ]}
        data={filteredCustomers}
        isLoading={isLoading}
        emptyMessage="No customer records match your filter criteria."
        renderRow={(customer) => (
          <tr key={customer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">{customer.customer_code}</td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-semibold text-slate-900 dark:text-slate-100">
              <span className="inline-flex items-center space-x-1.5">
                <span>{customer.name}</span>
                {customer.is_branch && (
                  <span
                    title="Branch customer — managed in Settings"
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold shrink-0"
                  >
                    B
                  </span>
                )}
                {customer.is_one_time && (
                  <span
                    title="One-time walk-in buyer — not a registered account"
                    className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-bold uppercase tracking-wide shrink-0"
                  >
                    One-Time
                  </span>
                )}
              </span>
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
              <button
                onClick={() => navigate(`/customers/${customer.id}`)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 transition cursor-pointer"
                title="View Customer Profile"
              >
                <Eye size={14} />
                <span>View</span>
              </button>
            </td>
          </tr>
        )}
      />

      {/* Add Customer Form Modal */}
      <CustomerFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editingCustomer={null}
        addCustomer={addCustomer}
        updateCustomer={updateCustomer}
        onSaved={handleSaved}
      />

    </div>
  );
}
