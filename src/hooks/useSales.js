import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateBillPDFBlob } from '../utils/pdfGenerator';

export function useSales() {
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*, customer:customers(*)')
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
      .subscribe();

    return () => {
      supabase.removeChannel(channelSales);
    };
  }, []);

  const placeOrder = async ({
    customer_id,
    cube_type,
    quantity,
    price_per_cube,
    payment_type,
    created_by
  }) => {
    if (!customer_id) throw new Error("Customer is required");
    if (!cube_type || (cube_type !== 'manufactured' && cube_type !== 'resell')) {
      throw new Error("Invalid cube type selected");
    }
    if (!quantity || quantity <= 0) throw new Error("Quantity must be a positive integer");
    if (price_per_cube === null || price_per_cube === undefined || price_per_cube <= 0) {
      throw new Error("Price per cube must be set before placing a sale");
    }

    // 1. Try atomic PostgreSQL single-transaction RPC execution
    let txnResult = null;
    let sale_code = null;
    let total_amount = price_per_cube * quantity;
    let sale_date = new Date().toISOString();
    let debtId = null;
    let saleId = null;

    const { data: rpcData, error: rpcErr } = await supabase.rpc('place_order_transaction', {
      p_customer_id: customer_id,
      p_cube_type: cube_type,
      p_quantity: quantity,
      p_price_per_cube: price_per_cube,
      p_payment_type: payment_type,
      p_created_by: created_by
    });

    if (!rpcErr && rpcData) {
      txnResult = rpcData;
      saleId = rpcData.id;
      sale_code = rpcData.sale_code;
      total_amount = rpcData.total_amount;
      sale_date = rpcData.sale_date;
      debtId = rpcData.debt_id;
    } else {
      // Fallback if RPC is not deployed yet
      const { error: deductErr } = await supabase.rpc('deduct_inventory_stock_by_type', {
        p_cube_type: cube_type,
        p_amount: quantity
      });

      if (deductErr) {
        const { data: inventoryItem, error: invErr } = await supabase
          .from('inventory')
          .select('*')
          .eq('type', cube_type)
          .single();

        if (invErr || !inventoryItem) throw new Error(`Inventory item for ${cube_type} not found`);
        if (inventoryItem.quantity - quantity < 0) {
          throw new Error(`Insufficient stock. Available: ${inventoryItem.quantity}`);
        }

        const { error: updateInvErr } = await supabase
          .from('inventory')
          .update({
            quantity: inventoryItem.quantity - quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', inventoryItem.id);

        if (updateInvErr) throw new Error(updateInvErr.message);
      }

      const { data: codeData } = await supabase.rpc('get_next_code', {
        p_entity: 'sale',
        p_prefix: 'S'
      });

      if (codeData) {
        sale_code = codeData;
      } else {
        const { count } = await supabase.from('sales').select('*', { count: 'exact', head: true });
        const newCount = count !== null ? count : 0;
        const now = new Date();
        const dateSuffix = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
        sale_code = `S-${newCount + 1}-${dateSuffix}`;
      }

      const { data: newSale, error: saleErr } = await supabase
        .from('sales')
        .insert({
          sale_code,
          customer_id,
          cube_type,
          quantity,
          price_per_cube,
          total_amount,
          payment_type,
          sale_date,
          created_by
        })
        .select('*')
        .single();

      if (saleErr) throw new Error(saleErr.message);
      saleId = newSale.id;

      if (payment_type === 'debt') {
        const { data: newDebt, error: debtErr } = await supabase
          .from('debts')
          .insert({
            sale_id: saleId,
            customer_id,
            total_amount,
            paid_amount: 0,
            remaining_amount: total_amount,
            status: 'pending',
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();

        if (debtErr) throw new Error(debtErr.message);
        debtId = newDebt.id;
      }
    }

    // 2. Fetch customer & settings for PDF Bill generation
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .single();

    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .limit(1)
      .single();

    let bill_pdf_url = null;

    // Generate PDF Blob and upload to private Supabase Storage 'bills' bucket
    try {
      const saleObj = {
        sale_code,
        customer,
        cube_type,
        quantity,
        price_per_cube,
        total_amount,
        payment_type,
        sale_date,
        created_by
      };

      const pdfBlob = generateBillPDFBlob(saleObj, settings || {});
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

    return {
      id: saleId,
      sale_code,
      customer_id,
      cube_type,
      quantity,
      price_per_cube,
      total_amount,
      payment_type,
      bill_pdf_url,
      sale_date,
      created_by,
      customer,
      debtId
    };
  };

  const deleteSale = async (saleId, restoreStock = true) => {
    // 1. Fetch sale details to know the type and quantity to restore if requested
    const { data: sale, error: getErr } = await supabase
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .single();

    if (getErr || !sale) throw new Error("Sale record not found");

    if (restoreStock) {
      // 2. Fetch inventory record
      const { data: inventoryItem } = await supabase
        .from('inventory')
        .select('*')
        .eq('type', sale.cube_type)
        .single();

      if (inventoryItem) {
        // 3. Restore stock
        const { error: updateInvErr } = await supabase
          .from('inventory')
          .update({
            quantity: inventoryItem.quantity + sale.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', inventoryItem.id);
        
        if (updateInvErr) throw new Error(updateInvErr.message);
      }
    }

    // 4. Delete sale
    const { error: deleteErr } = await supabase
      .from('sales')
      .delete()
      .eq('id', saleId);

    if (deleteErr) throw new Error(deleteErr.message);
  };

  return {
    sales,
    isLoading,
    placeOrder,
    deleteSale
  };
}
