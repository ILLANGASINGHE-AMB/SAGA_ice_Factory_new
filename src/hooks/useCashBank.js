import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const toLocalDateStr = (d) => {
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Cash & Bank Management runs as a live running ledger (not day-scoped like
// the old daily_manager_reports JSONB blobs) — every card total is a
// cumulative balance derived from full history across the 4 ledger tables
// plus cash sales / debt settlements.
export function useCashBank() {
  const [sales, setSales] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [cashReceives, setCashReceives] = useState([]);
  const [bankDeposits, setBankDeposits] = useState([]);
  const [chequeRecords, setChequeRecords] = useState([]);
  const [bankWithdrawals, setBankWithdrawals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [
        { data: salesData, error: salesErr },
        { data: settlementsData, error: settlementsErr },
        { data: receivesData, error: receivesErr },
        { data: depositsData, error: depositsErr },
        { data: chequesData, error: chequesErr },
        { data: withdrawalsData, error: withdrawalsErr }
      ] = await Promise.all([
        supabase.from('sales').select('total_amount, payment_type, sale_date').eq('payment_type', 'cash'),
        supabase.from('debt_settlements').select('amount_paid, settlement_date'),
        supabase.from('cash_receives').select('*').order('received_at', { ascending: false }),
        supabase.from('bank_deposits').select('*').order('deposited_at', { ascending: false }),
        supabase.from('cheque_records').select('*').order('received_at', { ascending: false }),
        supabase.from('bank_withdrawals').select('*').order('withdrawn_at', { ascending: false })
      ]);

      if (salesErr || settlementsErr || receivesErr || depositsErr || chequesErr || withdrawalsErr) {
        throw salesErr || settlementsErr || receivesErr || depositsErr || chequesErr || withdrawalsErr;
      }

      setSales(salesData || []);
      setSettlements(settlementsData || []);
      setCashReceives(receivesData || []);
      setBankDeposits(depositsData || []);
      setChequeRecords(chequesData || []);
      setBankWithdrawals(withdrawalsData || []);
    } catch (err) {
      console.error("Failed to fetch cash & bank data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel(`cash-bank-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_settlements' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_receives' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_deposits' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cheque_records' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_withdrawals' }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const cashSalesTotal = useMemo(
    () => sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
    [sales]
  );

  const debtSettlementsTotal = useMemo(
    () => settlements.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0),
    [settlements]
  );

  const cashReceivesTotal = useMemo(
    () => cashReceives.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [cashReceives]
  );

  // Only cash physically banked (sales/other cash) leaves the till — a
  // "cheques already deposited" bank deposit never touched cash on hand.
  const cashDepositedTotal = useMemo(
    () => bankDeposits
      .filter(d => d.cash_method !== 'cheques')
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [bankDeposits]
  );

  const bankDepositsTotal = useMemo(
    () => bankDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [bankDeposits]
  );

  const bankWithdrawalsTotal = useMemo(
    () => bankWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
    [bankWithdrawals]
  );

  const chequesPending = useMemo(
    () => chequeRecords.filter(c => c.status === 'pending'),
    [chequeRecords]
  );

  const chequesPendingTotal = useMemo(
    () => chequesPending.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [chequesPending]
  );

  // A Section 02 deposit made via the per-cheque "Deposit" button is already
  // linked to that cheque_records row (deposit_id), so it's already reflected
  // by chequesPendingTotal excluding that now-deposited cheque. A deposit made
  // instead through the general Section 02 form with method 'cheques' has no
  // linked cheque record — it still represents cheques-on-hand being banked,
  // so it must reduce the Hand Cheques card by that amount directly.
  const linkedChequeDepositIds = useMemo(
    () => new Set(chequeRecords.filter(c => c.deposit_id != null).map(c => c.deposit_id)),
    [chequeRecords]
  );

  const unlinkedChequeDepositsTotal = useMemo(
    () => bankDeposits
      .filter(d => d.cash_method === 'cheques' && !linkedChequeDepositIds.has(d.id))
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [bankDeposits, linkedChequeDepositIds]
  );

  const handChequesTotal = useMemo(
    () => Math.max(0, chequesPendingTotal - unlinkedChequeDepositsTotal),
    [chequesPendingTotal, unlinkedChequeDepositsTotal]
  );

  const cashBalance = useMemo(
    () => Math.max(0, cashSalesTotal + debtSettlementsTotal + cashReceivesTotal - cashDepositedTotal),
    [cashSalesTotal, debtSettlementsTotal, cashReceivesTotal, cashDepositedTotal]
  );

  const bankBalance = useMemo(
    () => bankDepositsTotal - bankWithdrawalsTotal,
    [bankDepositsTotal, bankWithdrawalsTotal]
  );

  // Per-bank available balance, used to populate & validate Section 04's
  // "Select Bank to Withdraw From" — a withdrawal can't exceed what was
  // actually deposited (minus already withdrawn) under that bank name.
  const bankBalancesByName = useMemo(() => {
    const map = new Map();
    for (const d of bankDeposits) {
      const key = (d.bank_name || '').trim() || 'Unspecified';
      map.set(key, (map.get(key) || 0) + (Number(d.amount) || 0));
    }
    for (const w of bankWithdrawals) {
      const key = (w.bank_name || '').trim() || 'Unspecified';
      map.set(key, (map.get(key) || 0) - (Number(w.amount) || 0));
    }
    return Array.from(map.entries())
      .map(([bankName, balance]) => ({ bankName, balance }))
      .sort((a, b) => b.balance - a.balance);
  }, [bankDeposits, bankWithdrawals]);

  const todayStr = toLocalDateStr(new Date());
  const bankDepositedToday = useMemo(
    () => bankDeposits.filter(d => toLocalDateStr(d.deposited_at) === todayStr).reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [bankDeposits, todayStr]
  );
  const cashDepositedToday = useMemo(
    () => bankDeposits.filter(d => d.cash_method !== 'cheques' && toLocalDateStr(d.deposited_at) === todayStr).reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    [bankDeposits, todayStr]
  );

  // Keep the Daily Manager Report / PDF (which reads its own
  // daily_manager_reports snapshot columns for "today") populated with
  // sensible defaults, without touching that page's own independent save flow.
  useEffect(() => {
    if (isLoading) return;
    supabase.from('daily_manager_reports').upsert({
      report_date: todayStr,
      cash_on_hand: cashBalance,
      cash_on_hand_confirmed: true,
      bank_deposit_amount: bankBalance,
      bank_deposit_today: bankDepositedToday,
      cash_deposited_today: cashDepositedToday,
      cheques_on_hand: handChequesTotal
    }, { onConflict: 'report_date' }).then(({ error }) => {
      if (error) console.warn("Failed to sync Cash & Bank snapshot to daily_manager_reports:", error.message);
    });
  }, [isLoading, todayStr, cashBalance, bankBalance, bankDepositedToday, cashDepositedToday, handChequesTotal]);

  const addCashReceive = async ({ amount, receiveType, receivedAt, createdBy }) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid amount");
    if (!['head_office', 'other'].includes(receiveType)) throw new Error("Please select a receive description");

    const { error } = await supabase.from('cash_receives').insert([{
      amount: amt,
      receive_type: receiveType,
      received_at: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
      created_by: createdBy || 'Admin'
    }]);
    if (error) throw new Error(error.message || "Failed to save cash receive");
  };

  const addBankDeposit = async ({ amount, cashMethod, bankName, createdBy }) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid deposit amount");
    if (!['sales', 'other', 'cheques'].includes(cashMethod)) throw new Error("Please select a cash method");
    if (cashMethod !== 'cheques' && amt > cashBalance) {
      throw new Error(`Deposit cannot exceed current Cash Balance (LKR ${cashBalance.toLocaleString()}).`);
    }

    const { error } = await supabase.from('bank_deposits').insert([{
      amount: amt,
      cash_method: cashMethod,
      bank_name: bankName || null,
      created_by: createdBy || 'Admin'
    }]);
    if (error) throw new Error(error.message || "Failed to save bank deposit");
  };

  const deleteBankDeposit = async (id) => {
    const { error } = await supabase.from('bank_deposits').delete().eq('id', id);
    if (error) throw new Error(error.message || "Failed to delete deposit record");
  };

  const addChequeRecord = async ({ chequeNo, bankName, amount, payerName, createdBy }) => {
    const amt = parseFloat(amount);
    if (!chequeNo) throw new Error("Please enter the cheque number");
    if (!bankName) throw new Error("Please enter the bank name");
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid amount");
    if (!payerName) throw new Error("Please enter the customer/payer name");

    const { error } = await supabase.from('cheque_records').insert([{
      cheque_no: chequeNo,
      bank_name: bankName,
      amount: amt,
      payer_name: payerName,
      created_by: createdBy || 'Admin'
    }]);
    if (error) throw new Error(error.message || "Failed to save cheque record");
  };

  // Depositing a pending cheque is the "Cash received from Cheques (already
  // deposited)" Section 02 method applied to one specific cheque — it both
  // creates the bank deposit and closes out the cheque record.
  const depositChequeRecord = async (chequeId) => {
    const cheque = chequeRecords.find(c => c.id === chequeId);
    if (!cheque || cheque.status !== 'pending') return;

    const { data: deposit, error: depositErr } = await supabase
      .from('bank_deposits')
      .insert([{ amount: cheque.amount, cash_method: 'cheques', bank_name: cheque.bank_name, created_by: 'Admin' }])
      .select('*')
      .single();
    if (depositErr) throw new Error(depositErr.message || "Failed to deposit cheque");

    const { error: updateErr } = await supabase
      .from('cheque_records')
      .update({ status: 'deposited', deposited_at: new Date().toISOString(), deposit_id: deposit.id })
      .eq('id', chequeId);
    if (updateErr) throw new Error(updateErr.message || "Failed to update cheque status");
  };

  const deleteChequeRecord = async (id) => {
    const { error } = await supabase.from('cheque_records').delete().eq('id', id);
    if (error) throw new Error(error.message || "Failed to delete cheque record");
  };

  const addWithdrawal = async ({ amount, bankName, purpose, createdBy }) => {
    const amt = parseFloat(amount);
    if (!bankName) throw new Error("Please select the bank to withdraw from");
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid withdrawal amount");
    if (!purpose) throw new Error("Please enter the purpose of withdrawing");

    const available = bankBalancesByName.find(b => b.bankName === bankName)?.balance || 0;
    if (amt > available) {
      throw new Error(`Withdrawal cannot exceed the available balance for ${bankName} (LKR ${available.toLocaleString()}).`);
    }

    const { error } = await supabase.from('bank_withdrawals').insert([{
      amount: amt,
      bank_name: bankName,
      purpose,
      created_by: createdBy || 'Admin'
    }]);
    if (error) throw new Error(error.message || "Failed to save withdrawal");
  };

  const deleteWithdrawal = async (id) => {
    const { error } = await supabase.from('bank_withdrawals').delete().eq('id', id);
    if (error) throw new Error(error.message || "Failed to delete withdrawal record");
  };

  const deleteCashReceive = async (id) => {
    const { error } = await supabase.from('cash_receives').delete().eq('id', id);
    if (error) throw new Error(error.message || "Failed to delete cash receive record");
  };

  return {
    isLoading,
    cashBalance,
    cashSalesTotal,
    debtSettlementsTotal,
    bankBalance,
    bankDepositsTotal,
    bankWithdrawalsTotal,
    bankBalancesByName,
    chequesPending,
    chequesPendingTotal,
    handChequesTotal,
    cashReceives,
    bankDeposits,
    chequeRecords,
    bankWithdrawals,
    addCashReceive,
    deleteCashReceive,
    addBankDeposit,
    deleteBankDeposit,
    addChequeRecord,
    depositChequeRecord,
    deleteChequeRecord,
    addWithdrawal,
    deleteWithdrawal
  };
}
