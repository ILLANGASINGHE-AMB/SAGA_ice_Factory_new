import { useState, useEffect, useMemo } from 'react';
import { useCustomers } from './useCustomers';
import { useSales } from './useSales';
import { useDebts } from './useDebts';
import { useInventory } from './useInventory';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function useWholesalePortal() {
  const { customers, isLoading: loadingCustomers } = useCustomers();
  const { sales, placeOrder } = useSales();
  const { debts } = useDebts();
  const { inventory } = useInventory();

  // Selected Wholesale Customer ID (Defaults to first customer)
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  useEffect(() => {
    if (customers.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  const currentCustomer = useMemo(() => {
    return customers.find(c => c.id === Number(selectedCustomerId)) || customers[0] || null;
  }, [customers, selectedCustomerId]);

  // Customer Sales & Debt History
  const customerSales = useMemo(() => {
    if (!currentCustomer) return [];
    return sales.filter(s => s.customer_id === currentCustomer.id || s.customer?.id === currentCustomer.id);
  }, [sales, currentCustomer]);

  const customerDebts = useMemo(() => {
    if (!currentCustomer) return [];
    return debts.filter(d => d.customer_id === currentCustomer.id || d.customer?.id === currentCustomer.id);
  }, [debts, currentCustomer]);

  // Balance calculation
  const totalBilled = useMemo(() => {
    return customerSales.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);
  }, [customerSales]);

  const totalOutstandingDebt = useMemo(() => {
    return customerDebts.reduce((sum, d) => sum + parseFloat(d.remaining_amount || 0), 0);
  }, [customerDebts]);

  const totalPaid = useMemo(() => {
    return Math.max(0, totalBilled - totalOutstandingDebt);
  }, [totalBilled, totalOutstandingDebt]);

  // Manufactured Stock Available
  const mfcStock = useMemo(() => {
    const item = inventory.find(i => i.type === 'manufactured');
    return item ? item.quantity : 0;
  }, [inventory]);

  const rscStock = useMemo(() => {
    const item = inventory.find(i => i.type === 'resell');
    return item ? item.quantity : 0;
  }, [inventory]);

  // Rate Cards
  const mfcPrice = useMemo(() => {
    const item = inventory.find(i => i.type === 'manufactured');
    return item && item.price_per_cube ? parseFloat(item.price_per_cube) : 12.00;
  }, [inventory]);

  const rscPrice = useMemo(() => {
    const item = inventory.find(i => i.type === 'resell');
    return item && item.price_per_cube ? parseFloat(item.price_per_cube) : 18.50;
  }, [inventory]);

  // Place Self-Service Reorder
  const submitReorder = async ({ cube_type, quantity, payment_type = 'debt' }) => {
    if (!currentCustomer) throw new Error("No client selected");
    const unitPrice = cube_type === 'manufactured' ? mfcPrice : rscPrice;

    return await placeOrder({
      customer_id: currentCustomer.id,
      cube_type,
      quantity: parseInt(quantity, 10),
      price_per_cube: unitPrice,
      payment_type,
      created_by: `Client Portal (${currentCustomer.name})`
    });
  };

  // Generate & Download Account Statement PDF
  const downloadStatementPDF = () => {
    if (!currentCustomer) return;

    const doc = new jsPDF();
    const now = new Date();

    // Header
    doc.setFillColor(15, 23, 42); // Navy 900
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text("SAGACIOUS ICE FACTORY", 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text("WHOLESALE CLIENT STATEMENT OF ACCOUNT", 14, 28);
    doc.text(`Date: ${now.toLocaleDateString()}`, 150, 28);

    // Customer Info Card
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Statement For: ${currentCustomer.name}`, 14, 52);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Code: ${currentCustomer.customer_code || 'CUST-001'}`, 14, 58);
    doc.text(`WhatsApp: ${currentCustomer.whatsapp_number}`, 14, 64);
    if (currentCustomer.address) doc.text(`Address: ${currentCustomer.address}`, 14, 70);

    // Summary Box
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(120, 48, 76, 26, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text("ACCOUNT SUMMARY", 125, 55);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Billed: LKR ${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 125, 61);
    doc.text(`Total Paid: LKR ${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 125, 66);
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38); // Red
    doc.text(`Balance Due: LKR ${totalOutstandingDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 125, 71);

    // Table Data
    const tableData = customerSales.map(s => [
      new Date(s.sale_date).toLocaleDateString(),
      s.sale_code,
      s.cube_type === 'manufactured' ? 'Manufactured Cubes' : 'Resell Cubes',
      s.quantity,
      `LKR ${parseFloat(s.price_per_cube).toFixed(2)}`,
      `LKR ${parseFloat(s.total_amount).toFixed(2)}`,
      s.payment_type.toUpperCase()
    ]);

    doc.autoTable({
      startY: 78,
      head: [['Date', 'Order Ref', 'Item Description', 'Qty', 'Unit Rate', 'Total Amount', 'Terms']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillStyle: 'F', fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8 }
    });

    // Footer
    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text("Thank you for your business with Sagacious Ice Factory.", 14, finalY);
    doc.text("For statement inquiries, call: +94 77 123 4567 | info@sagaciousice.com", 14, finalY + 5);

    doc.save(`Statement_${currentCustomer.name.replace(/\s+/g, '_')}_${now.toISOString().slice(0,10)}.pdf`);
  };

  return {
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    currentCustomer,
    customerSales,
    customerDebts,
    totalBilled,
    totalPaid,
    totalOutstandingDebt,
    mfcStock,
    rscStock,
    mfcPrice,
    rscPrice,
    submitReorder,
    downloadStatementPDF,
    loadingCustomers
  };
}
