import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useSales } from './useSales';

const INITIAL_EXPENSES = [
  {
    id: 1,
    expense_code: 'EXP-001-26',
    category: 'electricity',
    description: 'Monthly Industrial Power Bill - CEB',
    amount: 45000.00,
    payment_method: 'bank_transfer',
    expense_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    created_by: 'Admin'
  },
  {
    id: 2,
    expense_code: 'EXP-002-26',
    category: 'diesel',
    description: 'Bulk Diesel Refill for Generator',
    amount: 15000.00,
    payment_method: 'cash',
    expense_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    created_by: 'Operator'
  },
  {
    id: 3,
    expense_code: 'EXP-003-26',
    category: 'salaries',
    description: 'Plant Staff Weekly Wages',
    amount: 32000.00,
    payment_method: 'bank_transfer',
    expense_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    created_by: 'Admin'
  },
  {
    id: 4,
    expense_code: 'EXP-004-26',
    category: 'packaging',
    description: 'Heavy Duty Ice Bag Rolls (5000 units)',
    amount: 18500.00,
    payment_method: 'cheque',
    expense_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    created_by: 'Admin'
  }
];

export function useExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const { sales } = useSales();

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from('operating_expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      // A genuinely empty table (data === [], no error) is valid data — e.g.
      // right after deleting the last expense — and must not be treated the
      // same as a fetch failure, or the stale localStorage cache (from
      // before the deletion) gets used forever and the "deleted" expense
      // permanently reappears in the UI.
      if (error || !data) {
        const saved = localStorage.getItem('saga_operating_expenses');
        setExpenses(saved ? JSON.parse(saved) : INITIAL_EXPENSES);
      } else {
        setExpenses(data);
        localStorage.setItem('saga_operating_expenses', JSON.stringify(data));
      }
    } catch (err) {
      console.warn("Using fallback local operating expenses:", err);
      const saved = localStorage.getItem('saga_operating_expenses');
      setExpenses(saved ? JSON.parse(saved) : INITIAL_EXPENSES);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();

    const channel = supabase
      .channel(`operating_expenses-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operating_expenses' }, () => fetchExpenses())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addExpense = async ({
    category,
    description,
    amount,
    payment_method = 'cash',
    created_by = 'Admin'
  }) => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) throw new Error("Amount must be a positive number");
    if (!description) throw new Error("Description is required");

    // Atomic sequential code (mirrors sale_code/customer_code/settlement
    // codes). The previous 900-value random suffix had a real chance of
    // colliding with an existing expense_code (unique constraint), which
    // used to fail the insert silently — see the insert-error handling below.
    const { data: expense_code, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'expense',
      p_prefix: 'EXP'
    });

    if (codeErr || !expense_code) {
      throw new Error("Unable to generate an expense code. Please try again.");
    }

    const expenseData = {
      expense_code,
      category,
      description,
      amount: val,
      payment_method,
      expense_date: new Date().toISOString(),
      created_by
    };

    // A failed insert must be surfaced as an error, not silently replaced
    // with a client-only fake record that vanishes on the next refetch while
    // the UI already reported success.
    const { data: inserted, error: insertErr } = await supabase
      .from('operating_expenses')
      .insert([expenseData])
      .select('*')
      .single();

    if (insertErr) {
      throw new Error(insertErr.message || "Failed to save expense");
    }

    const updated = [inserted, ...expenses];
    setExpenses(updated);
    localStorage.setItem('saga_operating_expenses', JSON.stringify(updated));
    return inserted;
  };

  const deleteExpense = async (id) => {
    // Supabase delete calls resolve with { error } rather than throwing on
    // RLS denial — only checking network-layer exceptions let local state
    // drop the row even when the server never actually deleted it, so the
    // "removed" toast would be shown right before a later refetch brings
    // the row back with no explanation.
    const { error } = await supabase.from('operating_expenses').delete().eq('id', id);
    if (error) {
      throw new Error(error.message || "Failed to delete expense");
    }
    const updated = expenses.filter(item => item.id !== id);
    setExpenses(updated);
    localStorage.setItem('saga_operating_expenses', JSON.stringify(updated));
  };

  // Derive P&L financial metrics
  const pnlMetrics = useMemo(() => {
    // 1. Total Sales Revenue
    const totalSalesRevenue = sales.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);

    // 2. Operating Expenses sum
    const totalOperatingExpenses = expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    // 3. Combined Operational Costs
    const totalCosts = totalOperatingExpenses;

    // 4. Net Profit
    const netProfit = totalSalesRevenue - totalCosts;

    // 5. Net Profit Margin (%)
    const netProfitMargin = totalSalesRevenue > 0 ? ((netProfit / totalSalesRevenue) * 100).toFixed(1) : 0;

    // Expense breakdown by category
    const categoryBreakdown = expenses.reduce((acc, curr) => {
      const cat = curr.category || 'other';
      acc[cat] = (acc[cat] || 0) + parseFloat(curr.amount || 0);
      return acc;
    }, {});

    return {
      totalSalesRevenue,
      totalOperatingExpenses,
      totalCosts,
      netProfit,
      netProfitMargin,
      categoryBreakdown
    };
  }, [sales, expenses]);

  return {
    expenses,
    isLoading,
    addExpense,
    deleteExpense,
    pnlMetrics,
    refreshExpenses: fetchExpenses
  };
}
