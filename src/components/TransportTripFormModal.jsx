import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Select, TextArea } from './FormFields';
import { DriverFormModal } from './DriverFormModal';
import { UserPlus } from 'lucide-react';

function toLocalDateTimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const emptyValues = {
  vehicle_id: '',
  driver_id: '',
  start_odometer: '',
  start_datetime: toLocalDateTimeInput(new Date()),
  description: ''
};

export function TransportTripFormModal({ isOpen, onClose, vehicles, drivers, trips, addDriver, onSubmit }) {
  const [values, setValues] = useState(emptyValues);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [driverModalOpen, setDriverModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValues({ ...emptyValues, start_datetime: toLocalDateTimeInput(new Date()) });
      setError('');
    }
  }, [isOpen]);

  const vehicleOptions = useMemo(() => [
    { value: '', label: 'Select Vehicle' },
    ...vehicles.map(v => ({ value: String(v.id), label: `${v.vehicle_no} — ${v.vehicle_model}` }))
  ], [vehicles]);

  const driverOptions = useMemo(() => [
    { value: '', label: 'Select Driver' },
    ...drivers.map(d => ({ value: String(d.id), label: d.driver_name }))
  ], [drivers]);

  // Suggest Start KM: last completed trip's end odometer for this vehicle, else the vehicle's initial odometer.
  useEffect(() => {
    if (!values.vehicle_id) return;
    const vehicleId = Number(values.vehicle_id);
    const vehicle = vehicles.find(v => Number(v.id) === vehicleId);
    if (!vehicle) return;

    const lastCompleted = trips
      .filter(t => Number(t.vehicle_id) === vehicleId && t.status === 'completed' && t.end_odometer != null)
      .sort((a, b) => new Date(b.end_datetime) - new Date(a.end_datetime))[0];

    const suggested = lastCompleted ? lastCompleted.end_odometer : vehicle.initial_odometer;
    setValues(prev => ({ ...prev, start_odometer: String(suggested ?? '') }));
  }, [values.vehicle_id, vehicles, trips]);

  const handleChange = (field) => (e) => {
    setValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleDriverAdded = (driver) => {
    setValues(prev => ({ ...prev, driver_id: String(driver.id) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!values.vehicle_id) {
      setError("Please select a Vehicle");
      return;
    }
    if (!values.driver_id) {
      setError("Please select a Driver");
      return;
    }
    const start = Number(values.start_odometer);
    if (values.start_odometer === '' || isNaN(start) || start < 0) {
      setError("Start KM must be a valid non-negative number");
      return;
    }
    if (!values.start_datetime) {
      setError("Start Date and Time is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        vehicle_id: Number(values.vehicle_id),
        driver_id: Number(values.driver_id),
        start_odometer: start,
        start_datetime: values.start_datetime,
        description: values.description
      });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to start trip");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="New Trip" size="md">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Trip ID"
            name="trip_id"
            value="Auto-generated on save"
            disabled
          />

          <Select
            label="Vehicle"
            name="vehicle_id"
            required
            options={vehicleOptions}
            value={values.vehicle_id}
            onChange={handleChange('vehicle_id')}
          />

          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Driver"
                  name="driver_id"
                  required
                  options={driverOptions}
                  value={values.driver_id}
                  onChange={handleChange('driver_id')}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => setDriverModalOpen(true)}
                className="flex items-center space-x-1.5 shrink-0"
                title="Add New Driver"
              >
                <UserPlus size={14} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Start KM"
              name="start_odometer"
              type="number"
              min="0"
              required
              placeholder="e.g. 12000"
              value={values.start_odometer}
              onChange={handleChange('start_odometer')}
            />
            <Input
              label="Start Date and Time"
              name="start_datetime"
              type="datetime-local"
              required
              value={values.start_datetime}
              onChange={handleChange('start_datetime')}
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

      <DriverFormModal
        isOpen={driverModalOpen}
        onClose={() => setDriverModalOpen(false)}
        addDriver={addDriver}
        onSaved={handleDriverAdded}
      />
    </>
  );
}
