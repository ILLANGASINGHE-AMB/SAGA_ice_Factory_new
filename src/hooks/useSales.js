import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { coalesceRefetch } from '../lib/realtimeRefetch';
import { generateBillPDFBlob } from '../utils/pdfGenerator';
import { logActivity, currentActor } from '../lib/activityLog';

export function useSales() {
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // A failed fetch used to leave the previous (or empty) array in place, so
  // the page rendered a plausible-looking but silently incomplete list. The
  // error is surfaced instead so "no sales" and "could not load" are
  // distinguishable.
  const [error, setError] = useState(null);

  const fetchSales = async () => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('sales')
        .select('*, customer:customers(*), sale_items(*)')
        .order('sale_date', { ascending: false });

      if (fetchErr) throw fetchErr;
      setSales(data || []);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
      setError(err.message || "Failed to load sales");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const refetchSales = coalesceRefetch(fetchSales);
    // This effect's job is to subscribe to an external system (Supabase:
    // an initial fetch plus a realtime channel) and push what it reports
    // back into React state — the case the rule explicitly allows for. It
    // is not derived state being patched in after a render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSales();

    const channelSales = supabase
      .channel(`sales-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        refetchSales
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        refetchSales
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sale_items' },
        refetchSales
      )
      .subscribe();

    return () => {
      refetchSales.cancel();
      supabase.removeChannel(channelSales);
    };
  }, []);

  // One pooled Ice Cubes order: a billed quantity at one rate, plus an
  // optional free quantity. The operator no longer picks Production vs
  // Resell — the server draws Production first and falls back to Resell, and
  // records the resulting split per sale_item.
  const placeOrder = async ({
    customer_id,
    quantity,
    price_per_cube,
    free_quantity = 0,
    payment_type,
    created_by
  }) => {
    if (!customer_id) throw new Error("Customer is required");

    const paid = Number(quantity) || 0;
    const free = Number(free_quantity) || 0;

    if (!Number.isInteger(paid) || paid < 0) throw new Error("Cube quantity must be a whole number");
    if (!Number.isInteger(free) || free < 0) throw new Error("Free cube quantity must be a whole number");
    if (paid + free === 0) throw new Error("Enter a cube quantity or a free cube quantity");
    if (paid > 0 && !(Number(price_per_cube) > 0)) throw new Error("Price per cube must be set before placing a sale");
    if (!payment_type || (payment_type !== 'cash' && payment_type !== 'debt')) {
      throw new Error("Invalid payment type selected");
    }

    // Atomic PostgreSQL single-transaction RPC execution. No JS fallback here
    // — pooled inventory locking, Production-first allocation and
    // cash-to-old-debt FIFO bookkeeping are not safe to approximate outside a
    // real DB transaction: safer to block the sale and ask the operator to retry.
    const { data: rpcData, error: rpcErr } = await supabase.rpc('place_pooled_order_transaction', {
      p_customer_id: customer_id,
      p_quantity: paid,
      p_price_per_cube: Number(price_per_cube) || null,
      p_free_quantity: free,
      p_payment_type: payment_type,
      p_created_by: created_by
    });

    if (rpcErr || !rpcData) {
      throw new Error(rpcErr?.message || "Unable to process order. Please try again.");
    }

    const saleId = rpcData.id;
    const sale_code = rpcData.sale_code;
    const total_amount = rpcData.total_amount;
    const debtId = rpcData.debt_id;
    // Populated when a 'cash' order's payment reduces the customer's pre-existing
    // outstanding debts (see place_pooled_order_transaction).
    const appliedToOldDebt = Number(rpcData.applied_to_old_debt) || 0;

    // Fetch the fully joined sale (customer, line items) for PDF generation
    const { data: fullSale } = await supabase
      .from('sales')
      .select('*, customer:customers(*), sale_items(*)')
      .eq('id', saleId)
      .single();

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    let bill_pdf_url = null;

    // FIN-17: whatever this order's cash was diverted to older invoices is an
    // equal shortfall left owing on THIS bill, so the invoice must not print
    // "PAID IN FULL". The RPC already returns the figure; passing it here is
    // what lets generateBillPDF say "PART PAID" instead. A debt order's own
    // total is not an FIN-17 shortfall and is labelled from payment_type.
    const billSale = {
      ...fullSale,
      outstanding: fullSale?.payment_type === 'cash' ? appliedToOldDebt : 0
    };

    // Generate PDF Blob and upload to private Supabase Storage 'bills' bucket
    try {
      const pdfBlob = generateBillPDFBlob(billSale, settings || {});
      const fileName = `BILL_${sale_code}_${Date.now()}.pdf`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('bills')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (!uploadErr && uploadData) {
        const { data: signedUrlData } = await supabase.storage
          .from('bills')
          .createSignedUrl(fileName, 60 * 60 * 24);

        if (signedUrlData?.signedUrl) {
          bill_pdf_url = signedUrlData.signedUrl;
          await supabase.from('sales').update({ bill_pdf_url }).eq('id', saleId);
        }
      }
    } catch (pdfErr) {
      console.warn("PDF generation / storage upload skipped:", pdfErr);
    }

    logActivity({ action: 'create', entityType: 'sale', entityId: saleId, entityLabel: sale_code, description: `Created sale ${sale_code} (LKR ${Number(total_amount).toLocaleString()})`, performedBy: created_by });

    return {
      ...fullSale,
      id: saleId,
      sale_code,
      total_amount,
      bill_pdf_url: bill_pdf_url || fullSale?.bill_pdf_url || null,
      debtId,
      appliedToOldDebt,
      // How the pooled quantity was actually drawn across Production/Resell,
      // paid and free — the operator entered one number, so this is the only
      // place the split is visible to the UI.
      allocation: rpcData.allocation || null,
      free_quantity: Number(rpcData.free_quantity) || 0
    };
  };

  // Edit Bill. The operator corrects the same two numbers they entered at the
  // till — billed quantity and free quantity — plus the rate and the payment
  // terms; the server re-allocates across Production/Resell exactly as a new
  // order does. There is deliberately no cube-type parameter any more: a
  // pooled order that spanned both pools has sales.cube_type = NULL, and the
  // old signature rejected those outright ("Invalid cube type selected"),
  // making every large order permanently uneditable.
  const updateSale = async ({
    id,
    quantity,
    free_quantity = 0,
    price_per_cube,
    payment_type,
    edited_by
  }) => {
    if (!id) throw new Error("Sale id is required");

    const paid = Number(quantity) || 0;
    const free = Number(free_quantity) || 0;

    if (!Number.isInteger(paid) || paid < 0) throw new Error("Cube quantity must be a whole number");
    if (!Number.isInteger(free) || free < 0) throw new Error("Free cube quantity must be a whole number");
    if (paid + free === 0) throw new Error("Enter a cube quantity or a free cube quantity");
    if (paid > 0 && !(Number(price_per_cube) > 0)) throw new Error("Price per cube must be a valid positive number");
    if (!payment_type || (payment_type !== 'cash' && payment_type !== 'debt')) {
      throw new Error("Invalid payment type selected");
    }

    const { data, error } = await supabase.rpc('edit_sale_transaction', {
      p_sale_id: id,
      p_quantity: paid,
      p_price_per_cube: Number(price_per_cube) || null,
      p_free_quantity: free,
      p_payment_type: payment_type,
      p_edited_by: edited_by
    });

    if (error) throw new Error(error.message || "Failed to update sale");

    // Regenerate & re-upload the bill PDF so /bill/:code and WhatsApp links
    // reflect the corrected figures instead of the stale pre-edit invoice.
    // sale_items is selected too — the PDF renders the line items, and the
    // edit has just rewritten them.
    try {
      const { data: fullSale } = await supabase
        .from('sales')
        .select('*, customer:customers(*), sale_items(*)')
        .eq('id', id)
        .maybeSingle();

      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (fullSale) {
        const pdfBlob = generateBillPDFBlob(fullSale, settings || {});
        const fileName = `BILL_${fullSale.sale_code}_${Date.now()}.pdf`;

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('bills')
          .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });

        if (!uploadErr && uploadData) {
          const { data: signedUrlData } = await supabase.storage
            .from('bills')
            .createSignedUrl(fileName, 60 * 60 * 24);

          if (signedUrlData?.signedUrl) {
            await supabase.from('sales').update({ bill_pdf_url: signedUrlData.signedUrl }).eq('id', id);
          }
        }
      }
    } catch (pdfErr) {
      console.warn("PDF regeneration / storage upload skipped:", pdfErr);
    }

    logActivity({ action: 'update', entityType: 'sale', entityId: id, description: `Edited sale ${data?.sale_code || id}`, performedBy: edited_by });

    return data;
  };

  // What deleting this sale will undo, so the operator can be shown which of
  // the customer's other debts are about to become unpaid again before they
  // confirm. Read-only.
  const saleDeletionImpact = async (saleId) => {
    const { data, error } = await supabase.rpc('sale_deletion_impact', { p_sale_id: saleId });
    if (error) throw new Error(error.message || "Could not read the sale's deletion impact");
    return data || { auto_applied_settlements: [], auto_applied_total: 0 };
  };

  // One RPC, one transaction. The previous version restored stock with an
  // unlocked read-then-write (two concurrent deletes lost one another's
  // update), logged no inventory_transactions row, ran the restore BEFORE the
  // delete, and — worst — left the auto-applied debt reductions this sale had
  // funded standing: the revenue vanished while the write-off it paid for
  // stayed, quietly understating receivables with no trace.
  const deleteSale = async (saleId, restoreStock = true) => {
    const { performedBy, performedByRole } = currentActor();
    const { data, error } = await supabase.rpc('delete_sale_transaction', {
      p_sale_id: saleId,
      p_restore_stock: restoreStock,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });

    if (error) throw new Error(error.message || "Failed to delete sale");
    return data;
  };

  return {
    sales,
    isLoading,
    error,
    placeOrder,
    updateSale,
    saleDeletionImpact,
    deleteSale
  };
}
