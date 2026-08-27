import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { generateSettlementReceiptPDF } from '../utils/pdfGenerator';
import { logActivity } from '../lib/activityLog';
import { fetchCustomerDebtSummary } from '../utils/customerDebt';

export function useDebts() {
  const [debts, setDebts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDebts = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('debts')
        .select('*, customer:customers(*), sale:sales(*), debt_settlements(*)')
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;
      setDebts(data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch debts:", err);
      setError(err.message || "Failed to load debts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchDebts = coalesceRefetch(fetchDebts);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDebts();

    const channel = supabase
      .channel(`debts-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debts' },
        refetchDebts
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        refetchDebts
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        refetchDebts
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debt_settlements' },
        refetchDebts
      )
      .subscribe();

    return () => {
      refetchDebts.cancel();
      supabase.removeChannel(channel);
    };
  }, []);

  const settleDebt = async (debtId, amountPaid, createdBy, paymentMethod = 'cash', notes = null) => {
    if (!amountPaid || amountPaid <= 0) {
      throw new Error("Settlement amount must be a positive number");
    }

    // Atomically lock the debt row, validate the payment against the current
    // remaining_amount, update paid/remaining/status, and insert the
    // debt_settlements audit row — all in one DB transaction. This prevents
    // two concurrent settlements (or a double-click) from both reading the
    // same "remaining_amount" and one silently overwriting the other's
    // payment, and prevents a failed audit insert from leaving the debt
    // updated with no matching settlement record (which previously caused
    // retries to double-apply a payment).
    const { data: settlement, error: settleErr } = await supabase.rpc('settle_debt_transaction', {
      p_debt_id: debtId,
      p_amount_paid: amountPaid,
      p_created_by: createdBy,
      p_payment_method: paymentMethod,
      p_notes: notes
    });

    if (settleErr || !settlement) {
      throw new Error(settleErr?.message || "Failed to settle debt");
    }

    const {
      id: settlementId,
      settlement_code,
      customer_id,
      sale_id,
      amount_paid,
      payment_method: settledPaymentMethod,
      notes: settledNotes,
      remaining_amount: newRemaining,
      status: newStatus,
      settlement_date
    } = settlement;

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .maybeSingle();

    const { data: sale } = await supabase
      .from('sales')
      .select('*')
      .eq('id', sale_id)
      .maybeSingle();

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    let bill_pdf_url = null;

    // Generate settlement receipt PDF and upload to private storage bucket.
    // This is best-effort — the financial settlement above already succeeded
    // and is not rolled back if PDF generation/upload fails.
    try {
      // Read after the settlement committed, so the receipt states the
      // customer's balance as it stands once this payment is in.
      const customerDebt = await fetchCustomerDebtSummary(customer_id);

      const settlementObj = {
        settlement_code,
        debt_id: debtId,
        customer,
        sale,
        customer_debt_total: customerDebt.total,
        customer_debt_updated_at: customerDebt.updatedAt,
        amount_paid,
        payment_method: settledPaymentMethod,
        notes: settledNotes,
        remaining_amount: newRemaining,
        status: newStatus,
        settlement_date,
        created_by: createdBy
      };

      const doc = generateSettlementReceiptPDF(settlementObj, settings || {});
      const pdfBlob = doc.output('blob');
      const fileName = `SETTLEMENT_${settlement_code}_${Date.now()}.pdf`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('bills')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (!uploadErr && uploadData) {
        const { data: signedData } = await supabase.storage
          .from('bills')
          .createSignedUrl(fileName, 60 * 60 * 24);

        if (signedData?.signedUrl) {
          bill_pdf_url = signedData.signedUrl;
          await supabase.from('debt_settlements').update({ bill_pdf_url }).eq('id', settlementId);
        }
      }
    } catch (pdfErr) {
      console.warn("Settlement PDF generation skipped:", pdfErr);
    }

    logActivity({ action: 'settle_debt', entityType: 'debt', entityId: debtId, entityLabel: settlement_code, description: `Settled LKR ${Number(amount_paid).toLocaleString()} on debt ${settlement_code}`, performedBy: createdBy });

    return {
      id: settlementId,
      settlement_code,
      debt_id: debtId,
      amount_paid,
      payment_method: settledPaymentMethod,
      notes: settledNotes,
      remaining_amount: newRemaining,
      status: newStatus,
      bill_pdf_url,
      customer,
      sale
    };
  };

  // Settle a customer's outstanding debt as one payment, applied FIFO across
  // their oldest unpaid sales first.
  //
  // This is ONE server-side transaction (settle_customer_debt_transaction).
  // It used to be a JavaScript for-loop calling settle_debt_transaction once
  // per debt, each committing independently: a failure on the third call left
  // the first two paid, reported "Failed to settle debt", and the operator's
  // retry paid them a second time. The bank_deposits / cheque_records entry
  // was a third separate transaction on top of that, so a payment could also
  // be recorded against the debt with nothing holding the funds.
  const settleCustomerDebt = async (customerId, amountPaid, createdBy, paymentMethod = 'cash', notes = null, paymentDetails = {}) => {
    if (!amountPaid || amountPaid <= 0) {
      throw new Error("Settlement amount must be a positive number");
    }
    // Validated here as well as server-side, purely so the operator gets the
    // message before the round-trip.
    if (paymentMethod === 'cheque') {
      if (!paymentDetails.chequeNo?.trim()) throw new Error("Cheque number is required for a cheque settlement");
      if (!paymentDetails.bankName?.trim()) throw new Error("Bank name is required for a cheque settlement");
    }

    const { data: result, error: settleErr } = await supabase.rpc('settle_customer_debt_transaction', {
      p_customer_id: customerId,
      p_amount: amountPaid,
      p_payment_method: paymentMethod,
      p_notes: notes,
      p_details: {
        chequeNo: paymentDetails.chequeNo?.trim() || null,
        bankName: paymentDetails.bankName?.trim() || null,
        payerName: paymentDetails.payerName?.trim() || null
      },
      p_created_by: createdBy
    });

    if (settleErr || !result) {
      throw new Error(settleErr?.message || "Failed to settle debt");
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .maybeSingle();

    const lines = result.settlements || [];

    logActivity({
      action: 'settle_debt',
      entityType: 'customer',
      entityId: customerId,
      entityLabel: customer?.customer_code,
      description: `Settled LKR ${Number(amountPaid).toLocaleString()} across ${lines.length} debt(s) for ${customer?.customer_code || customerId}`,
      performedBy: createdBy
    });

    return {
      id: result.id,
      settlement_code: result.settlement_code,
      customer_id: customerId,
      amount_paid: Number(result.amount_paid) || amountPaid,
      payment_method: result.payment_method,
      notes,
      settlement_date: result.settlement_date,
      created_by: createdBy,
      customer,
      cheque_no: result.cheque_no,
      bank_name: result.bank_name,
      settlements: lines,
      // The authoritative post-payment balance, straight from the transaction
      // that applied it — not re-derived from a realtime-debounced local copy
      // of `debts`, which could still be showing the pre-payment figure when
      // the receipt / WhatsApp prompt opens.
      customerRemainingTotal: Number(result.customer_remaining_total) || 0,
      remaining_amount: lines.length ? lines[lines.length - 1].remaining_amount : 0,
      status: lines.length ? lines[lines.length - 1].status : 'settled'
    };
  };

  // A customer's opening balance: what they already owed when they arrived
  // from the old paper book. Written as an ordinary debt with no sale behind
  // it, so it ages, settles FIFO and is cleared by a later cash order exactly
  // like a debt raised here. Admin-gated server-side — the RLS policy on
  // `debts` has to allow any authenticated insert for the order RPCs, so the
  // check lives in the function.
  const addInitialDebt = async ({ customerId, amount, incurredAt = null, notes = null, createdBy }) => {
    const { data, error: rpcErr } = await supabase.rpc('add_customer_initial_debt', {
      p_customer_id: customerId,
      p_amount: Number(amount),
      p_incurred_at: incurredAt,
      p_notes: notes,
      p_created_by: createdBy || 'Admin'
    });

    if (rpcErr || !data) {
      throw new Error(rpcErr?.message || "Failed to record the initial debt");
    }

    logActivity({
      action: 'create',
      entityType: 'debt',
      entityId: data.id,
      entityLabel: data.customer_code,
      description: `Recorded initial debt of LKR ${Number(data.total_amount).toLocaleString()} for ${data.customer_code || customerId}`,
      performedBy: createdBy
    });

    return data;
  };

  // Undo a mistyped opening balance while nothing has been paid against it.
  // The server refuses once a settlement exists: deleting the debt would
  // cascade that settlement away and take real money out of Cash Balance
  // with it.
  const removeInitialDebt = async (debtId, performedBy) => {
    const { error: rpcErr } = await supabase.rpc('delete_customer_initial_debt', {
      p_debt_id: debtId
    });
    if (rpcErr) throw new Error(rpcErr.message || "Failed to remove the initial debt");

    logActivity({
      action: 'delete',
      entityType: 'debt',
      entityId: debtId,
      description: `Removed initial debt #${debtId}`,
      performedBy
    });
  };

  return {
    debts,
    isLoading,
    error,
    settleDebt,
    settleCustomerDebt,
    addInitialDebt,
    removeInitialDebt
  };
}
