import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Select, TextArea } from './FormFields';
import { todayStr } from '../utils/date';

const buildEmptyValues = () => ({
  trip_date: todayStr(),
  employee_id: '',
  start_odometer: '',
  end_odometer: '',
  description: ''
});

// The caller remounts this with a `key` when it opens, so Start Odometer is
// pre-filled at mount rather than patched in by an effect after a first render
// showing the previous vehicle's reading.
export function VehicleTripFormModal({ isOpen, onClose, onSubmit, employees = [], defaultStartOdometer = '' }) {
  // Pre-fill Start Odometer with where the vehicle was last left, so the
  // operator only has to enter the reading at the end of the trip.
  const [values, setValues] = useState(() => ({
    ...buildEmptyValues(),
    start_odometer: String(defaultStartOdometer ?? '')
  }));
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field) => (e) => {
    setValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!values.trip_date) {
      setError("Trip date is required");
      return;
    }
    if (!values.employee_id) {
      setError("Select the driver for this trip");
      return;
    }
    const start = Number(values.start_odometer);
    const end = Number(values.end_odometer);
    if (values.start_odometer === '' || isNaN(start) || start < 0) {
      setError("Start Odometer must be a valid non-negative number");
      return;
    }
    if (values.end_odometer === '' || isNaN(end) || end < 0) {
      setError("End Odometer must be a valid non-negative number");
      return;
    }
    if (end < start) {
      setError("End Odometer cannot be less than Start Odometer");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to record trip");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Trip Record" size="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Date"
            name="trip_date"
            type="date"
            required
            value={values.trip_date}
            onChange={handleChange('trip_date')}
          />
          <Select
            label="Driver"
            name="employee_id"
            required
            value={values.employee_id}
            onChange={handleChange('employee_id')}
            options={[
              { value: '', label: employees.length ? 'Select a driver...' : 'No employees registered' },
              ...employees.map(e => ({ value: String(e.id), label: `${e.employee_code} — ${e.name}` }))
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Start Odometer"
            name="start_odometer"
            type="number"
            min="0"
            required
            placeholder="e.g. 12000"
            value={values.start_odometer}
            onChange={handleChange('start_odometer')}
          />
          <Input
            label="End Odometer"
            name="end_odometer"
            type="number"
            min="0"
            required
            placeholder="e.g. 12150"
            value={values.end_odometer}
            onChange={handleChange('end_odometer')}
          />
        </div>

        <TextArea
          label="Description"
          name="description"
          placeholder="e.g. Delivery to Colombo 03"
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
            Save Trip
          </Button>
        </div>
      </form>
    </Modal>
  );
}
