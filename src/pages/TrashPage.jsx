import { useState } from 'react';
import { useTrash } from '../hooks/useTrash';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RotateCcw, Trash2 } from 'lucide-react';

const TABLE_LABELS = {
  customers: 'Customer',
  sales: 'Sale',
  debts: 'Debt',
  notes: 'Note',
  employees: 'Employee',
  vehicles: 'Vehicle',
  bank_deposits: 'Bank Deposit',
  cheque_records: 'Cheque Record',
  bank_withdrawals: 'Bank Withdrawal',
  cash_receives: 'Cash Receive',
  customer_cube_prices: 'Customer Cube Price',
  employee_attendance: 'Attendance Record',
  vehicle_trips: 'Vehicle Trip',
  transport_trips: 'Transport Trip',
  expense_ledger_rows: 'Expense Ledger Row'
};

function daysRemaining(purgeAt) {
  const ms = new Date(purgeAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function TrashPage() {
  const { items, isLoading, restoreItem, permanentlyDelete } = useTrash();
  const toast = useToast();

  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    setIsBusy(true);
    try {
      await restoreItem(restoreTarget.id);
      toast.success('Item restored successfully');
      setRestoreTarget(null);
    } catch (err) {
      toast.error(err.message || 'Failed to restore item');
    } finally {
      setIsBusy(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsBusy(true);
    try {
      await permanentlyDelete(deleteTarget.id);
      toast.success('Item permanently deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || 'Failed to permanently delete item');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Deleted items stay here for 7 days and can be restored. After that, they're purged permanently.
      </p>

      <Table
        headers={[
          { key: 'entity_table', label: 'Type' },
          { key: 'entity_label', label: 'Item' },
          { key: 'deleted_by', label: 'Deleted By' },
          { key: 'deleted_at', label: 'Deleted At' },
          { key: 'purge_at', label: 'Days Remaining' },
          { key: 'actions', label: 'Actions', sortable: false }
        ]}
        data={items}
        isLoading={isLoading}
        emptyMessage="Trash is empty."
        renderRow={(item) => (
          <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 align-top">
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
              {TABLE_LABELS[item.entity_table] || item.entity_table}
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
              {item.entity_label || item.entity_id}
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 font-semibold text-navy-600 dark:text-navy-400 whitespace-nowrap">
              {item.deleted_by}
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
              {new Date(item.deleted_at).toLocaleString()}
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5 whitespace-nowrap">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${daysRemaining(item.purge_at) <= 1 ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {daysRemaining(item.purge_at)}d left
              </span>
            </td>
            <td className="px-3.5 sm:px-6 py-2.5 sm:py-3.5">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setRestoreTarget(item)}
                  className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition cursor-pointer"
                  title="Restore"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  onClick={() => setDeleteTarget(item)}
                  className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                  title="Delete Permanently"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </td>
          </tr>
        )}
      />

      <ConfirmDialog
        isOpen={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={confirmRestore}
        title="Restore Item?"
        message="This will bring the item back to its original place in the system."
        confirmLabel="Restore"
        variant="primary"
        isLoading={isBusy}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmPermanentDelete}
        title="Delete Permanently?"
        message="This item will be permanently erased and can no longer be recovered."
        confirmLabel="Delete Permanently"
        variant="danger"
        isLoading={isBusy}
      />
    </div>
  );
}
