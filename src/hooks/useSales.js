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

    // 1. Fetch inventory record
    const { data: inventoryItem, error: invErr } = await supabase
      .from('inventory')
      .select('*')
      .eq('type', cube_type)
      .single();

    if (invErr || !inventoryItem) throw new Error(`Inventory item for ${cube_type} not found`);
    if (inventoryItem.quantity - quantity < 0) {
      throw new Error(`Insufficient stock. Available: ${inventoryItem.quantity}`);
    }

    // 2. Deduct stock
    const { error: updateInvErr } = await supabase
      .from('inventory')
      .update({
        quantity: inventoryItem.quantity - quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', inventoryItem.id);

    if (updateInvErr) throw new Error(updateInvErr.message);

    // 3. Generate Sale Code
    const { count, error: countErr } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true });

    if (countErr) throw new Error(countErr.message);
    const newCount = count !== null ? count : 0;
    
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const dateSuffix = `${dd}${mm}${yy}`;
    
    const sale_code = `S-${newCount + 1}-${dateSuffix}`;
    const total_amount = price_per_cube * quantity;

    // Fetch customer & settings for PDF Bill generation
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

    // Generate PDF Blob and upload to Supabase Storage 'bills' bucket
    try {
      const saleObj = {
        sale_code,
        customer,
        cube_type,
        quantity,
        price_per_cube,
        total_amount,
        payment_type,
        sale_date: now.toISOString(),
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
        const { data: publicUrlData } = supabase.storage
          .from('bills')
          .getPublicUrl(fileName);
        
        bill_pdf_url = publicUrlData?.publicUrl || null;
      }
    } catch (pdfErr) {
      console.warn("PDF generation / storage upload skipped:", pdfErr);
    }

    // 4. Create Sale Record
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
        bill_pdf_url,
        sale_date: now.toISOString(),
        created_by
      })
      .select('*')
      .single();

    if (saleErr) throw new Error(saleErr.message);

    // 5. If debt, create debt record
    let debtId = null;
    if (payment_type === 'debt') {
      const { data: newDebt, error: debtErr } = await supabase
        .from('debts')
        .insert({
          sale_id: newSale.id,
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

    return {
      id: newSale.id,
      sale_code,
      customer_id,
      cube_type,
      quantity,
      price_per_cube,
      total_amount,
      payment_type,
      bill_pdf_url,
      sale_date: newSale.sale_date,
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
