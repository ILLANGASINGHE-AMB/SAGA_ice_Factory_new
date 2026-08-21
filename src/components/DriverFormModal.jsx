import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './FormFields';

const emptyValues = { driver_name: '', phone: '' };

export function DriverFormModal({ isOpen, onClose, addDriver, onSaved }) {
  const [values, setValues] = useState(emptyValues);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValues(emptyValues);
      setError('');
    }
  }, [isOpen]);

  const handleChange = (field) => (e) => {
    setValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const res = await addDriver(values);
      onSaved(res);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to add driver");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Driver" size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Driver Name"
          name="driver_name"
          required
          placeholder="e.g. Kamal Perera"
          value={values.driver_name}
          onChange={handleChange('driver_name')}
        />
        <Input
          label="Phone"
          name="phone"
          placeholder="e.g. 0771234567"
          value={values.phone}
          onChange={handleChange('phone')}
        />

        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}

        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Save Driver
          </Button>
        </div>
      </form>
    </Modal>
  );
}
