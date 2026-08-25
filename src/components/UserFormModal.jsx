import React, { useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './FormFields';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const emptyValues = { email: '', username: '', fullName: '', password: '', role: 'user' };

// Password is required (min 6) when adding; optional but still min-6-if-typed
// when editing, matching "New Password (Leave blank to keep current)".
const addSchema = z.object({
  email: z.string().min(1, { message: "Email is required" }).email({ message: "Enter a valid email address" }),
  username: z.string().min(2, { message: "Username must be at least 2 characters" }),
  fullName: z.string().optional(),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  role: z.enum(['user', 'admin'])
});

const editSchema = addSchema.extend({
  password: z.string().refine(val => !val || val.length >= 6, {
    message: "New password must be at least 6 characters, or left blank"
  })
});

export function UserFormModal({ isOpen, onClose, editingUser, addUser, updateUser, onSaved }) {
  const isEdit = !!editingUser;

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(isEdit ? editSchema : addSchema),
    defaultValues: emptyValues
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingUser) {
      reset({
        email: editingUser.email || '',
        username: editingUser.username || '',
        fullName: editingUser.full_name || '',
        password: '',
        role: editingUser.role || 'user'
      });
    } else {
      reset(emptyValues);
    }
  }, [isOpen, editingUser, reset]);

  const onSubmitForm = async (data) => {
    try {
      if (isEdit) {
        await updateUser(editingUser.id, data);
        onSaved({ mode: 'edit', username: data.username });
      } else {
        await addUser(data);
        onSaved({ mode: 'add', username: data.username });
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
      title={isEdit ? "Edit User Account" : "Add New User"}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-3">
        <Input
          label="Email Address (Used to sign in)"
          name="email"
          type="email"
          required
          placeholder="e.g. user@sagacious.com"
          error={errors.email}
          {...register('email')}
        />

        <Input
          label="Username"
          name="username"
          required
          placeholder="e.g. john_silva"
          error={errors.username}
          {...register('username')}
        />

        <Input
          label="Display Name"
          name="fullName"
          placeholder="e.g. John Silva"
          error={errors.fullName}
          {...register('fullName')}
        />

        <Input
          label={isEdit ? "New Password (Leave blank to keep current)" : "Password (min 6 characters)"}
          name="password"
          type="password"
          required={!isEdit}
          placeholder={isEdit ? "Enter new password or leave blank" : "Set secure password"}
          error={errors.password}
          {...register('password')}
        />

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wider block">
            System Role
          </label>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => field.onChange('user')}
                  className={`py-2.5 text-xs font-semibold rounded-xl border transition ${
                    field.value === 'user'
                      ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  User
                </button>
                <button
                  type="button"
                  onClick={() => field.onChange('admin')}
                  className={`py-2.5 text-xs font-semibold rounded-xl border transition ${
                    field.value === 'admin'
                      ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Admin
                </button>
              </div>
            )}
          />
        </div>

        {isEdit && editingUser?.id && (
          <p className="text-[11px] text-slate-400">
            Leaving the password blank keeps this user's current password unchanged.
          </p>
        )}

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
            {isEdit ? "Save Changes" : "Add User"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
