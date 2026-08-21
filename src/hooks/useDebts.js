import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateSettlementReceiptPDF } from '../utils/pdfGenerator';

export function useDebts() {
  const [debts, setDebts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDebts = async () => {
    try {
      const { data, error } = await supabase
        .from('debts')
        .select('*, customer:customers(*), sale:sales(*)')
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
    fetchDebts();

    const channel = supabase
      .channel(`debts-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debts' },
        () => fetchDebts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        () => fetchDebts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => fetchDebts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debt_settlements' },
        () => fetchDebts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const settleDebt = async (debtId, amountPaid, createdBy, paymentMethod = 'cash') => {
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
      p_payment_method: paymentMethod
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

    return {
      id: settlementId,
      settlement_code,
      debt_id: debtId,
      amount_paid,
      payment_method: settledPaymentMethod,
      remaining_amount: newRemaining,
      status: newStatus,
      bill_pdf_url,
      customer,
      sale
    };
  };

  return {
    debts,
    isLoading,
    settleDebt
  };
}
