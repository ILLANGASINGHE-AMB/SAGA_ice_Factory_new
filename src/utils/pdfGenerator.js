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
  doc.text(`WhatsApp: ${sale.customer?.whatsapp_number || 'N/A'}`, 14, 72);
  doc.text(`Address: ${sale.customer?.address || 'N/A'}`, 14, 77);

  // Invoice Meta Section
  doc.setFont('Helvetica', 'bold');
  doc.text('TRANSACTION DETAILS:', 130, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Date & Time: ${new Date(sale.sale_date).toLocaleString()}`, 130, 67);
  doc.text(`Payment Method: ${sale.payment_type?.toUpperCase()}`, 130, 72);
  doc.text(`Operator: ${sale.created_by || 'System'}`, 130, 77);

  // Itemized table using jspdf-autotable
  const tableData = [
    [
      'Ice Cubes',
      sale.quantity.toLocaleString(),
      `LKR ${sale.price_per_cube.toFixed(2)}`,
      `LKR ${sale.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]
  ];

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
  doc.text(`WhatsApp: ${settlement.customer?.whatsapp_number || 'N/A'}`, 14, 72);
  doc.text(`Address: ${settlement.customer?.address || 'N/A'}`, 14, 77);

  // Receipt Meta Section
  doc.setFont('Helvetica', 'bold');
  doc.text('SETTLEMENT DETAILS:', 130, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Date & Time: ${new Date(settlement.settlement_date).toLocaleString()}`, 130, 67);
  doc.text(`Sale Reference: ${settlement.sale?.sale_code || 'N/A'}`, 130, 72);
  doc.text(`Authorized By: ${settlement.created_by || 'System'}`, 130, 77);

  // Summary Table of payments
  const tableData = [
    [
      `Settlement against Order Reference #${settlement.sale?.sale_code || 'N/A'}`,
      `LKR ${settlement.amount_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `LKR ${settlement.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      settlement.status?.toUpperCase()
    ]
  ];

  doc.autoTable({
    startY: 85,
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
export function generateReportPDF(reportTitle, dateStr, salesData, summaryData, settings) {
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

  // Summary Section Block
  doc.setFont('Helvetica', 'bold');
  doc.text('FINANCIAL SUMMARY:', 130, 62);
  doc.setFont('Helvetica', 'normal');
  doc.text(`Total Sales: LKR ${summaryData.totalRevenue.toLocaleString()}`, 130, 67);
  doc.text(`Cash Inflow: LKR ${summaryData.cashRevenue.toLocaleString()}`, 130, 72);
  doc.text(`Outstanding Credit: LKR ${summaryData.debtRevenue.toLocaleString()}`, 130, 77);

  // Itemized transactions table
  const tableHeaders = [['Date', 'Sale Code', 'Customer', 'Type', 'Qty', 'Amount', 'Payment']];
  const tableRows = salesData.map(sale => [
    new Date(sale.sale_date).toLocaleDateString(),
    sale.sale_code,
    sale.customerName || sale.customer?.name || 'Walk-in',
    sale.cube_type === 'manufactured' ? 'MFC' : 'RSC',
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
  doc.text(`Total Manufactured Cubes Sold: ${summaryData.mfcSold.toLocaleString()} units`, 14, finalY + 11);
  doc.text(`Total Resell Cubes Sold: ${summaryData.rscSold.toLocaleString()} units`, 14, finalY + 16);
  doc.text(`New Customer Signups: ${summaryData.newCustomersCount} customers`, 130, finalY + 11);
  doc.text(`Settlement Collection Inflow: LKR ${summaryData.totalSettled.toLocaleString()}`, 130, finalY + 16);

  drawFooter(doc);
  return doc;
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

  // Section 01. Stock / Production Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('01. STOCK / PRODUCTION DETAILS', 14, currentY);

  const stockData = reportData.stockDetails;
  doc.autoTable({
    startY: currentY + 3,
    head: [['Prev Balance', 'Production', 'Purchases', 'Brine Cubes', 'Free Issue', 'Damaged', 'Sales/Issue', 'Closing Balance']],
    body: [[
      stockData.previousDayBalance.toLocaleString(),
      stockData.todaysProduction.toLocaleString(),
      stockData.todaysPurchase.toLocaleString(),
      stockData.brineCubes.toLocaleString(),
      stockData.freeIssue.toLocaleString(),
      stockData.damagedCubes.toLocaleString(),
      stockData.todaysSalesQty.toLocaleString(),
      stockData.closingBalance.toLocaleString()
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85], halign: 'center' },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Section 02. Income Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('02. INCOME DETAILS', 14, currentY);

  const incData = reportData.incomeDetails;
  doc.autoTable({
    startY: currentY + 3,
    head: [['Location / Type', 'Cash Qty Sold', 'Cash Amount (LKR)', 'Credit Collected (LKR)', 'Other Receipts (LKR)', 'Total Income (LKR)']],
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

  // Section 03. Details of Credit Given Today
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('03. DETAILS OF CREDIT GIVEN TODAY', 14, currentY);

  const creditGivenRows = reportData.creditGivenList.length > 0
    ? reportData.creditGivenList.map(c => [c.no, c.location, c.customerName, c.phone, c.quantity.toLocaleString(), `LKR ${c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`])
    : [['-', 'No credit sales recorded today', '-', '-', '-', 'LKR 0.00']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['No.', 'Location', 'Customer Name', 'Telephone', 'Qty', 'Amount to be Received']],
    body: creditGivenRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 0: { width: 10, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Check Page Overflow
  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 04. Details of Credit Amount Collection / Repayment
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('04. CREDIT AMOUNT COLLECTION / REPAYMENT', 14, currentY);

  const creditCollectionRows = reportData.creditCollectionList.length > 0
    ? reportData.creditCollectionList.map(c => [c.name, c.method, `LKR ${c.amountReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, `LKR ${c.outstandingAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`])
    : [['No debt settlements recorded today', '-', 'LKR 0.00', 'LKR 0.00']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['Name of Person / Customer', 'Method of Receipt', 'Amount Received', 'Outstanding Amount']],
    body: creditCollectionRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 }
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
    ? reportData.expenseList.map(e => [e.code, e.description, e.rupees.toLocaleString(), e.cents])
    : [['-', 'No expenses logged today', '0', '00']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['Bill / Ref No.', 'Description', 'Rupees (LKR)', 'Cents']],
    body: expRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' } },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 06. Cash Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('06. CASH DETAILS', 14, currentY);

  const cashData = reportData.cashDetails;
  doc.autoTable({
    startY: currentY + 3,
    head: [['Amount Deposited in Bank', 'Cash Balance on Hand', 'Value of Cheques on Hand']],
    body: [[
      `LKR ${cashData.bankDepositAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${cashData.cashOnHand.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${cashData.chequesOnHand.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontSize: 7.5, halign: 'center' },
    bodyStyles: { fontSize: 8, textColor: [51, 65, 85], halign: 'center' },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 230) {
    doc.addPage();
    currentY = 20;
  }

  // Section 07. Employee Work Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('07. EMPLOYEE WORK DETAILS', 14, currentY);

  const empRows = reportData.employeeLogs.length > 0
    ? reportData.employeeLogs.map(e => [e.name, e.position, e.startTime, e.finishTime])
    : [['No employee shift logs entered', '-', '-', '-']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['Employee Name', 'Work Location / Position', 'Starting Time', 'Finishing Time']],
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

  // Section 08. Vehicle Travel Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('08. VEHICLE TRAVEL DETAILS', 14, currentY);

  const vehRows = reportData.vehicleLogs.length > 0
    ? reportData.vehicleLogs.map(v => [v.reason, v.route, v.startReading, v.endReading])
    : [['No vehicle travel logs entered', '-', '-', '-']];

  doc.autoTable({
    startY: currentY + 3,
    head: [['Reason for Journey', 'Location / Route Travelled', 'Start Meter Reading', 'Arrival Meter Reading']],
    body: vehRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [51, 65, 85] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // Section 09. Other Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('09. OTHER DETAILS / INCIDENTS', 14, currentY);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(reportData.otherDetails || 'None reported for today.', 14, currentY + 5);

  currentY += 18;

  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  // Section 10. Declaration / Verification
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.rect(14, currentY, 182, 28, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('10. DECLARATION / VERIFICATION', 18, currentY + 6);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('I hereby certify that I have personally checked and verified the above information and that all information provided is correct.', 18, currentY + 12);

  doc.setFont('Helvetica', 'bold');
  doc.text(`Verified By Manager: ${reportData.verifiedBy || '_______________________'}`, 18, currentY + 22);
  doc.text(`Date: ${reportData.reportDate}`, 120, currentY + 22);

  drawFooter(doc);
  return doc;
}

