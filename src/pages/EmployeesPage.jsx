import React, { useState, useMemo } from 'react';
import { useEmployees } from '../hooks/useEmployees';
import { useEmployeeAttendance } from '../hooks/useEmployeeAttendance';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmployeeFormModal } from '../components/EmployeeFormModal';
import { EmployeeAttendanceGrid } from '../components/EmployeeAttendanceGrid';
import { Plus, Search, Pencil, Trash2, ClipboardList, Table2 } from 'lucide-react';

function pad(n) { return String(n).padStart(2, '0'); }
function toDateInput(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

function isWithinRange(dateStr, dateFrom, dateTo) {
  if (!dateStr) return false;
  if (dateFrom && dateStr < dateFrom) return false;
  if (dateTo && dateStr > dateTo) return false;
  return true;
}

export function EmployeesPage() {
  const { employees, isLoading: employeesLoading, addEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { attendance, isLoading: attendanceLoading, addAttendance, updateAttendance, deleteAttendance } = useEmployeeAttendance();
  const toast = useToast();

  const [viewMode, setViewMode] = useState('manage'); // 'manage' | 'table'
  const [searchQuery, setSearchQuery] = useState('');
  const [activePeriod, setActivePeriod] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setSearchQuery('');
    setActivePeriod('');
    setDateFrom('');
    setDateTo('');
  };

  const employeeById = useMemo(() => new Map(employees.map(e => [Number(e.id), e])), [employees]);

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return employees;
    return employees.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.employee_code.toLowerCase().includes(query) ||
      e.nic.toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  const filteredAttendance = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return attendance.filter(row => {
      if (query) {
        const employee = employeeById.get(Number(row.employee_id));
        const matchesName = employee?.name?.toLowerCase().includes(query) || employee?.employee_code?.toLowerCase().includes(query);
        if (!matchesName) return false;
      }
      if ((dateFrom || dateTo) && !isWithinRange(row.attendance_date, dateFrom, dateTo)) return false;
      return true;
    });
  }, [attendance, searchQuery, dateFrom, dateTo, employeeById]);

  const handleSaved = ({ mode, name, employee_code, error }) => {
    if (mode === 'error') {
      toast.error(error);
    } else if (mode === 'add') {
      toast.success(`Successfully registered employee: ${name} (${employee_code})`);
    } else {
      toast.success(`Successfully updated employee: ${name}`);
    }
  };

  const openAddModal = () => {
    setEditingEmployee(null);
    setFormModalOpen(true);
  };

  const openEditModal = (employee) => {
    setEditingEmployee(employee);
    setFormModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteEmployee(deleteTarget.id);
      toast.success(`Deleted employee: ${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete employee");
    } finally {
      setIsDeleting(false);
    }
  };

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
            placeholder="Search by employee name, ID, NIC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Button
          variant="primary"
          onClick={openAddModal}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl"
        >
          <Plus size={16} />
          <span>Add New Employee</span>
        </Button>
      </div>

      {/* Filter Options + View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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

          {(searchQuery || activePeriod || dateFrom || dateTo) && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-navy-600 dark:hover:text-navy-400 transition"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-fit">
          <button
            onClick={() => setViewMode('manage')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'manage' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ClipboardList size={14} />
            <span>Manage Employees</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'table' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Table2 size={14} />
            <span>Employee Table</span>
          </button>
        </div>
      </div>

      {viewMode === 'manage' ? (
        <EmployeeAttendanceGrid
          employees={employees}
          rows={filteredAttendance}
          isLoading={attendanceLoading || employeesLoading}
          addAttendance={addAttendance}
          updateAttendance={updateAttendance}
          deleteAttendance={deleteAttendance}
        />
      ) : (
        <Table
          headers={[
            { key: 'employee_code', label: 'Employee ID' },
            { key: 'name', label: 'Name' },
            { key: 'nic', label: 'NIC' },
            { key: 'phone', label: 'Phone' },
            { key: 'address', label: 'Address' },
            { key: 'job_type', label: 'Job Type' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: 'Actions', sortable: false }
          ]}
          data={filteredEmployees}
          isLoading={employeesLoading}
          emptyMessage="No employee records match your filter criteria."
          renderRow={(employee) => (
            <tr key={employee.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono font-medium text-navy-600 dark:text-navy-400">{employee.employee_code}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-semibold text-slate-900 dark:text-slate-100">{employee.name}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono">{employee.nic}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">{employee.phone || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">{employee.address || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">{employee.job_type || '—'}</td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                <Badge label={employee.status === 'active' ? 'Active' : 'Inactive'} type={employee.status === 'active' ? 'settled' : 'pending'} />
              </td>
              <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(employee)}
                    className="p-1.5 rounded-lg text-navy-600 dark:text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-950/30 transition cursor-pointer"
                    title="Edit Employee"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(employee)}
                    className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                    title="Delete Employee"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          )}
        />
      )}

      {/* Add/Edit Employee Form Modal */}
      <EmployeeFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        editingEmployee={editingEmployee}
        addEmployee={addEmployee}
        updateEmployee={updateEmployee}
        onSaved={handleSaved}
      />

      {/* Delete Employee Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Employee?"
        message={`This will permanently remove ${deleteTarget?.name || 'this employee'} and their attendance history. This action cannot be undone.`}
        isLoading={isDeleting}
      />

    </div>
  );
}
