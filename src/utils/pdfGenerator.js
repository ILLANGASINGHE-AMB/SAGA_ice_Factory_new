import jsPDF from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { toLocalDateTimeStr } from './date';

applyPlugin(jsPDF);

// Shared flat, letterhead-style palette — mirrors the on-screen "Report Live
// Preview" (ReportsPage.jsx) and the app's own Badge.jsx pill colors, so
// every generated PDF (bills, statements, receipts, reports) looks like the
// same document system instead of each function picking its own colors.
const INK = [15, 23, 42];        // Slate-900 — headings, primary values
const BODY = [51, 65, 85];       // Slate-700 — body text
const LABEL = [100, 116, 139];   // Slate-500 — uppercase field/section labels
const MUTED = [148, 163, 184];   // Slate-400 — secondary/footer text
const BORDER = [226, 232, 240];  // Slate-200 — dividers, card borders, table lines
const CARD_BG = [248, 250, 252]; // Slate-50 — card/table-header fills
const NAVY = [2, 132, 199];      // navy-600 (this app's brand accent) — titles, links

// Badge colors — lifted 1:1 from Badge.jsx's Tailwind classes so PDF pills
// match the in-app pills exactly.
const GREEN_BG = [220, 252, 231], GREEN_TEXT = [22, 101, 52];     // cash / MFC
const ROSE_BG = [255, 228, 230], ROSE_TEXT = [159, 18, 57];       // debt
const SKY_BG = [224, 242, 254], SKY_TEXT = [7, 89, 133];          // RSC
const ORANGE_BG = [255, 237, 213], ORANGE_TEXT = [154, 52, 18];   // BNC / partial
const EMERALD_BG = [209, 250, 229], EMERALD_TEXT = [6, 95, 70];   // settled
const RED_BG = [254, 226, 226], RED_TEXT = [153, 27, 27];        // pending
const SLATE_BG = [241, 245, 249], SLATE_TEXT = [30, 41, 59];      // mixed / default
const TEAL_TEXT = [13, 148, 136];                                 // settlements inflow accent

const BADGE_COLORS = {
  cash: [GREEN_BG, GREEN_TEXT],
  CASH: [GREEN_BG, GREEN_TEXT],
  debt: [ROSE_BG, ROSE_TEXT],
  DEBT: [ROSE_BG, ROSE_TEXT],
  MFC: [GREEN_BG, GREEN_TEXT],
  RSC: [SKY_BG, SKY_TEXT],
  BNC: [ORANGE_BG, ORANGE_TEXT],
  MIXED: [SLATE_BG, SLATE_TEXT],
  pending: [RED_BG, RED_TEXT],
  PENDING: [RED_BG, RED_TEXT],
  partial: [ORANGE_BG, ORANGE_TEXT],
  PARTIAL: [ORANGE_BG, ORANGE_TEXT],
  settled: [EMERALD_BG, EMERALD_TEXT],
  SETTLED: [EMERALD_BG, EMERALD_TEXT]
};
function badgeColor(type) {
  return BADGE_COLORS[type] || [SLATE_BG, SLATE_TEXT];
}

// Draws a small rounded pill (rounded rect + centered bold text), sized to
// fit its text. cx/cyCenter are the pill's horizontal/vertical center, so
// the same helper drops into a table cell or a standalone status box.
function drawPill(doc, text, cx, cyCenter, bg, fg, fontSize = 7) {
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(fontSize);
  const textW = doc.getTextWidth(text);
  const padX = 2.4;
  const pillW = textW + padX * 2;
  const pillH = fontSize * 0.62 + 2.6;
  const x = cx - pillW / 2;
  const y = cyCenter - pillH / 2;
  doc.setFillColor(bg[0], bg[1], bg[2]);
  doc.roundedRect(x, y, pillW, pillH, pillH / 2, pillH / 2, 'F');
  doc.setTextColor(fg[0], fg[1], fg[2]);
  doc.text(text, cx, cyCenter + fontSize * 0.32, { align: 'center' });
  return pillW;
}

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

// Fallback letterhead mark used when no logo is configured in Settings.
function drawMonogram(doc) {
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 10, 16, 16, 2, 2, 'FD');
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('S', 22, 20.5, { align: 'center' });
}

