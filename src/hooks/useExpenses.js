import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { logActivity, currentActor } from '../lib/activityLog';

export function useExpenses() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [amounts, setAmounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [
        { data: cats, error: catsErr },
        { data: its, error: itsErr },
        { data: rows, error: rowsErr },
        { data: amts, error: amtsErr }
      ] = await Promise.all([
        supabase.from('expense_categories').select('*').order('position', { ascending: true }),
        supabase.from('expense_items').select('*').order('position', { ascending: true }),
        supabase.from('expense_ledger_rows').select('*').order('entry_date', { ascending: false }),
        supabase.from('expense_amounts').select('*')
      ]);

      if (catsErr || itsErr || rowsErr || amtsErr) {
        throw catsErr || itsErr || rowsErr || amtsErr;
      }

      setCategories(cats || []);
      setItems(its || []);
      setLedgerRows(rows || []);
      setAmounts(amts || []);
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchAll = coalesceRefetch(fetchAll);
    fetchAll();

    const channel = supabase
      .channel(`expenses-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_categories' }, refetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_items' }, refetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_ledger_rows' }, refetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_amounts' }, refetchAll)
      .subscribe();

    return () => {
      refetchAll.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const addCategory = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error("Category name is required");

    const { data: category_code, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'expense_category',
      p_prefix: 'CAT'
    });
    if (codeErr || !category_code) {
      throw new Error("Unable to generate a category code. Please try again.");
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('expense_categories')
      .insert([{ category_code, name: trimmed, position: categories.length }])
      .select('*')
      .single();
    if (insertErr) throw new Error(insertErr.message || "Failed to add category");
    logActivity({ action: 'create', entityType: 'expense_category', entityId: inserted.id, entityLabel: category_code, description: `Added expense category ${trimmed}` });
    return inserted;
  };

  const addExpenseItem = async (name, categoryId) => {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error("Expense name is required");
    if (!categoryId) throw new Error("Select a category for this expense");

    const { data: expense_code, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'expense_item',
      p_prefix: 'EXP'
    });
    if (codeErr || !expense_code) {
      throw new Error("Unable to generate an expense code. Please try again.");
    }

    const positionInCategory = items.filter(i => i.category_id === Number(categoryId)).length;

    const { data: inserted, error: insertErr } = await supabase
      .from('expense_items')
      .insert([{ expense_code, name: trimmed, category_id: Number(categoryId), position: positionInCategory }])
      .select('*')
      .single();
    if (insertErr) throw new Error(insertErr.message || "Failed to add expense");
    logActivity({ action: 'create', entityType: 'expense_item', entityId: inserted.id, entityLabel: expense_code, description: `Added expense item ${trimmed}` });
    return inserted;
  };

  // Deleting a category takes its expense columns with it (FK cascade) and,
  // through them, every amount recorded against those columns. That's a lot of
  // history to lose by accident, so the caller is told exactly how much is at
  // stake first — see `categoryDeletionImpact` / `expenseDeletionImpact` below,
  // which the confirm dialog quotes back to the user.
  const categoryDeletionImpact = (categoryId) => {
    const itemIds = items.filter(i => Number(i.category_id) === Number(categoryId)).map(i => i.id);
    const affected = amounts.filter(a => itemIds.includes(Number(a.expense_item_id)));
    return {
      itemCount: itemIds.length,
      amountCount: affected.length,
      amountTotal: affected.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    };
  };

  const expenseDeletionImpact = (itemId) => {
    const affected = amounts.filter(a => Number(a.expense_item_id) === Number(itemId));
    return {
      amountCount: affected.length,
      amountTotal: affected.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    };
  };

  const deleteCategory = async (categoryId) => {
    const category = categories.find(c => Number(c.id) === Number(categoryId));
    if (!category) throw new Error("Category not found");

    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'expense_categories',
      p_id: categoryId,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message || "Failed to delete category");
    logActivity({ action: 'delete', entityType: 'expense_category', entityId: categoryId, entityLabel: category.category_code, description: `Deleted expense category ${category.name}` });
  };

  const deleteExpenseItem = async (itemId) => {
    const item = items.find(i => Number(i.id) === Number(itemId));
    if (!item) throw new Error("Expense not found");

    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'expense_items',
      p_id: itemId,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message || "Failed to delete expense");
    logActivity({ action: 'delete', entityType: 'expense_item', entityId: itemId, entityLabel: item.expense_code, description: `Deleted expense ${item.name}` });
  };

  // Column reordering swaps the `position` of the two categories/items being
  // dragged rather than reindexing the whole list — cheap (2 updates) and
  // avoids racing a full reorder against a concurrent add from another tab.
  const reorderCategories = async (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const dragged = categories.find(c => c.id === draggedId);
    const target = categories.find(c => c.id === targetId);
    if (!dragged || !target) return;

    const { error: e1 } = await supabase.from('expense_categories').update({ position: target.position }).eq('id', dragged.id);
    const { error: e2 } = await supabase.from('expense_categories').update({ position: dragged.position }).eq('id', target.id);
    if (e1 || e2) throw new Error("Failed to reorder categories");
  };

  // Expense (sub-column) reordering is scoped to stay inside its own
  // category, per the spec — a drop across categories is silently ignored.
  const reorderExpenseItems = async (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const dragged = items.find(i => i.id === draggedId);
    const target = items.find(i => i.id === targetId);
    if (!dragged || !target) return;
    if (dragged.category_id !== target.category_id) return;

    const { error: e1 } = await supabase.from('expense_items').update({ position: target.position }).eq('id', dragged.id);
    const { error: e2 } = await supabase.from('expense_items').update({ position: dragged.position }).eq('id', target.id);
    if (e1 || e2) throw new Error("Failed to reorder expenses");
  };

  // Saves one Cash Book row: upserts the Date/Description row, then upserts
  // every changed cell amount for it. `amounts` is { [expense_item_id]: value }.
  const saveLedgerRow = async ({ id, entry_date, description, amounts: rowAmounts, created_by = 'Admin' }) => {
    if (!entry_date) throw new Error("Date is required");

    let rowId = id;
    const isNew = !id || String(id).startsWith('temp-');

    if (isNew) {
      const { data: inserted, error: insertErr } = await supabase
        .from('expense_ledger_rows')
        .insert([{ entry_date, description: description || '', created_by }])
        .select('*')
        .single();
      if (insertErr) throw new Error(insertErr.message || "Failed to save row");
      rowId = inserted.id;
    } else {
      const { error: updateErr } = await supabase
        .from('expense_ledger_rows')
        .update({ entry_date, description: description || '' })
        .eq('id', id);
      if (updateErr) throw new Error(updateErr.message || "Failed to save row");
    }

    for (const [expenseItemId, rawAmount] of Object.entries(rowAmounts || {})) {
      const amount = parseFloat(rawAmount);
      const { error: amtErr } = await supabase
        .from('expense_amounts')
        .upsert(
          { ledger_row_id: rowId, expense_item_id: Number(expenseItemId), amount: isNaN(amount) ? 0 : amount },
          { onConflict: 'ledger_row_id,expense_item_id' }
        );
      if (amtErr) throw new Error(amtErr.message || "Failed to save amount");
    }

    logActivity({ action: isNew ? 'create' : 'update', entityType: 'expense_ledger_row', entityId: rowId, description: `${isNew ? 'Added' : 'Updated'} expense ledger row for ${entry_date}`, performedBy: created_by });

    return rowId;
  };

  const deleteLedgerRow = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'expense_ledger_rows',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message || "Failed to delete row");
  };

  const categoriesWithItems = useMemo(() => {
    return categories.map(cat => ({
      ...cat,
      items: items.filter(i => i.category_id === cat.id).sort((a, b) => a.position - b.position)
    }));
  }, [categories, items]);

  const amountsByRow = useMemo(() => {
    const map = new Map();
    for (const a of amounts) {
      if (!map.has(a.ledger_row_id)) map.set(a.ledger_row_id, new Map());
      map.get(a.ledger_row_id).set(a.expense_item_id, Number(a.amount));
    }
    return map;
  }, [amounts]);

  const gridRows = useMemo(() => {
    return ledgerRows.map(row => {
      const rowAmounts = amountsByRow.get(row.id) || new Map();
      const total = Array.from(rowAmounts.values()).reduce((sum, v) => sum + v, 0);
      return { ...row, amounts: rowAmounts, total };
    });
  }, [ledgerRows, amountsByRow]);

  const columnTotals = useMemo(() => {
    const totals = new Map();
    for (const item of items) totals.set(item.id, 0);
    for (const a of amounts) {
      totals.set(a.expense_item_id, (totals.get(a.expense_item_id) || 0) + Number(a.amount));
    }
    return totals;
  }, [items, amounts]);

  const grandTotal = useMemo(
    () => amounts.reduce((sum, a) => sum + Number(a.amount), 0),
    [amounts]
  );

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const ledgerRowById = useMemo(() => new Map(ledgerRows.map(r => [r.id, r])), [ledgerRows]);

  // Category View is a flat projection of the same cell data used by the
  // Cash Book grid — only cells with a logged amount become a row.
  const categoryViewRows = useMemo(() => {
    return amounts
      .filter(a => Number(a.amount) > 0)
      .map(a => {
        const item = itemById.get(a.expense_item_id);
        const category = item ? categoryById.get(item.category_id) : null;
        const row = ledgerRowById.get(a.ledger_row_id);
        return {
          id: a.id,
          expense_code: item?.expense_code || '—',
          category_id: category?.id ?? null,
          category_name: category?.name || '—',
          expense_item_id: item?.id ?? null,
          expense_name: item?.name || '—',
          entry_date: row?.entry_date || null,
          description: row?.description || '',
          amount: Number(a.amount)
        };
      })
      .sort((x, y) => new Date(y.entry_date) - new Date(x.entry_date));
  }, [amounts, itemById, categoryById, ledgerRowById]);

  const monthlySummary = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let totalThisMonth = 0;
    const categoryTotalsThisMonth = new Map();

    for (const a of amounts) {
      const row = ledgerRowById.get(a.ledger_row_id);
      if (!row?.entry_date) continue;
      const d = new Date(`${row.entry_date}T00:00:00`);
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) continue;

      const amt = Number(a.amount);
      totalThisMonth += amt;

      const item = itemById.get(a.expense_item_id);
      if (item) {
        categoryTotalsThisMonth.set(item.category_id, (categoryTotalsThisMonth.get(item.category_id) || 0) + amt);
      }
    }

    let mostExpensiveCategory = null;
    let mostExpensiveCategoryAmount = 0;
    for (const [catId, amt] of categoryTotalsThisMonth.entries()) {
      if (amt > mostExpensiveCategoryAmount) {
        mostExpensiveCategoryAmount = amt;
        mostExpensiveCategory = categoryById.get(catId) || null;
      }
    }

    return { totalThisMonth, mostExpensiveCategory, mostExpensiveCategoryAmount };
  }, [amounts, ledgerRowById, itemById, categoryById]);

  return {
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
  };
}
