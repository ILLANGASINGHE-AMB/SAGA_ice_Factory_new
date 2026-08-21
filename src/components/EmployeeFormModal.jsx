import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Select } from './FormFields';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const nicRegex = /^([0-9]{9}[vVxX]|[0-9]{12})$/;
const phoneRegex = /^0\d{9}$/;

const employeeSchema = z.object({
  name: z.string().min(2, { message: "Name is required and must be at least 2 characters" }),
  nic: z.string().regex(nicRegex, {
    message: "Enter a valid Sri Lankan NIC (e.g. 123456789V or 200012345678)"
  }),
  phone: z.string().refine(val => !val || phoneRegex.test(val), {
    message: "Phone number must be exactly 10 digits and start with 0 (e.g. 0771234567)"
  }),
  address: z.string(),
  job_type: z.string(),
  status: z.enum(['active', 'inactive'])
});

const emptyValues = { name: '', nic: '', phone: '', address: '', job_type: '', status: 'active' };

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

export function EmployeeFormModal({ isOpen, onClose, editingEmployee, addEmployee, updateEmployee, onSaved }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(employeeSchema),
    defaultValues: emptyValues
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingEmployee) {
      reset({
        name: editingEmployee.name,
        nic: editingEmployee.nic,
        phone: editingEmployee.phone || '',
        address: editingEmployee.address || '',
        job_type: editingEmployee.job_type || '',
        status: editingEmployee.status || 'active'
      });
    } else {
      reset(emptyValues);
    }
  }, [isOpen, editingEmployee, reset]);

  const onSubmitForm = async (data) => {
    try {
      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, data);
        onSaved({ mode: 'edit', name: data.name });
      } else {
        const res = await addEmployee(data);
        onSaved({ mode: 'add', name: data.name, employee_code: res.employee_code });
      }
      onClose();
    } catch (err) {
      onSaved({ mode: 'error', error: err.message || "An error occurred" });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingEmployee ? "Edit Employee" : "Add New Employee"}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-3">
        <Input
          label="Employee ID"
          name="employee_code"
          value={editingEmployee ? editingEmployee.employee_code : "Auto-generated"}
          disabled
          readOnly
          className="opacity-70"
        />

        <Input
          label="Name"
          name="name"
          required
          placeholder="e.g. Kasun Perera"
          error={errors.name}
          {...register('name')}
        />

        <Input
          label="NIC"
          name="nic"
          required
          placeholder="e.g. 123456789V or 200012345678"
          error={errors.nic}
          {...register('nic')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Phone"
            name="phone"
            placeholder="e.g. 0771234567"
            error={errors.phone}
            {...register('phone')}
          />

          <Input
            label="Job Type"
            name="job_type"
            placeholder="e.g. Machine Operator"
            error={errors.job_type}
            {...register('job_type')}
          />
        </div>

        <Input
          label="Address"
          name="address"
          placeholder="e.g. No. 12, Main Street, Colombo"
          error={errors.address}
          {...register('address')}
        />

        <Select
          label="Status"
          name="status"
          options={STATUS_OPTIONS}
          error={errors.status}
          {...register('status')}
        />

        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
          >
            {editingEmployee ? 'Update Employee' : 'Save Employee'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
