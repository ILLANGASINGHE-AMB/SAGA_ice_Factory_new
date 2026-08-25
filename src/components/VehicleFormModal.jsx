import { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Select } from './FormFields';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const vehicleNoRegex = /^[A-Za-z]{2,3}\d{4}$/;

const vehicleSchema = z.object({
  vehicle_no: z.string().regex(vehicleNoRegex, {
    message: "Format must be xx0000 or xxx0000 (e.g. AB1234 or ABC1234)"
  }),
  vehicle_model: z.string().min(1, { message: "Vehicle Model is required" }),
  vehicle_type: z.enum(['lorry', 'pickup'], { errorMap: () => ({ message: "Select a Vehicle Type" }) }),
  initial_odometer: z.string().refine(val => val !== '' && !isNaN(Number(val)) && Number(val) >= 0, {
    message: "Initial Odometer must be a valid non-negative number"
  })
});

const emptyValues = { vehicle_no: '', vehicle_model: '', vehicle_type: 'lorry', initial_odometer: '' };

const VEHICLE_TYPE_OPTIONS = [
  { value: 'lorry', label: 'Lorry' },
  { value: 'pickup', label: 'Pickup' }
];

export function VehicleFormModal({ isOpen, onClose, editingVehicle, addVehicle, updateVehicle, onSaved }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(vehicleSchema),
    defaultValues: emptyValues
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingVehicle) {
      reset({
        vehicle_no: editingVehicle.vehicle_no,
        vehicle_model: editingVehicle.vehicle_model,
        vehicle_type: editingVehicle.vehicle_type,
        initial_odometer: String(editingVehicle.initial_odometer ?? '')
      });
    } else {
      reset(emptyValues);
    }
  }, [isOpen, editingVehicle, reset]);

  const onSubmitForm = async (data) => {
    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, {
          ...data,
          initial_odometer: String(editingVehicle.initial_odometer ?? '')
        });
        onSaved({ mode: 'edit', vehicle_no: data.vehicle_no.toUpperCase() });
      } else {
        const res = await addVehicle(data);
        onSaved({ mode: 'add', vehicle_no: res.vehicle_no });
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
      title={editingVehicle ? "Edit Vehicle Record" : "Add New Vehicle"}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-3">
        <Input
          label="Vehicle No"
          name="vehicle_no"
          required
          placeholder="e.g. ABC1234 or AB1234"
          error={errors.vehicle_no}
          {...register('vehicle_no')}
        />

        <Input
          label="Vehicle Model"
          name="vehicle_model"
          required
          placeholder="e.g. Tata 1613"
          error={errors.vehicle_model}
          {...register('vehicle_model')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Vehicle Type"
            name="vehicle_type"
            required
            options={VEHICLE_TYPE_OPTIONS}
            error={errors.vehicle_type}
            {...register('vehicle_type')}
          />

          {/* Initial Odometer is the vehicle's opening reading — every trip's
              distance is measured from it, so editing it after the fact would
              silently rewrite the vehicle's mileage history. It's locked once
              the vehicle exists and only settable at registration. */}
          {editingVehicle ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Initial Odometer
              </label>
              <div
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-mono cursor-not-allowed"
                title="Locked — the opening reading can't change once the vehicle is registered"
              >
                {Number(editingVehicle.initial_odometer ?? 0).toLocaleString()} km
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Locked after registration — trip distances are measured from this reading.
              </p>
            </div>
          ) : (
            <Input
              label="Initial Odometer"
              name="initial_odometer"
              type="number"
              min="0"
              required
              placeholder="e.g. 12000"
              error={errors.initial_odometer}
              {...register('initial_odometer')}
            />
          )}
        </div>

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
            {editingVehicle ? 'Update Vehicle' : 'Save Vehicle'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
