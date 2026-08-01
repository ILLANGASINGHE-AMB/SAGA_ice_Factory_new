import React, { useState, useMemo } from 'react';
import { useCustomers } from '../hooks/useCustomers';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input, TextArea } from '../components/FormFields';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';

// Zod schema matching System_Functions.md validation rules
const customerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  whatsapp_number: z.string().regex(/^\d{10}$/, { message: "WhatsApp number must be exactly 10 digits (numeric only)" }),
  address: z.string().optional(),
  email: z.string().refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
    message: "Invalid email format"
  }).optional()
});

export function CustomersPage() {
  const { customers, isLoading, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // Confirm Delete Dialog states
  const [deleteId, setDeleteId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // React Hook Form setup
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: '',
      whatsapp_number: '',
      address: '',
      email: ''
    }
  });

  // Open modal for adding a new customer
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    reset({
      name: '',
      whatsapp_number: '',
      address: '',
      email: ''
    });
    setModalOpen(true);
  };

  // Open modal for editing an existing customer
  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    reset({
      name: customer.name,
      whatsapp_number: customer.whatsapp_number,
      address: customer.address || '',
      email: customer.email || ''
    });
    setModalOpen(true);
  };

  // Handle Form Submit (Add / Edit)
  const onSubmitForm = async (data) => {
    setActionLoading(true);
    try {
      if (editingCustomer) {
        // Edit Customer
        await updateCustomer(editingCustomer.id, data);
        toast.success(`Successfully updated customer: ${data.name}`);
      } else {
        // Add Customer
        const res = await addCustomer(data);
        toast.success(`Successfully registered customer: ${data.name} (${res.customer_code})`);
      }
      setModalOpen(false);
      reset();
    } catch (err) {
      toast.error(err.message || "An error occurred");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Customer flow
  const handleOpenDelete = (id) => {
    setDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setActionLoading(true);
    try {
      await deleteCustomer(deleteId);
      toast.success("Customer removed successfully");
      setDeleteConfirmOpen(false);
      setDeleteId(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete customer");
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered customer records based on Search query
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return customers;
    return customers.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.whatsapp_number.includes(query) ||
      c.customer_code.toLowerCase().includes(query)
    );
  }, [customers, searchQuery]);

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
            placeholder="Search by customer name, WhatsApp, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Add customer button */}
        <Button 
          variant="primary" 
          onClick={handleOpenAdd}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl"
        >
          <Plus size={16} />
          <span>Add Customer</span>
        </Button>
      </div>

      {/* Customer Registry Grid */}
      <Table
        headers={[
          { key: 'customer_code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'whatsapp_number', label: 'WhatsApp' },
          { key: 'address', label: 'Address' },
          { key: 'email', label: 'Email' },
          { key: 'actions', label: 'Actions', sortable: false }
        ]}
        data={filteredCustomers}
        isLoading={isLoading}
        emptyMessage="No customer records match your filter criteria."
        renderRow={(customer) => (
          <tr key={customer.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
            <td className="px-6 py-4 font-mono font-medium text-navy-600 dark:text-navy-400">{customer.customer_code}</td>
            <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{customer.name}</td>
            <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">{customer.whatsapp_number}</td>
            <td className="px-6 py-4 text-xs max-w-xs truncate">{customer.address || <span className="text-slate-400">—</span>}</td>
            <td className="px-6 py-4 text-xs font-mono">{customer.email || <span className="text-slate-400">—</span>}</td>
            <td className="px-6 py-4">
              <div className="flex items-center space-x-2">
                {/* Edit & Delete Action Buttons (Admin only, user has View only or hidden) */}
                {isAdmin ? (
                  <>
                    <button
                      onClick={() => handleOpenEdit(customer)}
                      className="p-1 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Edit Customer"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleOpenDelete(customer.id)}
                      className="p-1 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                      title="Delete Customer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">Read Only</span>
                )}
              </div>
            </td>
          </tr>
        )}
      />

      {/* --- Modals & Dialogs --- */}

      {/* Add / Edit Customer Form Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? "Edit Customer Record" : "Register New Customer"}
      >
        <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
          <Input
            label="Full Name"
            name="name"
            required
            placeholder="e.g. Nimal Perera"
            error={errors.name}
            {...register('name')}
          />

          <Input
            label="WhatsApp Number (10 Digits)"
            name="whatsapp_number"
            required
            placeholder="e.g. 0771234567"
            error={errors.whatsapp_number}
            {...register('whatsapp_number')}
          />

          <Input
            label="Email Address"
            name="email"
            type="email"
            placeholder="e.g. nimal@example.com"
            error={errors.email}
            {...register('email')}
          />

          <TextArea
            label="Residential/Business Address"
            name="address"
            placeholder="e.g. 45 Galle Rd, Colombo 03"
            error={errors.address}
            {...register('address')}
          />

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={actionLoading}>
              {editingCustomer ? "Save Changes" : "Register Customer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Remove Customer?"
        message="Deleting this customer will remove them from the system database permanently. Please confirm you want to proceed."
        confirmLabel="Confirm Delete"
        isLoading={actionLoading}
      />

    </div>
  );
}
