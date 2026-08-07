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

  const settleDebt = async (debtId, amountPaid, createdBy) => {
    if (!amountPaid || amountPaid <= 0) {
      throw new Error("Settlement amount must be a positive number");
    }

    const { data: debt, error: getErr } = await supabase
      .from('debts')
      .select('*')
      .eq('id', debtId)
      .single();

    if (getErr || !debt) throw new Error("Debt record not found");
    
    if (amountPaid > debt.remaining_amount) {
      throw new Error(`Payment exceeds outstanding debt. Max payable: LKR ${debt.remaining_amount}`);
    }

    const newPaid = Number(debt.paid_amount) + amountPaid;
    const newRemaining = Number(debt.total_amount) - newPaid;
    const newStatus = newRemaining <= 0 ? 'settled' : 'partial';

    const { error: updateErr } = await supabase
      .from('debts')
      .update({
        paid_amount: newPaid,
        remaining_amount: newRemaining,
        status: newStatus
      })
      .eq('id', debtId);

    if (updateErr) throw new Error(updateErr.message);

    // Auto-generate atomic settlement_code
    let settlement_code = null;
    const { data: codeData, error: codeErr } = await supabase.rpc('get_next_code', {
      p_entity: 'settlement',
      p_prefix: 'D'
    });

    if (!codeErr && codeData) {
      settlement_code = codeData;
    } else {
      const { count } = await supabase
        .from('debt_settlements')
        .select('*', { count: 'exact', head: true });
      const newCount = count !== null ? count : 0;
      const now = new Date();
      const dateSuffix = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
      settlement_code = `D-${newCount + 1}-${dateSuffix}`;
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', debt.customer_id)
      .single();

    const { data: sale } = await supabase
      .from('sales')
      .select('*')
      .eq('id', debt.sale_id)
      .single();

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single();

    let bill_pdf_url = null;

    // Generate settlement receipt PDF and upload to private storage bucket
    try {
      const settlementObj = {
        settlement_code,
        debt_id: debtId,
        customer,
        sale,
        amount_paid: amountPaid,
        remaining_amount: newRemaining,
        status: newStatus,
        settlement_date: new Date().toISOString(),
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
        }
      }
    } catch (pdfErr) {
      console.warn("Settlement PDF generation skipped:", pdfErr);
    }

    const { data: newSettlement, error: insertErr } = await supabase
      .from('debt_settlements')
      .insert({
        debt_id: debtId,
        customer_id: debt.customer_id,
        amount_paid: amountPaid,
        settlement_date: new Date().toISOString(),
        bill_pdf_url,
        created_by: createdBy
      })
      .select('*')
      .single();

    if (insertErr) throw new Error(insertErr.message);

    return {
      id: newSettlement.id,
      settlement_code,
      debt_id: debtId,
      amount_paid: amountPaid,
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
