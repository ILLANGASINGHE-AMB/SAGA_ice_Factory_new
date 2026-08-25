import { useState } from 'react';
import { useExpenses } from '../hooks/useExpenses';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input, Select } from '../components/FormFields';
import { ExpenseCashBookGrid } from '../components/ExpenseCashBookGrid';
import { ExpenseCategoryView } from '../components/ExpenseCategoryView';
import {
  CircleDollarSign,
  Wallet,
  Flame,
  Hash,
  Tags,
  Plus,
  FolderPlus,
  BookOpen,
  LayoutGrid
} from 'lucide-react';

export function ExpenseLedgerPage() {
  const {
    categories,
    items,
    categoriesWithItems,
    gridRows,
    columnTotals,
    grandTotal,
    categoryViewRows,
    monthlySummary,
    isLoading,
    addCategory,
    addExpenseItem,
    deleteCategory,
    deleteExpenseItem,
    categoryDeletionImpact,
    expenseDeletionImpact,
    reorderCategories,
    reorderExpenseItems,
    saveLedgerRow,
    deleteLedgerRow
  } = useExpenses();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [viewMode, setViewMode] = useState('cashBook'); // 'cashBook' | 'categoryView'

  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expenseName, setExpenseName] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Column deletion. Removing a category or an expense name takes its recorded
  // amounts with it, so the confirm dialog states exactly what will go.
  const [deleteTarget, setDeleteTarget] = useState(null); // { kind, id, name, message }
  const [isDeletingColumn, setIsDeletingColumn] = useState(false);

  const requestDeleteCategory = (category) => {
    const impact = categoryDeletionImpact(category.id);
    const parts = [`Delete the category "${category.name}"?`];
    if (impact.itemCount > 0) {
      parts.push(
        `This also removes ${impact.itemCount} expense ${impact.itemCount === 1 ? 'name' : 'names'} under it` +
        (impact.amountCount > 0
          ? `, along with ${impact.amountCount} recorded ${impact.amountCount === 1 ? 'amount' : 'amounts'} totalling LKR ${impact.amountTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
          : '.')
      );
    }
    parts.push('It can be restored from Trash.');
    setDeleteTarget({ kind: 'category', id: category.id, name: category.name, message: parts.join(' ') });
  };

  const requestDeleteExpenseItem = (item) => {
    const impact = expenseDeletionImpact(item.id);
    const parts = [`Delete the expense "${item.name}"?`];
    if (impact.amountCount > 0) {
      parts.push(
        `This removes ${impact.amountCount} recorded ${impact.amountCount === 1 ? 'amount' : 'amounts'} ` +
        `totalling LKR ${impact.amountTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
      );
    }
    parts.push('It can be restored from Trash.');
    setDeleteTarget({ kind: 'item', id: item.id, name: item.name, message: parts.join(' ') });
  };

  const handleConfirmColumnDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingColumn(true);
    try {
      if (deleteTarget.kind === 'category') {
        await deleteCategory(deleteTarget.id);
        toast.success(`Deleted category: ${deleteTarget.name}`);
      } else {
        await deleteExpenseItem(deleteTarget.id);
        toast.success(`Deleted expense: ${deleteTarget.name}`);
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setIsDeletingColumn(false);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      setIsSubmittingCategory(true);
      const created = await addCategory(categoryName);
      toast.success(`Category ${created.category_code} added`);
      setIsAddCategoryOpen(false);
      setCategoryName('');
    } catch (err) {
      toast.error(err.message || "Failed to add category");
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  const openAddExpense = () => {
    setExpenseCategoryId(categories[0]?.id ? String(categories[0].id) : '');
    setIsAddExpenseOpen(true);
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    try {
      setIsSubmittingExpense(true);
      const created = await addExpenseItem(expenseName, expenseCategoryId);
      toast.success(`Expense ${created.expense_code} added`);
      setIsAddExpenseOpen(false);
      setExpenseName('');
    } catch (err) {
      toast.error(err.message || "Failed to add expense");
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CircleDollarSign className="text-emerald-500" size={24} />
            Expenses
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track factory expense categories and log day-to-day spending in the Cash Book.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 landscape:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Wallet size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Total of Expenses (Month)</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              LKR {monthlySummary.totalThisMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 shrink-0">
            <Flame size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Most Expensive Category (Month)</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              {monthlySummary.mostExpensiveCategory?.name || '—'}
            </h3>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0">
            <Hash size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Total No. of Expenses</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              {items.length}
            </h3>
          </div>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 shrink-0">
            <Tags size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider block truncate">Total No. of Categories</span>
            <h3 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading truncate">
              {categories.length}
            </h3>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setViewMode('cashBook')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              viewMode === 'cashBook'
                ? 'bg-navy-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen size={14} />
            <span>Cash Book</span>
          </button>
          <button
            onClick={() => setViewMode('categoryView')}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              viewMode === 'categoryView'
                ? 'bg-navy-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Category View</span>
          </button>
        </div>

        {viewMode === 'cashBook' && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openAddExpense} className="flex items-center space-x-1.5">
              <Plus size={14} />
              <span>Add Expense</span>
            </Button>
            <Button variant="primary" size="sm" onClick={() => setIsAddCategoryOpen(true)} className="flex items-center space-x-1.5">
              <FolderPlus size={14} />
              <span>Add Category</span>
            </Button>
          </div>
        )}
      </div>

      {viewMode === 'cashBook' ? (
        <ExpenseCashBookGrid
          categoriesWithItems={categoriesWithItems}
          gridRows={gridRows}
          columnTotals={columnTotals}
          grandTotal={grandTotal}
          isLoading={isLoading}
          saveLedgerRow={saveLedgerRow}
          deleteLedgerRow={deleteLedgerRow}
          reorderCategories={reorderCategories}
          reorderExpenseItems={reorderExpenseItems}
          onDeleteCategory={requestDeleteCategory}
          onDeleteExpenseItem={requestDeleteExpenseItem}
          canManageColumns={isAdmin}
        />
      ) : (
        <ExpenseCategoryView
          categories={categories}
          items={items}
          categoryViewRows={categoryViewRows}
          isLoading={isLoading}
        />
      )}

      {/* MODAL: ADD CATEGORY */}
      <Modal
        isOpen={isAddCategoryOpen}
        onClose={() => setIsAddCategoryOpen(false)}
        title="Add Expense Category"
        size="sm"
      >
        <form onSubmit={handleAddCategory} className="space-y-3">
          <Input
            label="Category ID"
            name="category_id_preview"
            value="Generated automatically (e.g. CAT-00001)"
            disabled
          />
          <Input
            label="Category Name"
            name="category_name"
            required
            placeholder="e.g. Travel, Ingredients, Vehicle Expenses"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
          />
          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsAddCategoryOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmittingCategory}>
              {isSubmittingCategory ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: ADD EXPENSE */}
      <Modal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        title="Add Expense"
        size="sm"
      >
        <form onSubmit={handleAddExpense} className="space-y-3">
          <Input
            label="Expense ID"
            name="expense_id_preview"
            value="Generated automatically (e.g. EXP-00001)"
            disabled
          />
          <Input
            label="Expense Name"
            name="expense_name"
            required
            placeholder="e.g. Petrol, Labour Charges"
            value={expenseName}
            onChange={(e) => setExpenseName(e.target.value)}
          />
          <Select
            label="Expense Category"
            name="expense_category"
            required
            value={expenseCategoryId}
            onChange={(e) => setExpenseCategoryId(e.target.value)}
            options={categories.map(c => ({ value: String(c.id), label: c.name }))}
          />
          {categories.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Add a category first before adding expenses.</p>
          )}
          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" type="button" onClick={() => setIsAddExpenseOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmittingExpense || categories.length === 0}>
              {isSubmittingExpense ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM: DELETE CATEGORY / EXPENSE COLUMN */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmColumnDelete}
        title={deleteTarget?.kind === 'category' ? 'Delete Category?' : 'Delete Expense?'}
        message={deleteTarget?.message || ''}
        confirmLabel="Delete"
        isLoading={isDeletingColumn}
      />

    </div>
  );
}
