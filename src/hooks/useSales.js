import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateBillPDFBlob } from '../utils/pdfGenerator';
import { logActivity, currentActor } from '../lib/activityLog';

export function useSales() {
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*, customer:customers(*), sale_items(*)')
        .order('sale_date', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (err) {
      console.error("Failed to fetch sales:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();

    const channelSales = supabase
      .channel(`sales-realtime-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        () => fetchSales()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers' },
        () => fetchSales()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sale_items' },
        () => fetchSales()
      )
      .subscribe();

    return () => {
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
      .single();

    let bill_pdf_url = null;

    // Generate PDF Blob and upload to private Supabase Storage 'bills' bucket
    try {
      const pdfBlob = generateBillPDFBlob(fullSale, settings || {});
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

  const updateSale = async ({
    id,
    cube_type,
    quantity,
    price_per_cube,
    payment_type,
    edited_by
  }) => {
    if (!id) throw new Error("Sale id is required");
    if (!cube_type || (cube_type !== 'manufactured' && cube_type !== 'resell')) {
      throw new Error("Invalid cube type selected");
    }
    if (!quantity || quantity <= 0 || !Number.isInteger(Number(quantity))) {
      throw new Error("Quantity must be a positive integer");
    }
    if (!payment_type || (payment_type !== 'cash' && payment_type !== 'debt')) {
      throw new Error("Invalid payment type selected");
    }

    const { data, error } = await supabase.rpc('edit_sale_transaction', {
      p_sale_id: id,
      p_cube_type: cube_type,
      p_quantity: quantity,
      p_price_per_cube: price_per_cube || null,
      p_payment_type: payment_type,
      p_edited_by: edited_by
    });

    if (error) throw new Error(error.message || "Failed to update sale");

    // Regenerate & re-upload the bill PDF so /bill/:code and WhatsApp links
    // reflect the corrected figures instead of the stale pre-edit invoice.
    try {
      const { data: fullSale } = await supabase
        .from('sales')
        .select('*, customer:customers(*)')
        .eq('id', id)
        .single();

      const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single();

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

  const deleteSale = async (saleId, restoreStock = true) => {
    // 1. Fetch the sale's line items to know what to restore if requested.
    //    Restoring per-item (rather than the legacy sale.cube_type/quantity,
    //    which are null for a mixed-item sale) correctly handles both
    //    single- and multi-item sales.
    const { data: items, error: getErr } = await supabase
      .from('sale_items')
      .select('cube_type, quantity')
      .eq('sale_id', saleId);

    if (getErr) throw new Error("Sale record not found");

    if (restoreStock && items && items.length > 0) {
      // Sum quantities per cube type first, so two rows of the same type
      // only need one inventory update.
      const restoreByType = items.reduce((acc, item) => {
        acc[item.cube_type] = (acc[item.cube_type] || 0) + item.quantity;
        return acc;
      }, {});

      for (const [cubeType, qty] of Object.entries(restoreByType)) {
        const { data: inventoryItem } = await supabase
          .from('inventory')
          .select('*')
          .eq('type', cubeType)
          .single();

        if (inventoryItem) {
          const { error: updateInvErr } = await supabase
            .from('inventory')
            .update({
              quantity: inventoryItem.quantity + qty,
              updated_at: new Date().toISOString()
            })
            .eq('id', inventoryItem.id);

          if (updateInvErr) throw new Error(updateInvErr.message);
        }
      }
    }

    // 2. Delete sale (sale_items and debts cascade via FK, both captured in
    //    the trash snapshot so a restore brings them back too)
    const { performedBy, performedByRole } = currentActor();
    const { error: deleteErr } = await supabase.rpc('soft_delete_row', {
      p_table: 'sales',
      p_id: saleId,
      p_deleted_by: performedBy,
      p_deleted_by_role: performedByRole
    });

    if (deleteErr) throw new Error(deleteErr.message);
  };

  return {
    sales,
    isLoading,
    placeOrder,
    updateSale,
    deleteSale
  };
}
