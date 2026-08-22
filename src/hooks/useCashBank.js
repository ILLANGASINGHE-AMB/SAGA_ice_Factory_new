import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { computeCashBankBalances } from '../utils/cashBankMath';
import { logActivity, currentActor } from '../lib/activityLog';

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

  const {
    cashSalesTotal,
    debtSettlementsTotal,
    bankDepositsTotal,
    bankWithdrawalsTotal,
    chequesPending,
    chequesPendingTotal,
    handChequesTotal,
    cashBalance,
    bankBalance
  } = useMemo(
    () => computeCashBankBalances({
      cashSalesRows: sales,
      settlementRows: settlements,
      cashReceives,
      bankDeposits,
      chequeRecords,
      bankWithdrawals
    }),
    [sales, settlements, cashReceives, bankDeposits, chequeRecords, bankWithdrawals]
  );

  // Combined, normalized audit trail across all 4 ledgers — every entry ever
  // saved to cash_receives / bank_deposits / cheque_records / bank_withdrawals
  // shows up here, independent of the per-section history tables. A deposited
  // cheque intentionally produces two entries (its own "received" row, plus
  // the bank_deposits row created when it was deposited) since those are two
  // distinct real-world events at two different times.
  const historyEntries = useMemo(() => {
    const entries = [];

    for (const r of cashReceives) {
      entries.push({
        id: `receive-${r.id}`,
        actionType: 'cash_receive',
        occurredAt: r.received_at,
        amount: Number(r.amount) || 0,
        direction: 'in',
        doneBy: r.created_by || 'Admin',
        detail: r.receive_type === 'head_office' ? 'Received by Head Office' : 'Other Receives'
      });
    }

    for (const d of bankDeposits) {
      entries.push({
        id: `deposit-${d.id}`,
        actionType: 'bank_deposit',
        occurredAt: d.deposited_at,
        amount: Number(d.amount) || 0,
        direction: 'in',
        doneBy: d.created_by || 'Admin',
        detail: [
          d.cash_method === 'sales' ? 'Cash Received From Sales' : d.cash_method === 'other' ? 'Cash Received From Other' : 'Cash Received From Cheques',
          d.bank_name
        ].filter(Boolean).join(' — ')
      });
    }

    for (const c of chequeRecords) {
      entries.push({
        id: `cheque-${c.id}`,
        actionType: 'cheque_received',
        occurredAt: c.received_at,
        amount: Number(c.amount) || 0,
        direction: 'neutral',
        doneBy: c.created_by || 'Admin',
        detail: `Cheque No. ${c.cheque_no} — ${c.bank_name} (${c.payer_name})`
      });
    }

    for (const w of bankWithdrawals) {
      entries.push({
        id: `withdrawal-${w.id}`,
        actionType: 'withdrawal',
        occurredAt: w.withdrawn_at,
        amount: Number(w.amount) || 0,
        direction: 'out',
        doneBy: w.created_by || 'Admin',
        detail: `${w.purpose} — ${w.bank_name}`
      });
    }

    return entries.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  }, [cashReceives, bankDeposits, chequeRecords, bankWithdrawals]);

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

  const addCashReceive = async ({ amount, receiveType, receivedAt, createdBy }) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid amount");
    if (!['head_office', 'other'].includes(receiveType)) throw new Error("Please select a receive description");

    const { data, error } = await supabase.from('cash_receives').insert([{
      amount: amt,
      receive_type: receiveType,
      received_at: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
      created_by: createdBy || 'Admin'
    }]).select('id').single();
    if (error) throw new Error(error.message || "Failed to save cash receive");
    logActivity({ action: 'create', entityType: 'cash_receive', entityId: data?.id, description: `Recorded cash receive of LKR ${amt.toLocaleString()}`, performedBy: createdBy });
  };

  const addBankDeposit = async ({ amount, cashMethod, bankName, createdBy }) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid deposit amount");
    if (!['sales', 'other', 'cheques'].includes(cashMethod)) throw new Error("Please select a cash method");
    if (cashMethod !== 'cheques' && amt > cashBalance) {
      throw new Error(`Deposit cannot exceed current Cash Balance (LKR ${cashBalance.toLocaleString()}).`);
    }
    // An unlinked "cheques" deposit isn't tied to one specific cheque_records
    // row, so nothing else stops it from claiming more than is actually on
    // hand — without this check, handChequesTotal's Math.max(0, ...) floor
    // would silently absorb the over-claim while Bank Balance still grew by
    // the full amount, creating money from nothing.
    if (cashMethod === 'cheques' && amt > handChequesTotal) {
      throw new Error(`Deposit cannot exceed current Hand Cheques balance (LKR ${handChequesTotal.toLocaleString()}).`);
    }

    const { data, error } = await supabase.from('bank_deposits').insert([{
      amount: amt,
      cash_method: cashMethod,
      bank_name: bankName || null,
      created_by: createdBy || 'Admin'
    }]).select('id').single();
    if (error) throw new Error(error.message || "Failed to save bank deposit");
    logActivity({ action: 'create', entityType: 'bank_deposit', entityId: data?.id, description: `Deposited LKR ${amt.toLocaleString()} to ${bankName || 'bank'}`, performedBy: createdBy });
  };

  const deleteBankDeposit = async (id) => {
    // If this deposit was created by depositing a specific cheque, reverse
    // that cheque back to "pending" first. The FK's `on delete set null`
    // would otherwise clear deposit_id but leave status stuck at
    // 'deposited' — the money would then vanish from both Bank Balance (the
    // deposit is gone) and Hand Cheques (the cheque never returns to pending).
    const { error: revertErr } = await supabase
      .from('cheque_records')
      .update({ status: 'pending', deposited_at: null, deposit_id: null })
      .eq('deposit_id', id);
    if (revertErr) throw new Error(revertErr.message || "Failed to reverse the linked cheque record");

    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'bank_deposits',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message || "Failed to delete deposit record");
  };

  const addChequeRecord = async ({ chequeNo, bankName, amount, payerName, createdBy }) => {
    const amt = parseFloat(amount);
    if (!chequeNo) throw new Error("Please enter the cheque number");
    if (!bankName) throw new Error("Please enter the bank name");
    if (isNaN(amt) || amt <= 0) throw new Error("Please enter a valid amount");
    if (!payerName) throw new Error("Please enter the customer/payer name");

    const { data, error } = await supabase.from('cheque_records').insert([{
      cheque_no: chequeNo,
      bank_name: bankName,
      amount: amt,
      payer_name: payerName,
      created_by: createdBy || 'Admin'
    }]).select('id').single();
    if (error) throw new Error(error.message || "Failed to save cheque record");
    logActivity({ action: 'create', entityType: 'cheque_record', entityId: data?.id, entityLabel: chequeNo, description: `Recorded cheque ${chequeNo} for LKR ${amt.toLocaleString()}`, performedBy: createdBy });
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
    logActivity({ action: 'update', entityType: 'cheque_record', entityId: chequeId, entityLabel: cheque.cheque_no, description: `Deposited cheque ${cheque.cheque_no}` });
  };

  const deleteChequeRecord = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'cheque_records',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
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

    const { data, error } = await supabase.from('bank_withdrawals').insert([{
      amount: amt,
      bank_name: bankName,
      purpose,
      created_by: createdBy || 'Admin'
    }]).select('id').single();
    if (error) throw new Error(error.message || "Failed to save withdrawal");
    logActivity({ action: 'create', entityType: 'bank_withdrawal', entityId: data?.id, description: `Withdrew LKR ${amt.toLocaleString()} from ${bankName}`, performedBy: createdBy });
  };

  const deleteWithdrawal = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'bank_withdrawals',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
    if (error) throw new Error(error.message || "Failed to delete withdrawal record");
  };

  const deleteCashReceive = async (id) => {
    const { performedBy, performedByRole } = currentActor();
    const { error } = await supabase.rpc('soft_delete_row', {
      p_table: 'cash_receives',
      p_id: id,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });
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
    historyEntries,
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
