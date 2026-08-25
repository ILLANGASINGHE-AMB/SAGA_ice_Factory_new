import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { generateSettlementReceiptPDF } from '../utils/pdfGenerator';
import { logActivity } from '../lib/activityLog';

export function useDebts() {
  const [debts, setDebts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDebts = async () => {
    try {
      const { data, error } = await supabase
        .from('debts')
        .select('*, customer:customers(*), sale:sales(*), debt_settlements(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDebts(data || []);
    } catch (err) {
      console.error("Failed to fetch debts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchDebts = coalesceRefetch(fetchDebts);
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
      .single();

    const { data: sale } = await supabase
      .from('sales')
      .select('*')
      .eq('id', sale_id)
      .single();

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single();

    let bill_pdf_url = null;

    // Generate settlement receipt PDF and upload to private storage bucket.
    // This is best-effort — the financial settlement above already succeeded
    // and is not rolled back if PDF generation/upload fails.
    try {
      const settlementObj = {
        settlement_code,
        debt_id: debtId,
        customer,
        sale,
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
  // their oldest unpaid sales first — mirrors the cash-to-old-debt-offset
  // convention already used when a debit-order's cash is applied against a
  // customer's existing debts. Each covered debt still gets its own
  // debt_settlements audit row (via settle_debt_transaction), so the ledger
  // stays accurate per sale; the caller gets back one combined receipt
  // describing every sale the payment touched.
  const settleCustomerDebt = async (customerId, amountPaid, createdBy, paymentMethod = 'cash', notes = null, paymentDetails = {}) => {
    if (!amountPaid || amountPaid <= 0) {
      throw new Error("Settlement amount must be a positive number");
    }

    // A cheque has to carry enough detail to become a real Hand Cheques
    // record, so it is validated BEFORE any money moves — a settlement that
    // succeeded but couldn't be filed as a cheque would leave the payment
    // recorded against the debt with nothing holding the funds.
    if (paymentMethod === 'cheque') {
      if (!paymentDetails.chequeNo?.trim()) throw new Error("Cheque number is required for a cheque settlement");
      if (!paymentDetails.bankName?.trim()) throw new Error("Bank name is required for a cheque settlement");
    }

    const { data: outstandingDebts, error: debtsErr } = await supabase
      .from('debts')
      .select('*, sale:sales(*)')
      .eq('customer_id', customerId)
      .neq('status', 'settled')
      .order('created_at', { ascending: true });

    if (debtsErr) throw new Error(debtsErr.message);
    if (!outstandingDebts || outstandingDebts.length === 0) {
      throw new Error("This customer has no outstanding debt");
    }

    const totalOutstanding = outstandingDebts.reduce((sum, d) => sum + Number(d.remaining_amount), 0);
    if (amountPaid > totalOutstanding) {
      throw new Error(`Payment amount exceeds total outstanding debt (LKR ${totalOutstanding.toLocaleString()})`);
    }

    let amountLeft = amountPaid;
    const lines = [];
    let lastSettlement = null;

    for (const debt of outstandingDebts) {
      if (amountLeft <= 0) break;
      const apply = Math.min(amountLeft, Number(debt.remaining_amount));

      const { data: settlement, error: settleErr } = await supabase.rpc('settle_debt_transaction', {
        p_debt_id: debt.id,
        p_amount_paid: apply,
        p_created_by: createdBy,
        p_payment_method: paymentMethod,
        p_notes: notes
      });

      if (settleErr || !settlement) {
        throw new Error(settleErr?.message || "Failed to settle debt");
      }

      lines.push({
        sale_code: debt.sale?.sale_code || null,
        amount_applied: apply,
        remaining_amount: settlement.remaining_amount,
        status: settlement.status
      });

      lastSettlement = settlement;
      amountLeft -= apply;
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    // Put the money where it actually went. A cash settlement needs nothing
    // here — Cash Balance is derived from debt_settlements directly. The
    // other two methods never touch the till, so each files its own row in
    // the Cash & Bank ledger it belongs to, linked back to this settlement:
    //
    //   Bank/Online Transfer -> bank_deposits  -> Bank Balance
    //   Cheque               -> cheque_records -> Hand Cheques (pending)
    //
    // Best-effort: the debts above are already settled and are NOT rolled
    // back if this fails. The caller is handed a ledgerWarning instead so the
    // operator can file the entry by hand in Cash & Bank rather than losing
    // the receipt and re-running a payment that already went through.
    let ledgerWarning = null;
    const settlementId = lastSettlement.id;

    try {
      if (paymentMethod === 'bank_transfer') {
        const { error: depositErr } = await supabase.from('bank_deposits').insert([{
          amount: amountPaid,
          cash_method: 'debt_settlement',
          bank_name: paymentDetails.bankName?.trim() || null,
          settlement_id: settlementId,
          created_by: createdBy || 'Admin'
        }]);
        if (depositErr) throw new Error(depositErr.message);
      } else if (paymentMethod === 'cheque') {
        const { error: chequeErr } = await supabase.from('cheque_records').insert([{
          cheque_no: paymentDetails.chequeNo.trim(),
          bank_name: paymentDetails.bankName.trim(),
          amount: amountPaid,
          payer_name: paymentDetails.payerName?.trim() || customer?.name || 'Customer',
          customer_id: customerId ? Number(customerId) : null,
          settlement_id: settlementId,
          created_by: createdBy || 'Admin'
        }]);
        if (chequeErr) throw new Error(chequeErr.message);
      }
    } catch (ledgerErr) {
      console.error("Settlement recorded but the Cash & Bank entry failed:", ledgerErr);
      ledgerWarning = paymentMethod === 'cheque'
        ? "Settlement saved, but the cheque could not be added to Hand Cheques — please add it manually in Cash & Bank."
        : "Settlement saved, but the bank deposit could not be recorded — please add it manually in Cash & Bank.";
    }

    logActivity({ action: 'settle_debt', entityType: 'customer', entityId: customerId, entityLabel: customer?.customer_code, description: `Settled LKR ${Number(amountPaid).toLocaleString()} across ${lines.length} debt(s) for ${customer?.customer_code || customerId}`, performedBy: createdBy });

    return {
      id: lastSettlement.id,
      settlement_code: lastSettlement.settlement_code,
      customer_id: customerId,
      amount_paid: amountPaid,
      payment_method: paymentMethod,
      notes,
      settlement_date: lastSettlement.settlement_date,
      created_by: createdBy,
      customer,
      cheque_no: paymentMethod === 'cheque' ? paymentDetails.chequeNo?.trim() || null : null,
      bank_name: paymentDetails.bankName?.trim() || null,
      settlements: lines,
      remaining_amount: lines[lines.length - 1]?.remaining_amount ?? 0,
      status: lines[lines.length - 1]?.status ?? 'settled',
      ledgerWarning
    };
  };

  return {
    debts,
    isLoading,
    settleDebt,
    settleCustomerDebt
  };
}
