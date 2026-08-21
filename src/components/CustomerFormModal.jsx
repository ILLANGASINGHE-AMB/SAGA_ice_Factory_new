import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './FormFields';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const phoneRegex = /^0\d{9}$/;
const customerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  whatsapp_number: z.string().refine(val => !val || phoneRegex.test(val), {
    message: "WhatsApp number must be exactly 10 digits and start with 0 (e.g. 0771234567)"
  }).optional(),
  contact_number: z.string().refine(val => !val || phoneRegex.test(val), {
    message: "Contact number must be exactly 10 digits and start with 0 (e.g. 0771234567)"
  }).optional(),
  address: z.string().optional()
}).refine(data => !!data.whatsapp_number || !!data.contact_number, {
  message: "Provide at least one number (WhatsApp or Contact)",
  path: ['whatsapp_number']
});

const emptyValues = { name: '', whatsapp_number: '', contact_number: '', address: '' };

export function CustomerFormModal({ isOpen, onClose, editingCustomer, addCustomer, updateCustomer, onSaved }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: emptyValues
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingCustomer) {
      reset({
        name: editingCustomer.name,
        whatsapp_number: editingCustomer.whatsapp_number || '',
        contact_number: editingCustomer.contact_number || '',
        address: editingCustomer.address || ''
      });
    } else {
      reset(emptyValues);
    }
  }, [isOpen, editingCustomer, reset]);

  const onSubmitForm = async (data) => {
    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data);
        onSaved({ mode: 'edit', name: data.name });
      } else {
        const res = await addCustomer(data);
        onSaved({ mode: 'add', name: data.name, customer_code: res.customer_code });
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
      title={editingCustomer ? "Edit Customer Record" : "Register New Customer"}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-3">
        <Input
          label="Name"
          name="name"
          required
          placeholder="e.g. Nimal Perera"
          error={errors.name}
          {...register('name')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Whatsapp No"
            name="whatsapp_number"
            placeholder="e.g. 0771234567"
            error={errors.whatsapp_number}
            {...register('whatsapp_number')}
          />

          <Input
            label="Contact No"
            name="contact_number"
            placeholder="e.g. 0771234567"
            error={errors.contact_number}
            {...register('contact_number')}
          />
        </div>

        <Input
          label="Address"
          name="address"
          placeholder="e.g. 45 Galle Rd, Colombo 03"
          error={errors.address}
          {...register('address')}
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
            {editingCustomer ? 'Update Profile' : 'Save Customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
