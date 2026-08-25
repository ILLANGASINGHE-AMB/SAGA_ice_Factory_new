import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, TextArea } from './FormFields';

function toLocalDateTimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const emptyValues = { end_odometer: '', end_datetime: toLocalDateTimeInput(new Date()), description: '' };

export function EndTripModal({ isOpen, onClose, trip, onSubmit }) {
  const [values, setValues] = useState(emptyValues);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValues({ ...emptyValues, end_datetime: toLocalDateTimeInput(new Date()) });
      setError('');
    }
  }, [isOpen, trip]);

  const handleChange = (field) => (e) => {
    setValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const end = Number(values.end_odometer);
    if (values.end_odometer === '' || isNaN(end) || end < 0) {
      setError("Final KM must be a valid non-negative number");
      return;
    }
    if (trip && end <= Number(trip.start_odometer)) {
      setError(`Final KM must be greater than the Start KM (${Number(trip.start_odometer).toLocaleString()})`);
      return;
    }
    if (!values.end_datetime) {
      setError("End Date and Time is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(trip.id, values, trip.start_odometer);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to end trip");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="End Trip" size="sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          label="Final KM"
          name="end_odometer"
          type="number"
          min="0"
          required
          placeholder="e.g. 12150"
          value={values.end_odometer}
          onChange={handleChange('end_odometer')}
        />
        <Input
          label="End Date and Time"
          name="end_datetime"
          type="datetime-local"
          required
          value={values.end_datetime}
          onChange={handleChange('end_datetime')}
        />
        <TextArea
          label="Description"
          name="description"
          placeholder="Optional notes"
          value={values.description}
          onChange={handleChange('description')}
        />

        {error && (
          <p className="text-xs text-red-500 font-medium">{error}</p>
        )}

        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            End Trip
          </Button>
        </div>
      </form>
    </Modal>
  );
}