// Helper to draw a clean, flat letterhead header — logo/monogram + company
// details on the left, document title + a meta line (code or date range) on
// the right, closed off with a dashed divider. Used by every PDF so bills,
// statements, receipts, and reports all share one letterhead. Returns the Y
// position callers should start their content at (grows if the title/meta
// text wraps onto extra lines).
function drawHeader(doc, settings, title, metaText) {
  const companyName = settings?.company_name || 'Sagacious Ice Factory';
  const companyAddress = settings?.company_address || 'Colombo, Sri Lanka';
  const companyPhone = settings?.company_phone || 'N/A';
  const companyEmail = settings?.company_email || 'N/A';

  if (settings?.logo_url) {
    try {
      const format = getImageFormat(settings.logo_url);
      doc.addImage(settings.logo_url, format, 14, 10, 16, 16);
    } catch (e) {
      console.error("Failed to add logo image to PDF:", e);
      drawMonogram(doc);
    }
  } else {
    drawMonogram(doc);
  }

  const textX = 34;
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName, textX, 18);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(companyAddress, textX, 23.5);
  doc.setFontSize(7.5);
  doc.text(`Phone: ${companyPhone}   Email: ${companyEmail}`, textX, 28);

  // Right column (title + meta) is hard-capped to a fixed-width lane ending
  // at x=196, so even a long meta string (e.g. a custom report's date range
  // plus customer/cube/payment filter chips) wraps onto extra lines instead
  // of running into the company block on the left.
  const rightColWidth = 76;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  const titleLines = doc.splitTextToSize(title.toUpperCase(), rightColWidth);
  let cursorY = 18;
  titleLines.forEach(line => {
    doc.text(line, 196, cursorY, { align: 'right' });
    cursorY += 4.5;
  });

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  cursorY += 1;
  const metaLines = doc.splitTextToSize(metaText, rightColWidth);
  metaLines.forEach(line => {
    doc.text(line, 196, cursorY, { align: 'right' });
    cursorY += 3.8;
  });
  doc.setFont('Helvetica', 'normal');

  const dividerY = Math.max(34, cursorY + 2);
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.2, 1], 0);
  doc.line(14, dividerY, 196, dividerY);
  doc.setLineDashPattern([], 0);

  return dividerY + 8; // content start Y for callers
}

