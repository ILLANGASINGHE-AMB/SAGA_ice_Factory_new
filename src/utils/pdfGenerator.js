import jsPDF from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

applyPlugin(jsPDF);

// Helper to extract image format from data URL
function getImageFormat(dataUrl) {
  if (!dataUrl) return 'PNG';
  const match = dataUrl.match(/^data:image\/([a-zA-Z+]+);base64,/);
  if (match) {
    const ext = match[1].toUpperCase();
    if (ext === 'JPEG' || ext === 'JPG') return 'JPEG';
    if (ext === 'PNG') return 'PNG';
    if (ext === 'WEBP') return 'WEBP';
    return ext;
  }
  return 'PNG';
}

// Helper to draw clean invoice headers
function drawHeader(doc, settings, title, uniqueCode) {
  const companyName = settings?.company_name || 'Sagacious Ice Factory';
  const companyAddress = settings?.company_address || 'Colombo, Sri Lanka';
  const companyPhone = settings?.company_phone || 'N/A';
  const companyEmail = settings?.company_email || 'N/A';

  // Draw logo
  if (settings?.logo_url) {
    try {
      const format = getImageFormat(settings.logo_url);
      doc.addImage(settings.logo_url, format, 14, 15, 20, 20);
    } catch (e) {
      console.error("Failed to add logo image to PDF:", e);
      // Fallback stylized branding logo box (top left)
      doc.setFillColor(15, 23, 42); // Navy-900
      doc.rect(14, 15, 20, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('S', 22, 28);
    }
  } else {
    // Draw stylized branding logo box (top left)
    doc.setFillColor(15, 23, 42); // Navy-900
    doc.rect(14, 15, 20, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('S', 22, 28);
  }

  // Company details (top right)
  doc.setTextColor(51, 65, 85); // Slate-700
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(companyName, 200, 19, { align: 'right' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(companyAddress, 200, 24, { align: 'right' });
  doc.text(`Phone: ${companyPhone}  |  Email: ${companyEmail}`, 200, 29, { align: 'right' });

  // Title block
  doc.setDrawColor(226, 232, 240); // border-slate-200
  doc.setLineWidth(0.5);
  doc.line(14, 40, 200, 40);

  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title.toUpperCase(), 14, 50);

  doc.setTextColor(94, 108, 132);
  doc.setFontSize(10);
  doc.text(`#${uniqueCode}`, 200, 50, { align: 'right' });
}

// Helper to draw clean invoice footers
function drawFooter(doc) {
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 275, 200, 275);
  
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.setFontSize(8);
  doc.setFont('Helvetica', 'italic');
  doc.text('Thank you for your business!', 105, 282, { align: 'center' });
  
  const generatedTime = new Date().toLocaleString();
  doc.text(`Generated: ${generatedTime}`, 200, 282, { align: 'right' });
}

// 1. Generate Bill PDF
export function generateBillPDF(sale, settings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  drawHeader(doc, settings, 'Sales Invoice', sale.sale_code);

  // Customer Section
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILL TO:', 14, 62);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Customer Name: ${sale.customer?.name || 'Walk-in Customer'}`, 14, 67);
  doc.text(`WhatsApp: ${sale.customer?.whatsapp_number || sale.customer?.contact_number || 'N/A'}`, 14, 72);
  doc.text(`Address: ${sale.customer?.address || 'N/A'}`, 14, 77);

  // Invoice Meta Section
  doc.setFont('Helvetica', 'bold');
  doc.text('TRANSACTION DETAILS:', 130, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Date & Time: ${new Date(sale.sale_date).toLocaleString()}`, 130, 67);
  doc.text(`Payment Method: ${sale.payment_type?.toUpperCase()}`, 130, 72);
  doc.text(`Operator: ${sale.created_by || 'System'}`, 130, 77);

  // Itemized table using jspdf-autotable — one row per line item so a
  // multi cube-type order (e.g. Production + Resell in one bill) lists each
  // type separately. Falls back to a single legacy row built from the
  // scalar sale fields if sale_items wasn't loaded (defensive only — every
  // sale has at least one line item after the multi-item orders migration).
  const lineItems = sale.sale_items?.length
    ? sale.sale_items
    : [{ cube_type: sale.cube_type, quantity: sale.quantity, price_per_cube: sale.price_per_cube, subtotal: sale.total_amount }];

  const tableData = lineItems.map(item => [
    `Ice Cubes (${item.cube_type === 'manufactured' ? 'Production' : 'Resell'})`,
    item.quantity.toLocaleString(),
    `LKR ${Number(item.price_per_cube).toFixed(2)}`,
    `LKR ${Number(item.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ]);

  doc.autoTable({
    startY: 85,
    head: [['Item Description', 'Quantity', 'Rate', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { width: 90 },
      1: { halign: 'center', width: 30 },
      2: { halign: 'right', width: 30 },
      3: { halign: 'right', width: 36 }
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const colStyles = data.table?.styles?.columnStyles || data.settings?.columnStyles || {};
        const colStyle = colStyles[data.column.index];
        if (colStyle && colStyle.halign) {
          data.cell.styles.halign = colStyle.halign;
        }
      }
    }
  });

  // Grand Total Block
  const finalY = doc.lastAutoTable.finalY + 10;
  
  doc.setDrawColor(241, 245, 249);
  doc.setFillColor(248, 250, 252);
  doc.rect(120, finalY, 80, 22, 'FD');
  
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text('Subtotal:', 124, finalY + 7);
  doc.text('GRAND TOTAL:', 124, finalY + 15);
  
  doc.setFont('Helvetica', 'normal');
  doc.text(`LKR ${sale.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 196, finalY + 7, { align: 'right' });
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`LKR ${sale.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 196, finalY + 15, { align: 'right' });

  // Payment Status Notice
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  if (sale.payment_type === 'debt') {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(254, 226, 226);
    doc.rect(14, finalY, 95, 22, 'FD');
    doc.setTextColor(185, 28, 28);
    doc.setFont('Helvetica', 'bold');
    doc.text('CREDIT BALANCE NOTICE', 18, finalY + 7);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('This invoice was issued on credit terms. The amount is recorded', 18, finalY + 12);
    doc.text('in your pending debts statement.', 18, finalY + 16);
  } else {
    doc.setFillColor(240, 253, 250);
    doc.setDrawColor(204, 251, 241);
    doc.rect(14, finalY, 95, 22, 'FD');
    doc.setTextColor(15, 118, 110);
    doc.setFont('Helvetica', 'bold');
    doc.text('TRANSACTION PAID', 18, finalY + 7);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Thank you! This invoice has been settled in full via cash', 18, finalY + 12);
    doc.text('on the date of purchase.', 18, finalY + 16);
  }

  drawFooter(doc);
  return doc;
}

export function generateBillPDFBlob(sale, settings) {
  const doc = generateBillPDF(sale, settings);
  return doc.output('blob');
}

// 1b. Generate Debt Statement PDF — the Debt History "Download PDF": shows
// the debt's total amount and its full paid history, and (once settled)
// the settled amount/date instead of an outstanding balance.
export function generateDebtStatementPDF(debt, settings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const isSettled = debt.status === 'settled';

  drawHeader(doc, settings, 'Debt Statement', debt.sale?.sale_code || `DEBT-${debt.id}`);

  // Customer Section
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CUSTOMER DETAILS:', 14, 62);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Customer Name: ${debt.customer?.name || 'Walk-in Customer'}`, 14, 67);
  doc.text(`WhatsApp: ${debt.customer?.whatsapp_number || debt.customer?.contact_number || 'N/A'}`, 14, 72);
  doc.text(`Address: ${debt.customer?.address || 'N/A'}`, 14, 77);

  // Debt Meta Section
  doc.setFont('Helvetica', 'bold');
  doc.text('DEBT DETAILS:', 130, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Sale Reference: ${debt.sale?.sale_code || 'N/A'}`, 130, 67);
  doc.text(`Date Issued: ${new Date(debt.created_at).toLocaleDateString()}`, 130, 72);
  doc.text(`Total Debt Amount: LKR ${Number(debt.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 130, 77);
  doc.text(`Status: ${debt.status?.toUpperCase() || 'N/A'}`, 130, 82);

  // Paid History
  const settlements = (debt.debt_settlements || [])
    .slice()
    .sort((a, b) => new Date(a.settlement_date) - new Date(b.settlement_date));

  const tableData = settlements.length
    ? settlements.map(s => [
        new Date(s.settlement_date).toLocaleDateString(),
        `LKR ${Number(s.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        (s.payment_method || 'cash').replace('_', ' ').toUpperCase(),
        s.notes || '-'
      ])
    : [['-', '-', '-', 'No payments recorded yet']];

  doc.autoTable({
    startY: 90,
    head: [['Date', 'Amount Paid', 'Method', 'Note']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { width: 30 },
      1: { halign: 'right', width: 35 },
      2: { halign: 'center', width: 35 },
      3: { width: 76 }
    }
  });

  // Summary Box: settled amount/date when settled, otherwise the running balance
  const finalY = doc.lastAutoTable.finalY + 10;
  const boxHeight = isSettled ? 28 : 20;

  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(120, finalY, 80, boxHeight, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);

  if (isSettled) {
    const lastSettlement = settlements[settlements.length - 1];
    doc.text('Settled Amount:', 124, finalY + 7);
    doc.text('Settled Date:', 124, finalY + 14);
    doc.text('Remaining Debt:', 124, finalY + 21);

    doc.setFont('Helvetica', 'normal');
    doc.text(`LKR ${Number(debt.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 196, finalY + 7, { align: 'right' });
    doc.text(lastSettlement ? new Date(lastSettlement.settlement_date).toLocaleDateString() : 'N/A', 196, finalY + 14, { align: 'right' });
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text('LKR 0.00', 196, finalY + 21, { align: 'right' });
  } else {
    doc.text('Amount Paid:', 124, finalY + 7);
    doc.text('Remaining Debt:', 124, finalY + 14);

    doc.setFont('Helvetica', 'normal');
    doc.text(`LKR ${Number(debt.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 196, finalY + 7, { align: 'right' });
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text(`LKR ${Number(debt.remaining_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 196, finalY + 14, { align: 'right' });
  }

  drawFooter(doc);
  return doc;
}


// 2. Generate Debt Settlement Receipt PDF
export function generateSettlementReceiptPDF(settlement, settings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  drawHeader(doc, settings, 'Debt Settlement Receipt', settlement.settlement_code);

  // Customer Section
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CUSTOMER DETAILS:', 14, 62);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Customer Name: ${settlement.customer?.name || 'Walk-in Customer'}`, 14, 67);
  doc.text(`WhatsApp: ${settlement.customer?.whatsapp_number || settlement.customer?.contact_number || 'N/A'}`, 14, 72);
  doc.text(`Address: ${settlement.customer?.address || 'N/A'}`, 14, 77);

  // Receipt Meta Section
  // settlement.settlements, when present, is a per-debt breakdown of a single
  // customer-level payment applied FIFO across several outstanding sales —
  // show every covered sale reference instead of just one.
  const saleRefText = settlement.settlements?.length
    ? settlement.settlements.map(s => s.sale_code).filter(Boolean).join(', ') || 'N/A'
    : (settlement.sale?.sale_code || 'N/A');

  doc.setFont('Helvetica', 'bold');
  doc.text('SETTLEMENT DETAILS:', 130, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Date & Time: ${new Date(settlement.settlement_date).toLocaleString()}`, 130, 67);
  doc.text(`Sale Reference: ${saleRefText}`, 130, 72);
  doc.text(`Payment Method: ${(settlement.payment_method || 'cash').replace('_', ' ').toUpperCase()}`, 130, 77);
  doc.text(`Authorized By: ${settlement.created_by || 'System'}`, 130, 82);

  let tableStartY = 90;
  if (settlement.notes) {
    doc.text(`Note: ${settlement.notes}`, 130, 87);
    tableStartY = 95;
  }

  // Summary Table of payments
  const tableData = settlement.settlements?.length
    ? settlement.settlements.map(s => [
        `Settlement against Order Reference #${s.sale_code || 'N/A'}`,
        `LKR ${Number(s.amount_applied).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `LKR ${Number(s.remaining_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        s.status?.toUpperCase()
      ])
    : [
        [
          `Settlement against Order Reference #${settlement.sale?.sale_code || 'N/A'}`,
          `LKR ${settlement.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `LKR ${settlement.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          settlement.status?.toUpperCase()
        ]
      ];

  doc.autoTable({
    startY: tableStartY,
    head: [['Description', 'Amount Paid', 'Remaining Debt', 'New Status']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { width: 90 },
      1: { halign: 'right', width: 30 },
      2: { halign: 'right', width: 30 },
      3: { halign: 'center', width: 36 }
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const colStyles = data.table?.styles?.columnStyles || data.settings?.columnStyles || {};
        const colStyle = colStyles[data.column.index];
        if (colStyle && colStyle.halign) {
          data.cell.styles.halign = colStyle.halign;
        }
      }
    }
  });

  // Stamp Box
  const finalY = doc.lastAutoTable.finalY + 15;
  doc.setDrawColor(16, 185, 129);
  doc.setFillColor(240, 253, 250);
  doc.setLineWidth(1);
  doc.rect(70, finalY, 70, 20, 'FD');
  doc.setTextColor(15, 118, 110);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('RECEIPTED & VERIFIED', 105, finalY + 8, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`LKR ${settlement.amount_paid.toLocaleString()} Paid`, 105, finalY + 14, { align: 'center' });

  drawFooter(doc);
  return doc;
}

// 3. Generate Analytical Report PDF
export function generateReportPDF(reportTitle, dateStr, salesData, summaryData, settings, showFinancialSummary = true) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const reportCode = `REPT-${Date.now().toString().slice(-6)}`;
  drawHeader(doc, settings, reportTitle, reportCode);

  // Period Meta Section
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('REPORT PARAMETERS:', 14, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Type: ${reportTitle}`, 14, 67);
  doc.text(`Period: ${dateStr}`, 14, 72);

  // Summary Section Block — gated the same way the on-screen preview hides
  // this strip for Debtors/Customer Details reports, where these figures
  // (cash vs debt split, outstanding credit) don't apply cleanly.
  if (showFinancialSummary) {
    doc.setFont('Helvetica', 'bold');
    doc.text('FINANCIAL SUMMARY:', 130, 62);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Total Sales: LKR ${summaryData.totalRevenue.toLocaleString()}`, 130, 67);
    doc.text(`Cash Inflow: LKR ${summaryData.cashRevenue.toLocaleString()}`, 130, 72);
    // debtRevenue is gross credit sales issued in the period — it must be
    // netted against settlements collected in that same period, or this
    // overstates the true outstanding balance whenever some of the period's
    // credit sales were already paid off within the period.
    const netOutstandingCredit = Math.max(0, (summaryData.debtRevenue || 0) - (summaryData.totalSettled || 0));
    doc.text(`Outstanding Credit: LKR ${netOutstandingCredit.toLocaleString()}`, 130, 77);
  }

  // Itemized transactions table
  const tableHeaders = [['Date', 'Sale Code', 'Customer', 'Type', 'Qty', 'Amount', 'Payment']];
  const tableRows = salesData.map(sale => [
    new Date(sale.sale_date).toLocaleDateString(),
    sale.sale_code,
    sale.customerName || sale.customer?.name || 'Walk-in',
    sale.cube_type === 'manufactured' ? 'MFC' : sale.cube_type === 'resell' ? 'RSC' : 'MIXED',
    sale.quantity.toLocaleString(),
    `LKR ${sale.total_amount.toLocaleString()}`,
    sale.payment_type.toUpperCase()
  ]);

  doc.autoTable({
    startY: 85,
    head: tableHeaders,
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { width: 22 },
      1: { width: 22 },
      2: { width: 50 },
      3: { halign: 'center', width: 15 },
      4: { halign: 'right', width: 20 },
      5: { halign: 'right', width: 30 },
      6: { halign: 'center', width: 27 }
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const colStyles = data.table?.styles?.columnStyles || data.settings?.columnStyles || {};
        const colStyle = colStyles[data.column.index];
        if (colStyle && colStyle.halign) {
          data.cell.styles.halign = colStyle.halign;
        }
      }
    }
  });

  // Render extra summaries after table if space permits
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('AGGREGATE STATISTICS:', 14, finalY + 5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Total Production Cubes Sold: ${summaryData.mfcSold.toLocaleString()} units`, 14, finalY + 11);
  doc.text(`Total Resell Cubes Sold: ${summaryData.rscSold.toLocaleString()} units`, 14, finalY + 16);
  doc.text(`New Customer Signups: ${summaryData.newCustomersCount} customers`, 130, finalY + 11);
  doc.text(`Settlement Collection Inflow: LKR ${summaryData.totalSettled.toLocaleString()}`, 130, finalY + 16);

  drawFooter(doc);
  return doc;
}

// Wrap a header label so its alignment always matches its column's data
// alignment (columnStyles halign does not reliably win over headStyles in
// jspdf-autotable, which was causing right-aligned numeric columns to show
// a left-aligned header sitting over right-aligned values).
function headCell(text, halign) {
  return { content: text, styles: { halign } };
}

// 4. Generate Daily Manager Report PDF (newReport.md specification)
export function generateDailyManagerReportPDF(reportData, settings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const reportCode = `DMR-${reportData.reportDate.replace(/-/g, '')}`;
  drawHeader(doc, settings, 'Daily Manager Report', reportCode);

  let currentY = 58;

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const dateLabel = reportData.reportDateFrom === reportData.reportDateTo
    ? reportData.reportDateFrom
    : `${reportData.reportDateFrom} to ${reportData.reportDateTo}`;
  doc.text(`Date: ${dateLabel}     Time: ${reportData.reportTimeFrom || '00:00'} - ${reportData.reportTimeTo || '23:59'}`, 14, currentY);

  currentY += 8;

  // Section 01. Stock / Production Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('01. STOCK / PRODUCTION DETAILS', 14, currentY);

  const stockData = reportData.stockDetails;
  doc.autoTable({
    startY: currentY + 3,
    head: [['Prev Balance', 'Production', 'Purchases', 'Brine Cubes', 'Free Issue', 'Damaged', 'Sales/Issue', 'Sent to Branch', 'Closing Balance']],
    body: [[
      stockData.previousDayBalance.toLocaleString(),
      stockData.todaysProduction.toLocaleString(),
      stockData.todaysPurchase.toLocaleString(),
      stockData.brineCubes.toLocaleString(),
      stockData.freeIssue.toLocaleString(),
      stockData.damagedCubes.toLocaleString(),
      stockData.todaysSalesQty.toLocaleString(),
      stockData.branchCubes.toLocaleString(),
      stockData.closingBalance.toLocaleString()
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85], halign: 'center' },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  // Branch cube breakdown — one line per branch saved in Settings, plus a total.
  // Any number of branches can exist, so this is a small text block rather
  // than fixed table columns.
  if (stockData.branchSalesList && stockData.branchSalesList.length > 0) {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    stockData.branchSalesList.forEach(b => {
      doc.text(`No of Cubes Sent to ${b.branchName} - ${b.quantity.toLocaleString()}`, 14, currentY);
      currentY += 4;
    });
    doc.setFont('Helvetica', 'bold');
    doc.text(`Total Cubes Sent:- ${stockData.branchCubes.toLocaleString()}`, 14, currentY);
    currentY += 4;
  }

  currentY += 4;

  // Section 02. Income Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('02. INCOME DETAILS', 14, currentY);

  const incData = reportData.incomeDetails;
  doc.autoTable({
    startY: currentY + 3,
    head: [['Location / Type', headCell('Cash Qty Sold', 'center'), headCell('Cash Amount (LKR)', 'right'), headCell('Credit Collected (LKR)', 'right'), headCell('Other Receipts (LKR)', 'right'), headCell('Total Income (LKR)', 'right')]],
    body: [[
      'Main Plant Operations',
      incData.cashSoldQty.toLocaleString(),
      incData.cashSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      incData.creditAmountReceived.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      incData.otherReceipts.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      incData.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7.5, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85] },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Section 03. Debt Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('03. DEBT DETAILS', 14, currentY);

  const creditGivenRows = reportData.creditGivenList.length > 0
    ? reportData.creditGivenList.map(c => [c.no, c.customerName, c.phone, c.quantity.toLocaleString(), `LKR ${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, `LKR ${c.totalDebtBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`])
    : [['-', 'No debt given recorded', '-', '-', 'LKR 0.00', 'LKR 0.00']];

  doc.autoTable({
    startY: currentY + 3,
    head: [[headCell('No.', 'center'), 'Customer Name', 'Phone No', headCell('Cubes on Debt', 'right'), headCell('Amount LKR', 'right'), headCell('Total Debt Balance LKR', 'right')]],
    body: creditGivenRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 0: { width: 10, halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [['', '', '', 'Total:', `LKR ${reportData.totalCreditGivenAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Check Page Overflow
  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 04. Debt Settle Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('04. DEBT SETTLE DETAILS', 14, currentY);

  const creditCollectionRows = reportData.creditCollectionList.length > 0
    ? reportData.creditCollectionList.map((c, idx) => [idx + 1, c.name, c.method, c.settlementDate, `LKR ${c.debtAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, `LKR ${c.amountReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, `LKR ${c.outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`])
    : [['-', 'No debt settlements recorded', '-', '-', 'LKR 0.00', 'LKR 0.00', 'LKR 0.00']];

  doc.autoTable({
    startY: currentY + 3,
    head: [[headCell('No.', 'center'), 'Customer Name', 'Payment Method', 'Settlement Date', headCell('Debt Amount LKR', 'right'), headCell('Paid Debt LKR', 'right'), headCell('Remaining Debt LKR', 'right')]],
    body: creditCollectionRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 0: { width: 10, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [['', '', '', '', 'Total:', `LKR ${reportData.totalCreditCollectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 05. Expense Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('05. EXPENSE DETAILS', 14, currentY);

  const expRows = reportData.expenseList.length > 0
    ? reportData.expenseList.map(e => [e.no, e.date, e.description, e.category, e.expenseType, e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })])
    : [['-', '-', 'No expenses logged', '-', '-', '0.00']];

  doc.autoTable({
    startY: currentY + 3,
    head: [[headCell('No.', 'center'), 'Date', 'Description', 'Expense Category', 'Expense Type', headCell('Amount LKR', 'right')]],
    body: expRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 0: { width: 10, halign: 'center' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [['', '', '', '', 'Total:', reportData.totalExpensesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })]],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 06. Bank Deposit Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('06. BANK DEPOSIT DETAILS', 14, currentY);

  const cashData = reportData.cashDetails;
  doc.autoTable({
    startY: currentY + 3,
    head: [['Amount Deposited', 'Cash in Hand (after deposit)', 'Hand Cheque Amount']],
    body: [[
      `LKR ${(cashData?.bankDepositAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${(cashData?.cashOnHand || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${(cashData?.chequesOnHand || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85], halign: 'center' },
    margin: { left: 14, right: 14 },
    foot: [['Total:', `LKR ${(cashData?.totalBankDeposit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5, halign: 'center' }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 07. Employee Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('07. EMPLOYEE DETAILS', 14, currentY);

  const empRows = reportData.employeeAttendanceList.length > 0
    ? reportData.employeeAttendanceList.map(e => [e.employeeName, e.date, e.startTime, e.endTime])
    : [['No employee attendance recorded', '-', '-', '-']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['Employee Name', 'Date', 'Start Time', 'End Time']],
    body: empRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 08. Vehicle Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('08. VEHICLE DETAILS', 14, currentY);

  const vehRows = reportData.vehicleTripList.length > 0
    ? reportData.vehicleTripList.map(v => [
        v.no,
        v.tripId,
        v.date,
        v.description || '-',
        v.startKm.toLocaleString(),
        v.endKm !== null ? v.endKm.toLocaleString() : '-',
        v.distance !== null ? `${v.distance.toLocaleString()} km` : '-'
      ])
    : [['-', '-', '-', 'No vehicle trips recorded', '-', '-', '-']];

  doc.autoTable({
    startY: currentY + 3,
    head: [[headCell('No.', 'center'), 'Trip ID', 'Date', 'Description', headCell('Start Km', 'right'), headCell('End Km', 'right'), headCell('Total Distance', 'right')]],
    body: vehRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 0: { width: 10, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [['', '', '', '', '', 'Total:', `${(reportData.totalVehicleDistance || 0).toLocaleString()} km`]],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7.5 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // Section 09. Notes
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('09. NOTES', 14, currentY);

  const notesRows = reportData.notesList.length > 0
    ? reportData.notesList.map(n => [n.text, n.createdBy, new Date(n.createdAt).toLocaleString()])
    : [['No notes recorded', '-', '-']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['Note', 'By', 'Date/Time']],
    body: notesRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  if (reportData.otherDetails) {
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Additional Incident Notes: ${reportData.otherDetails}`, 14, currentY + 4);
    currentY += 10;
  } else {
    currentY += 4;
  }

  if (currentY > 225) {
    doc.addPage();
    currentY = 20;
  }

  // Section 10. Declaration / Verification
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(14, currentY, 182, 34, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('10. DECLARATION / VERIFICATION', 18, currentY + 6);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('I hereby certify that I have personally checked and verified the above information and that all information provided is correct.', 18, currentY + 12);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Name: ${reportData.verifiedBy || '......................................'}`, 18, currentY + 22);
  doc.text('Signature: ..................................', 110, currentY + 22);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Date and Time Generated: ${new Date().toLocaleString()}`, 18, currentY + 29);

  currentY += 40;

  doc.setFont('Helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('System Generated Report', 105, Math.min(currentY, 268), { align: 'center' });

  drawFooter(doc);
  return doc;
}