// Helper to draw a clean, flat footer — thin divider + muted centered note +
// generated timestamp. leftText lets bills say "Thank you for your
// business!" while reports say "{Company} Ledger Reports".
function drawFooter(doc, leftText = 'Thank you for your business!') {
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(0.4);
  doc.line(14, 275, 196, 275);

  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.setFontSize(8);
  doc.setFont('Helvetica', 'italic');
  doc.text(leftText, 105, 282, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  const generatedTime = new Date().toLocaleString();
  doc.text(`Generated: ${generatedTime}`, 196, 282, { align: 'right' });
}

// Draws a section field label the way the on-screen preview does — small,
// bold, uppercase, muted gray (no trailing colon).
function fieldLabel(doc, text, x, y) {
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
  doc.text(text.toUpperCase(), x, y);
}

function fieldLine(doc, text, x, y) {
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(BODY[0], BODY[1], BODY[2]);
  doc.text(text, x, y);
}

// The customer's outstanding balance, printed on every document alongside the
// transaction it is about, so the paper answers "and what do I still owe?"
// without the customer having to ask. Two lines, always together: the figure
// changes with every order and every payment, so it is worthless without the
// timestamp saying when it was true.
//
// Drawn in rose when something is owed and emerald when nothing is, matching
// the on-screen ledger. Returns the Y the caller should continue at.
function drawOutstandingLines(doc, record, x, y) {
  const total = Number(record?.customer_debt_total) || 0;
  const asOf = record?.customer_debt_updated_at;

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  const [r, g, b] = total > 0 ? ROSE_TEXT : EMERALD_TEXT;
  doc.setTextColor(r, g, b);
  doc.text(
    `Existing Debt to Pay: LKR ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    x, y
  );

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(`Debt last updated: ${asOf ? toLocalDateTimeStr(asOf) : 'No debt activity'}`, x, y + 4.2);

  return y + 4.2;
}

// Shared flat table defaults — thin light-gray grid lines, light-gray
// uppercase header instead of a solid colored fill.
const TABLE_STYLE_DEFAULTS = {
  theme: 'grid',
  styles: { lineColor: BORDER, lineWidth: 0.1, cellPadding: 2 },
  headStyles: { fillColor: CARD_BG, textColor: LABEL, fontStyle: 'bold', fontSize: 8.5 }
};

// 1. Generate Bill PDF
export function generateBillPDF(sale, settings) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const y0 = drawHeader(doc, settings, 'Sales Invoice', `#${sale.sale_code}`);
  fieldLabel(doc, 'Bill To', 14, y0);
  fieldLine(doc, `Customer Name: ${sale.customer?.name || 'Walk-in Customer'}`, 14, y0 + 5.5);
  fieldLine(doc, `WhatsApp: ${sale.customer?.whatsapp_number || sale.customer?.contact_number || 'N/A'}`, 14, y0 + 10.5);
  fieldLine(doc, `Address: ${sale.customer?.address || 'N/A'}`, 14, y0 + 15.5);

  fieldLabel(doc, 'Transaction Details', 115, y0);
  fieldLine(doc, `Date & Time: ${toLocalDateTimeStr(sale.sale_date)}`, 115, y0 + 5.5);
  fieldLine(doc, `Payment Method: ${sale.payment_type?.toUpperCase()}`, 115, y0 + 10.5);
  fieldLine(doc, `Operator: ${sale.created_by || 'System'}`, 115, y0 + 15.5);

  // The customer's standing balance at the time this invoice was produced.
  drawOutstandingLines(doc, sale, 115, y0 + 22);

  // Itemized table using jspdf-autotable. An order is now entered as one
  // pooled Ice Cubes quantity that the server draws Production-first then
  // Resell, so the several sale_items rows behind it are a stock-allocation
  // detail, not something the customer ordered — they are collapsed back into
  // a single billed line per rate. Free cubes are listed separately, at no
  // charge, so the bill shows what actually left the store.
  //
  // Falls back to a single legacy row built from the scalar sale fields if
  // sale_items wasn't loaded (defensive only — every sale has at least one
  // line item after the multi-item orders migration).
  const lineItems = sale.sale_items?.length
    ? sale.sale_items
    : [{ cube_type: sale.cube_type, quantity: sale.quantity, price_per_cube: sale.price_per_cube, subtotal: sale.total_amount, is_free: false }];

  const paidItems = lineItems.filter(i => !i.is_free);
  const freeItems = lineItems.filter(i => i.is_free);

  // Group the billed lines by rate — one row per distinct price, since the
  // customer was quoted a rate, not a cube source.
  const paidByRate = new Map();
  for (const item of paidItems) {
    const rate = Number(item.price_per_cube) || 0;
    const key = rate.toFixed(2);
    const row = paidByRate.get(key) || { rate, quantity: 0, subtotal: 0 };
    row.quantity += Number(item.quantity) || 0;
    row.subtotal += Number(item.subtotal) || 0;
    paidByRate.set(key, row);
  }

  const tableData = Array.from(paidByRate.values()).map(row => [
    'Ice Cubes',
    row.quantity.toLocaleString(),
    `LKR ${row.rate.toFixed(2)}`,
    `LKR ${row.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ]);

  const freeTotal = freeItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
    || Number(sale.free_quantity) || 0;

  if (freeTotal > 0) {
    tableData.push([
      'Free Cubes (complimentary)',
      freeTotal.toLocaleString(),
      'FREE',
      'LKR 0.00'
    ]);
  }

  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    // y0 + 24 before the outstanding-debt lines were added below the
    // Transaction Details block; they take the right column down to y0 + 26.2.
    startY: y0 + 32,
    head: [['ITEM DESCRIPTION', 'QUANTITY', 'RATE', 'TOTAL']],
    body: tableData,
    bodyStyles: { fontSize: 9, textColor: BODY },
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

  // Grand Total card — flat, matching the summary-strip look
  const finalY = doc.lastAutoTable.finalY + 10;
  const boxH = 24;

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(118, finalY, 78, boxH, 2, 2, 'FD');

  fieldLabel(doc, 'Subtotal', 124, finalY + 8);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(`LKR ${sale.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 190, finalY + 8, { align: 'right' });

  fieldLabel(doc, 'Grand Total', 124, finalY + 18);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(`LKR ${sale.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 190, finalY + 18, { align: 'right' });

  // Payment Status card — pill badge + note, colors matching Badge.jsx
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.roundedRect(14, finalY, 96, boxH, 2, 2, 'FD');

  const isDebt = sale.payment_type === 'debt';
  // FIN-17: a cash order is not automatically settled. When its cash was
  // applied to the customer's older invoices first, a shortfall stays owing
  // on this very bill — printing "PAID IN FULL" over it hands the customer a
  // receipt that contradicts the ledger. `outstanding` is supplied by
  // get_public_bill and by useSales after placing an order; anything without
  // it (older callers, fully paid sales) reads 0 and prints as before.
  const outstanding = Number(sale.outstanding) || 0;
  const isPartPaid = !isDebt && outstanding > 0;
  const paidHere = Math.max(0, (Number(sale.total_amount) || 0) - outstanding);

  const [pillBg, pillFg] = badgeColor(isDebt ? 'debt' : isPartPaid ? 'partial' : 'cash');
  drawPill(
    doc,
    isDebt ? 'CREDIT / UNPAID' : isPartPaid ? 'PART PAID' : 'PAID IN FULL',
    33, finalY + 7, pillBg, pillFg, 7.5
  );

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
  if (freeTotal > 0) {
    // With free cubes on the bill, the billed quantity and the quantity
    // handed over differ — say so plainly rather than leaving the customer
    // to reconcile the table.
    const billedTotal = paidItems.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    doc.text(`${billedTotal.toLocaleString()} cubes billed + ${freeTotal.toLocaleString()} free = ${(billedTotal + freeTotal).toLocaleString()} issued.`, 19, finalY + 15);
    doc.text(isDebt
      ? 'Issued on credit terms; the amount is in the debts statement.'
      : isPartPaid
        ? `Paid LKR ${paidHere.toLocaleString()} — LKR ${outstanding.toLocaleString()} still due.`
        : 'Thank you! This invoice has been settled in full.', 19, finalY + 19.5);
  } else if (isDebt) {
    doc.text('This invoice was issued on credit terms. The amount is', 19, finalY + 15);
    doc.text('recorded in the customer’s pending debts statement.', 19, finalY + 19.5);
  } else if (isPartPaid) {
    doc.text(`Paid LKR ${paidHere.toLocaleString()} against this invoice; part of your`, 19, finalY + 15);
    doc.text(`payment cleared an earlier bill. LKR ${outstanding.toLocaleString()} still due.`, 19, finalY + 19.5);
  } else {
    doc.text('Thank you! This invoice has been settled in full on the', 19, finalY + 15);
    doc.text('date of purchase.', 19, finalY + 19.5);
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

  const y0 = drawHeader(doc, settings, 'Debt Statement', `#${debt.sale?.sale_code || `DEBT-${debt.id}`}`);
  fieldLabel(doc, 'Customer Details', 14, y0);
  fieldLine(doc, `Customer Name: ${debt.customer?.name || 'Walk-in Customer'}`, 14, y0 + 5.5);
  fieldLine(doc, `WhatsApp: ${debt.customer?.whatsapp_number || debt.customer?.contact_number || 'N/A'}`, 14, y0 + 10.5);
  fieldLine(doc, `Address: ${debt.customer?.address || 'N/A'}`, 14, y0 + 15.5);

  fieldLabel(doc, 'Debt Details', 115, y0);
  fieldLine(doc, `Sale Reference: ${debt.sale?.sale_code || 'N/A'}`, 115, y0 + 5.5);
  fieldLine(doc, `Date & Time Issued: ${toLocalDateTimeStr(debt.created_at)}`, 115, y0 + 10.5);
  fieldLine(doc, `Total Debt Amount: LKR ${Number(debt.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 115, y0 + 15.5);
  fieldLine(doc, `Status: ${debt.status?.toUpperCase() || 'N/A'}`, 115, y0 + 20.5);

  // This statement covers ONE debt; the customer may owe more across their
  // other invoices, so their whole standing balance is stated too.
  drawOutstandingLines(doc, debt, 115, y0 + 27);

  // Paid History
  const settlements = (debt.debt_settlements || [])
    .slice()
    .sort((a, b) => new Date(a.settlement_date) - new Date(b.settlement_date));

  const tableData = settlements.length
    ? settlements.map(s => [
        toLocalDateTimeStr(s.settlement_date),
        `LKR ${Number(s.amount_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        (s.payment_method || 'cash').replace('_', ' ').toUpperCase(),
        s.notes || '-'
      ])
    : [['-', '-', '-', 'No payments recorded yet']];

  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    // y0 + 28 before the outstanding-debt lines, which end at y0 + 31.2.
    startY: y0 + 37,
    head: [['DATE & TIME', 'AMOUNT PAID', 'METHOD', 'NOTE']],
    body: tableData,
    bodyStyles: { fontSize: 8.5, textColor: BODY },
    columnStyles: {
      0: { width: 30 },
      1: { halign: 'right', width: 35 },
      2: { halign: 'center', width: 35 },
      3: { width: 76 }
    }
  });

  // Summary card: settled amount/date when settled, otherwise the running balance
  const finalY = doc.lastAutoTable.finalY + 10;
  const boxHeight = isSettled ? 30 : 22;

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(118, finalY, 78, boxHeight, 2, 2, 'FD');

  if (isSettled) {
    const lastSettlement = settlements[settlements.length - 1];
    fieldLabel(doc, 'Settled Amount', 124, finalY + 8);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`LKR ${Number(debt.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 190, finalY + 8, { align: 'right' });

    fieldLabel(doc, 'Settled Date & Time', 124, finalY + 16);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(lastSettlement ? toLocalDateTimeStr(lastSettlement.settlement_date) : 'N/A', 190, finalY + 16, { align: 'right' });

    fieldLabel(doc, 'Remaining Debt', 124, finalY + 24);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(EMERALD_TEXT[0], EMERALD_TEXT[1], EMERALD_TEXT[2]);
    doc.text('LKR 0.00', 190, finalY + 24, { align: 'right' });
  } else {
    fieldLabel(doc, 'Amount Paid', 124, finalY + 8);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`LKR ${Number(debt.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 190, finalY + 8, { align: 'right' });

    fieldLabel(doc, 'Remaining Debt', 124, finalY + 18);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(ROSE_TEXT[0], ROSE_TEXT[1], ROSE_TEXT[2]);
    doc.text(`LKR ${Number(debt.remaining_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 190, finalY + 18, { align: 'right' });
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

  const y0 = drawHeader(doc, settings, 'Debt Settlement Receipt', `#${settlement.settlement_code}`);
  fieldLabel(doc, 'Customer Details', 14, y0);
  fieldLine(doc, `Customer Name: ${settlement.customer?.name || 'Walk-in Customer'}`, 14, y0 + 5.5);
  fieldLine(doc, `WhatsApp: ${settlement.customer?.whatsapp_number || settlement.customer?.contact_number || 'N/A'}`, 14, y0 + 10.5);
  fieldLine(doc, `Address: ${settlement.customer?.address || 'N/A'}`, 14, y0 + 15.5);

  // settlement.settlements, when present, is a per-debt breakdown of a single
  // customer-level payment applied FIFO across several outstanding sales —
  // show every covered sale reference instead of just one.
  const saleRefText = settlement.settlements?.length
    ? settlement.settlements.map(s => s.sale_code).filter(Boolean).join(', ') || 'N/A'
    : (settlement.sale?.sale_code || 'N/A');

  fieldLabel(doc, 'Settlement Details', 115, y0);
  fieldLine(doc, `Date & Time: ${toLocalDateTimeStr(settlement.settlement_date)}`, 115, y0 + 5.5);
  fieldLine(doc, `Sale Reference: ${saleRefText}`, 115, y0 + 10.5);
  // A cheque or bank transfer names where the money went, so the receipt can
  // be checked against the Cash & Bank ledger entry it created.
  const methodDetail = settlement.payment_method === 'cheque'
    ? ` (No. ${settlement.cheque_no || 'N/A'}${settlement.bank_name ? `, ${settlement.bank_name}` : ''})`
    : settlement.payment_method === 'bank_transfer' && settlement.bank_name
      ? ` (${settlement.bank_name})`
      : '';
  fieldLine(doc, `Payment Method: ${(settlement.payment_method || 'cash').replace('_', ' ').toUpperCase()}${methodDetail}`, 115, y0 + 15.5);
  fieldLine(doc, `Authorized By: ${settlement.created_by || 'System'}`, 115, y0 + 20.5);

  let outstandingY = y0 + 27;
  if (settlement.notes) {
    fieldLine(doc, `Note: ${settlement.notes}`, 115, y0 + 25.5);
    outstandingY = y0 + 32;
  }

  // What the customer still owes AFTER this payment — the first thing anyone
  // holding a settlement receipt wants to know.
  const tableStartY = drawOutstandingLines(doc, settlement, 115, outstandingY) + 5;

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
    ...TABLE_STYLE_DEFAULTS,
    startY: tableStartY,
    head: [['DESCRIPTION', 'AMOUNT PAID', 'REMAINING DEBT', 'NEW STATUS']],
    body: tableData,
    bodyStyles: { fontSize: 9, textColor: BODY },
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
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.text = [''];
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const raw = tableData[data.row.index][3];
        const [bg, fg] = badgeColor(raw);
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        drawPill(doc, raw, cx, cy, bg, fg, 7);
      }
    }
  });

  // Confirmation card — flat, with a settled-style pill
  const finalY = doc.lastAutoTable.finalY + 12;
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(60, finalY, 90, 24, 2, 2, 'FD');

  drawPill(doc, 'RECEIPTED & VERIFIED', 105, finalY + 9, EMERALD_BG, EMERALD_TEXT, 9);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(`LKR ${settlement.amount_paid.toLocaleString()} Paid`, 105, finalY + 18.5, { align: 'center' });

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

  const y0 = drawHeader(doc, settings, reportTitle, dateStr);

  let tableStartY = y0 + 4;

  // Summary Strip — 4-stat card, matching the on-screen preview. Gated the
  // same way that preview hides it for Debtors/Customer Details reports,
  // where these figures (cash vs debt split, outstanding credit) don't
  // apply cleanly.
  if (showFinancialSummary) {
    const cardY = y0;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, cardY, 182, 22, 2, 2, 'FD');

    const cols = [20, 66, 112, 158];
    const labelY = cardY + 8;
    const valueY = cardY + 16;

    fieldLabel(doc, 'Total Invoiced', cols[0], labelY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`LKR ${summaryData.totalRevenue.toLocaleString()}`, cols[0], valueY);

    fieldLabel(doc, 'Cash Collected', cols[1], labelY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(GREEN_TEXT[0], GREEN_TEXT[1], GREEN_TEXT[2]);
    doc.text(`LKR ${summaryData.cashRevenue.toLocaleString()}`, cols[1], valueY);

    // debtRevenue is gross credit sales issued in the period — it must be
    // netted against everything that reduced debt in that same period, or this
    // overstates the true outstanding balance whenever some of the period's
    // credit sales were already paid off within the period.
    //
    // Note this nets against totalDebtReduced, NOT totalSettled: a cash order
    // auto-applied against old debt reduces the balance just as a collection
    // does, even though it isn't money collected. (Falls back to totalSettled
    // for report payloads built before the split.)
    const debtReduced = summaryData.totalDebtReduced ?? summaryData.totalSettled ?? 0;
    const netOutstandingCredit = Math.max(0, (summaryData.debtRevenue || 0) - debtReduced);
    fieldLabel(doc, 'Debt Balance', cols[2], labelY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(ROSE_TEXT[0], ROSE_TEXT[1], ROSE_TEXT[2]);
    doc.text(`LKR ${netOutstandingCredit.toLocaleString()}`, cols[2], valueY);

    fieldLabel(doc, 'Settlements Collected', cols[3], labelY);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(TEAL_TEXT[0], TEAL_TEXT[1], TEAL_TEXT[2]);
    doc.text(`LKR ${summaryData.totalSettled.toLocaleString()}`, cols[3], valueY);

    tableStartY = cardY + 22 + 12;
  }

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
  doc.text('TRANSACTION LEDGER', 14, tableStartY - 4);

  // Itemized transactions table
  const tableHeaders = [['DATE & TIME', 'SALE REF', 'CUSTOMER', 'TYPE', 'QTY', 'AMOUNT', 'BILLING']];
  const tableRows = salesData.map(sale => [
    toLocalDateTimeStr(sale.sale_date),
    sale.sale_code,
    sale.customerName || sale.customer?.name || 'Walk-in',
    (sale.sale_items?.length || 0) > 1 ? 'MIXED' : sale.cube_type === 'manufactured' ? 'MFC' : sale.cube_type === 'resell' ? 'RSC' : 'MIXED',
    sale.quantity.toLocaleString(),
    `LKR ${sale.total_amount.toLocaleString()}`,
    sale.payment_type.toUpperCase()
  ]);

  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    startY: tableStartY,
    head: tableHeaders,
    body: tableRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: BODY },
    columnStyles: {
      0: { width: 30 },
      1: { width: 22, textColor: NAVY, fontStyle: 'bold' },
      2: { width: 38 },
      3: { halign: 'center', width: 19 },
      4: { halign: 'right', width: 20 },
      5: { halign: 'right', width: 30 },
      6: { halign: 'center', width: 23 }
    },
    didParseCell: (data) => {
      if (data.section === 'head') {
        const colStyles = data.table?.styles?.columnStyles || data.settings?.columnStyles || {};
        const colStyle = colStyles[data.column.index];
        if (colStyle && colStyle.halign) {
          data.cell.styles.halign = colStyle.halign;
        }
      }
      // Type/Billing columns: plain bold colored text (no pill background)
      if (data.section === 'body' && (data.column.index === 3 || data.column.index === 6)) {
        const raw = tableRows[data.row.index][data.column.index];
        const [, fg] = badgeColor(raw);
        data.cell.styles.textColor = fg;
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Aggregates footer — two columns, matching the on-screen preview
  const finalY = doc.lastAutoTable.finalY + 10;

  fieldLabel(doc, 'Production Cube Volumes', 14, finalY + 5);
  fieldLine(doc, `Production (MFC) Sold: ${summaryData.mfcSold.toLocaleString()} units`, 14, finalY + 11);
  fieldLine(doc, `Resell (RSC) Sold: ${summaryData.rscSold.toLocaleString()} units`, 14, finalY + 16);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
  doc.text('PERIOD INFLOWS', 196, finalY + 5, { align: 'right' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(BODY[0], BODY[1], BODY[2]);
  doc.text(`New Customers Registered: ${summaryData.newCustomersCount} clients`, 196, finalY + 11, { align: 'right' });
  doc.text(`Credit Settled Payments: LKR ${summaryData.totalSettled.toLocaleString()}`, 196, finalY + 16, { align: 'right' });

  drawFooter(doc, `${settings?.company_name || 'Sagacious Ice Factory'} Ledger Reports`);
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

  const dateLabel = reportData.reportDateFrom === reportData.reportDateTo
    ? reportData.reportDateFrom
    : `${reportData.reportDateFrom} to ${reportData.reportDateTo}`;
  let currentY = drawHeader(doc, settings, 'Daily Manager Report', dateLabel);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
  doc.text(`Time: ${reportData.reportTimeFrom || '00:00'} - ${reportData.reportTimeTo || '23:59'}`, 14, currentY);

  currentY += 8;

  // Section 01. Stock / Production Details
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text('01. STOCK / PRODUCTION DETAILS', 14, currentY);

  const stockData = reportData.stockDetails;
  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [['PREV BALANCE', 'PRODUCTION', 'PURCHASES', 'BRINE (VIEW ONLY)', 'DAMAGED (VIEW ONLY)', 'FREE ISSUE', 'SALES/ISSUE', 'SENT TO BRANCH', 'CLOSING BALANCE']],
    body: [[
      stockData.previousDayBalance.toLocaleString(),
      stockData.todaysProduction.toLocaleString(),
      stockData.todaysPurchase.toLocaleString(),
      stockData.brineCubes.toLocaleString(),
      stockData.damagedCubes.toLocaleString(),
      stockData.freeIssue.toLocaleString(),
      stockData.todaysSalesQty.toLocaleString(),
      stockData.branchCubes.toLocaleString(),
      stockData.closingBalance.toLocaleString()
    ]],
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7, halign: 'center' },
    bodyStyles: { fontSize: 7.5, textColor: BODY, halign: 'center' },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  // Branch cube breakdown — one line per branch saved in Settings, plus a total.
  // Any number of branches can exist, so this is a small text block rather
  // than fixed table columns.
  if (stockData.branchSalesList && stockData.branchSalesList.length > 0) {
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(BODY[0], BODY[1], BODY[2]);
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
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text('02. INCOME DETAILS', 14, currentY);

  const incData = reportData.incomeDetails;
  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [['LOCATION / TYPE', headCell('CASH QTY SOLD', 'center'), headCell('CASH AMOUNT (LKR)', 'right'), headCell('CREDIT COLLECTED (LKR)', 'right'), headCell('OTHER RECEIPTS (LKR)', 'right'), headCell('TOTAL INCOME (LKR)', 'right')]],
    body: [[
      'Main Plant Operations',
      incData.cashSoldQty.toLocaleString(),
      incData.cashSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      incData.creditAmountReceived.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      incData.otherReceipts.toLocaleString(undefined, { minimumFractionDigits: 2 }),
      incData.totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })
    ]],
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 8, textColor: BODY },
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
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [[headCell('NO.', 'center'), 'CUSTOMER NAME', 'PHONE NO', headCell('CUBES ON DEBT', 'right'), headCell('AMOUNT LKR', 'right'), headCell('TOTAL DEBT BALANCE LKR', 'right')]],
    body: creditGivenRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: BODY },
    columnStyles: { 0: { width: 10, halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [['', '', '', 'TOTAL:', `LKR ${reportData.totalCreditGivenAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']],
    footStyles: { fillColor: CARD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 }
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
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [[headCell('NO.', 'center'), 'CUSTOMER NAME', 'PAYMENT METHOD', 'SETTLEMENT DATE & TIME', headCell('DEBT AMOUNT LKR', 'right'), headCell('PAID DEBT LKR', 'right'), headCell('REMAINING DEBT LKR', 'right')]],
    body: creditCollectionRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: BODY },
    columnStyles: { 0: { width: 10, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [
      ['', '', '', '', 'COLLECTED:', `LKR ${reportData.totalCreditCollectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ''],
      // Kept out of the collected total: this is debt written down by a cash
      // order, and that cash is already counted under Cash Sales.
      ['', '', '', '', 'OFFSET BY CASH ORDERS (NOT COLLECTED):',
        `LKR ${Number(reportData.totalCreditOffsetAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, '']
    ],
    footStyles: { fillColor: CARD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 }
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
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [[headCell('NO.', 'center'), 'DATE & TIME', 'DESCRIPTION', 'EXPENSE CATEGORY', 'EXPENSE TYPE', headCell('AMOUNT LKR', 'right')]],
    body: expRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: BODY },
    columnStyles: { 0: { width: 10, halign: 'center' }, 5: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [
      ['', '', '', '', 'TOTAL:', reportData.totalExpensesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })],
      // Income and expenses were printed as two independent figures with
      // nothing on the page netting them against each other.
      ['', '', '', '', 'NET POSITION (INCOME - EXPENSES):',
        Number(reportData.netPosition || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })]
    ],
    footStyles: { fillColor: CARD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 }
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

  // Cash Balance, Bank Balance, and Hand Cheques are three separate stores
  // of value (Final_Cash_Bank_Cheque_Logic.md) — no combined "Total" row,
  // since summing them would double-count the same money.
  const cashData = reportData.cashDetails;
  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [['AMOUNT DEPOSITED', 'CASH BALANCE', 'BANK BALANCE', 'HAND CHEQUE AMOUNT']],
    body: [[
      `LKR ${(cashData?.amountDeposited || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${(cashData?.cashBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${(cashData?.bankBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${(cashData?.handChequesTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]],
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5, halign: 'center' },
    bodyStyles: { fontSize: 8, textColor: BODY, halign: 'center' },
    margin: { left: 14, right: 14 }
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
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [['EMPLOYEE NAME', 'DATE', 'START TIME', 'END TIME']],
    body: empRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: BODY },
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
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [[headCell('NO.', 'center'), 'TRIP ID', 'DATE & TIME', 'DESCRIPTION', headCell('START KM', 'right'), headCell('END KM', 'right'), headCell('TOTAL DISTANCE', 'right')]],
    body: vehRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: BODY },
    columnStyles: { 0: { width: 10, halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    foot: [['', '', '', '', '', 'TOTAL:', `${(reportData.totalVehicleDistance || 0).toLocaleString()} km`]],
    footStyles: { fillColor: CARD_BG, textColor: INK, fontStyle: 'bold', fontSize: 7.5 }
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
    ? reportData.notesList.map(n => [n.text, n.createdBy, toLocalDateTimeStr(n.createdAt)])
    : [['No notes recorded', '-', '-']];

  doc.autoTable({
    ...TABLE_STYLE_DEFAULTS,
    startY: currentY + 3,
    head: [['NOTE', 'BY', 'DATE/TIME']],
    body: notesRows,
    headStyles: { ...TABLE_STYLE_DEFAULTS.headStyles, fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: BODY },
    margin: { left: 14, right: 14 }
  });

  currentY = doc.lastAutoTable.finalY + 4;

  if (reportData.otherDetails) {
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(BODY[0], BODY[1], BODY[2]);
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
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setFillColor(CARD_BG[0], CARD_BG[1], CARD_BG[2]);
  doc.roundedRect(14, currentY, 182, 34, 2, 2, 'FD');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text('10. DECLARATION / VERIFICATION', 18, currentY + 6);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(BODY[0], BODY[1], BODY[2]);
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
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('System Generated Report', 105, Math.min(currentY, 268), { align: 'center' });

  drawFooter(doc, `${settings?.company_name || 'Sagacious Ice Factory'} Ledger Reports`);
  return doc;
}
