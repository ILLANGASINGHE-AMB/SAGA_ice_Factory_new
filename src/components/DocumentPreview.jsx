import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { FileDown, ExternalLink } from 'lucide-react';
import { toLocalDateTimeStr } from '../utils/date';

// On-screen previews of the documents pdfGenerator.js prints.
//
// The previews used to be an <iframe src={doc.output('bloburl')}>. That only
// ever worked on a desktop browser with a built-in PDF viewer: iOS Safari and
// Android Chrome — which is what the factory's tablets and the operators'
// phones run — refuse to render a PDF inside a frame and leave a blank white
// box, which is why "Bill Preview does not work". Chrome/Edge with the PDF
// viewer switched off, and any browser blocking blob: frames, fail the same
// way.
//
// So the preview is rendered as ordinary HTML that mirrors the printed
// document, and the PDF itself is reached through the two actions that DO work
// everywhere: download it, or open it in a real tab (where the OS viewer takes
// over). The HTML is laid out from the same fields in the same order as the
// PDF, so what the operator checks on screen is what the customer receives.

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TONES = {
  cash: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  debt: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  settled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  pending: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
};

function Pill({ tone = 'neutral', children }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${TONES[tone] || TONES.neutral}`}>
      {children}
    </span>
  );
}

// The printed sheet. `min-w` + the parent's overflow-x keeps the columns from
// collapsing into an unreadable stack on a narrow phone; on a tablet in
// landscape it simply fills the modal.
function Sheet({ children }) {
  return (
    <div className="overflow-x-auto touch-scroll">
      <div className="min-w-[34rem] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

function SheetHeader({ settings, title, meta }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 dark:border-slate-700 pb-4">
      <div className="flex items-start gap-3 min-w-0">
        {settings?.logo_url ? (
          <img src={settings.logo_url} alt="" className="w-11 h-11 rounded-lg object-contain border border-slate-200 dark:border-slate-700 bg-white shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center text-navy-600 font-heading font-bold text-lg shrink-0">
            S
          </div>
        )}
        <div className="min-w-0">
          <h4 className="text-sm sm:text-base font-bold font-heading text-slate-900 dark:text-slate-100 truncate">
            {settings?.company_name || 'Sagacious Ice Factory'}
          </h4>
          <p className="text-[11px] text-slate-400 truncate">{settings?.company_address || 'Colombo, Sri Lanka'}</p>
          <p className="text-[10px] text-slate-400 truncate">
            Phone: {settings?.company_phone || 'N/A'}   Email: {settings?.company_email || 'N/A'}
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-navy-600 dark:text-sky-400">{title}</p>
        <p className="text-[11px] font-mono text-slate-400 mt-0.5">{meta}</p>
      </div>
    </div>
  );
}

function FieldBlock({ label, rows }) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {rows.map(([name, value]) => (
        <p key={name} className="text-xs text-slate-700 dark:text-slate-300">
          <span className="text-slate-500">{name}: </span>
          <span className="font-medium">{value}</span>
        </p>
      ))}
    </div>
  );
}

// The customer's standing balance, printed on every document beside the
// transaction it is about — mirrors drawOutstandingLines in pdfGenerator.js.
// The figure moves with every order and every payment, so it never appears
// without the timestamp saying when it was true.
function OutstandingBlock({ record }) {
  const total = Number(record?.customer_debt_total) || 0;
  const asOf = record?.customer_debt_updated_at;

  return (
    <div className="pt-1">
      <p className={`text-xs font-bold ${total > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
        Existing Debt to Pay: {money(total)}
      </p>
      <p className="text-[10px] text-slate-400">
        Debt last updated: {asOf ? toLocalDateTimeStr(asOf) : 'No debt activity'}
      </p>
    </div>
  );
}

function LineTable({ head, rows, aligns = [] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-slate-50 dark:bg-slate-900">
          {head.map((h, i) => (
            <th
              key={h}
              className={`border border-slate-200 dark:border-slate-800 px-2 py-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-500 ${aligns[i] === 'right' ? 'text-right' : aligns[i] === 'center' ? 'text-center' : 'text-left'}`}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td
                key={ci}
                className={`border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-300 ${aligns[ci] === 'right' ? 'text-right font-mono' : aligns[ci] === 'center' ? 'text-center' : 'text-left'}`}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryCard({ children }) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-xl p-3.5 space-y-2">
      {children}
    </div>
  );
}

function SummaryLine({ label, value, strong = false, tone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`font-mono ${strong ? 'text-sm font-extrabold' : 'text-xs font-bold'} ${
        tone === 'rose' ? 'text-rose-600 dark:text-rose-400'
          : tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
          : tone === 'navy' ? 'text-navy-600 dark:text-sky-400'
          : 'text-slate-900 dark:text-slate-100'
      }`}>
        {value}
      </span>
    </div>
  );
}

function SheetFooter({ note = 'Thank you for your business!' }) {
  return (
    <div className="border-t border-slate-200 dark:border-slate-800 pt-2.5 flex items-center justify-between text-[10px] text-slate-400">
      <span className="italic">{note}</span>
      <span>Generated: {toLocalDateTimeStr(new Date())}</span>
    </div>
  );
}

/**
 * Preview shell. `buildDoc` is called lazily — only when the operator asks for
 * the PDF — so opening the preview can't fail on a PDF-generation error, and
 * the (not cheap) jsPDF render doesn't run just to look at a bill.
 */
export function DocumentPreviewModal({
  isOpen,
  onClose,
  title,
  buildDoc,
  fileName,
  children,
  onDownloaded
}) {
  const [pdfError, setPdfError] = useState(null);

  const withDoc = (fn) => {
    try {
      setPdfError(null);
      fn(buildDoc());
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setPdfError(err.message || 'Could not generate the PDF for this document.');
    }
  };

  const handleDownload = () => withDoc((doc) => {
    doc.save(fileName);
    onDownloaded?.();
  });

  // Opened as a blob URL in a real tab, where the browser's own PDF viewer
  // handles it. Revoked on a timer rather than immediately: the new tab has
  // to finish fetching the blob first.
  const handleOpen = () => withDoc((doc) => {
    const url = doc.output('bloburl');
    const win = window.open(url, '_blank');
    if (!win) setPdfError('Your browser blocked the new tab. Use Download PDF instead.');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="2xl">
      <div className="space-y-3">
        {children}

        {pdfError && (
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{pdfError}</p>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <Button variant="secondary" onClick={handleOpen} className="flex items-center justify-center space-x-1.5">
            <ExternalLink size={16} />
            <span>Open PDF</span>
          </Button>
          <Button variant="primary" onClick={handleDownload} className="flex items-center justify-center space-x-1.5">
            <FileDown size={16} />
            <span>Download PDF</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Sales invoice — mirrors generateBillPDF. */
export function SaleInvoicePreview({ sale, settings }) {
  if (!sale) return null;

  // Same collapse as the PDF: the sale_items rows are a Production/Resell
  // stock-allocation detail, so they are re-grouped into one billed line per
  // rate rather than exposing an internal category on the bill.
  const lineItems = sale.sale_items?.length
    ? sale.sale_items
    : [{ quantity: sale.quantity, price_per_cube: sale.price_per_cube, subtotal: sale.total_amount, is_free: false }];

  const paidItems = lineItems.filter(i => !i.is_free);
  const byRate = new Map();
  for (const item of paidItems) {
    const rate = Number(item.price_per_cube) || 0;
    const key = rate.toFixed(2);
    const row = byRate.get(key) || { rate, quantity: 0, subtotal: 0 };
    row.quantity += Number(item.quantity) || 0;
    row.subtotal += Number(item.subtotal) || 0;
    byRate.set(key, row);
  }

  const freeTotal = lineItems.filter(i => i.is_free).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)
    || Number(sale.free_quantity) || 0;

  const rows = Array.from(byRate.values()).map(r => [
    'Ice Cubes', r.quantity.toLocaleString(), money(r.rate), money(r.subtotal)
  ]);
  if (freeTotal > 0) {
    rows.push(['Free Cubes (complimentary)', freeTotal.toLocaleString(), 'FREE', money(0)]);
  }

  const isDebt = sale.payment_type === 'debt';
  const outstanding = Number(sale.outstanding) || 0;
  const isPartPaid = !isDebt && outstanding > 0;
  const paidHere = Math.max(0, (Number(sale.total_amount) || 0) - outstanding);

  return (
    <Sheet>
      <SheetHeader settings={settings} title="Sales Invoice" meta={`#${sale.sale_code}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldBlock
          label="Bill To"
          rows={[
            ['Customer Name', sale.customer?.name || 'Walk-in Customer'],
            ['WhatsApp', sale.customer?.whatsapp_number || sale.customer?.contact_number || 'N/A'],
            ['Address', sale.customer?.address || 'N/A']
          ]}
        />
        <div className="space-y-1">
          <FieldBlock
            label="Transaction Details"
            rows={[
              ['Date & Time', toLocalDateTimeStr(sale.sale_date) || 'N/A'],
              ['Payment Method', (sale.payment_type || '').toUpperCase() || 'N/A'],
              ['Operator', sale.created_by || 'System']
            ]}
          />
          <OutstandingBlock record={sale} />
        </div>
      </div>

      <LineTable
        head={['Item Description', 'Quantity', 'Rate', 'Total']}
        rows={rows}
        aligns={['left', 'center', 'right', 'right']}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SummaryCard>
          <Pill tone={isDebt ? 'debt' : isPartPaid ? 'partial' : 'cash'}>
            {isDebt ? 'Credit / Unpaid' : isPartPaid ? 'Part Paid' : 'Paid in Full'}
          </Pill>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isDebt
              ? 'This invoice was issued on credit terms. The amount is recorded in the customer’s pending debts statement.'
              : isPartPaid
                ? `Paid ${money(paidHere)} against this invoice; part of the payment cleared an earlier bill. ${money(outstanding)} still due.`
                : 'Thank you! This invoice has been settled in full on the date of purchase.'}
          </p>
        </SummaryCard>

        <SummaryCard>
          <SummaryLine label="Subtotal" value={money(sale.total_amount)} />
          <SummaryLine label="Grand Total" value={money(sale.total_amount)} strong tone="navy" />
        </SummaryCard>
      </div>

      <SheetFooter />
    </Sheet>
  );
}

/** Debt statement — mirrors generateDebtStatementPDF. */
export function DebtStatementPreview({ debt, settings }) {
  if (!debt) return null;

  const isSettled = debt.status === 'settled';
  const settlements = (debt.debt_settlements || [])
    .slice()
    .sort((a, b) => new Date(a.settlement_date) - new Date(b.settlement_date));

  const rows = settlements.length
    ? settlements.map(s => [
        toLocalDateTimeStr(s.settlement_date),
        money(s.amount_paid),
        (s.payment_method || 'cash').replace('_', ' ').toUpperCase(),
        s.notes || '-'
      ])
    : [['-', '-', '-', 'No payments recorded yet']];

  const lastSettlement = settlements[settlements.length - 1];

  return (
    <Sheet>
      <SheetHeader settings={settings} title="Debt Statement" meta={`#${debt.sale?.sale_code || `DEBT-${debt.id}`}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldBlock
          label="Customer Details"
          rows={[
            ['Customer Name', debt.customer?.name || 'Walk-in Customer'],
            ['WhatsApp', debt.customer?.whatsapp_number || debt.customer?.contact_number || 'N/A'],
            ['Address', debt.customer?.address || 'N/A']
          ]}
        />
        <div className="space-y-1">
          <FieldBlock
            label="Debt Details"
            rows={[
              ['Sale Reference', debt.sale?.sale_code || 'N/A'],
              ['Date & Time Issued', toLocalDateTimeStr(debt.created_at) || 'N/A'],
              ['Total Debt Amount', money(debt.total_amount)],
              ['Status', (debt.status || 'N/A').toUpperCase()]
            ]}
          />
          <OutstandingBlock record={debt} />
        </div>
      </div>

      <LineTable
        head={['Date & Time', 'Amount Paid', 'Method', 'Note']}
        rows={rows}
        aligns={['left', 'right', 'center', 'left']}
      />

      <div className="sm:w-1/2 sm:ml-auto">
        <SummaryCard>
          {isSettled ? (
            <>
              <SummaryLine label="Settled Amount" value={money(debt.paid_amount)} />
              <SummaryLine label="Settled Date & Time" value={lastSettlement ? toLocalDateTimeStr(lastSettlement.settlement_date) : 'N/A'} />
              <SummaryLine label="Remaining Debt" value={money(0)} strong tone="emerald" />
            </>
          ) : (
            <>
              <SummaryLine label="Amount Paid" value={money(debt.paid_amount)} />
              <SummaryLine label="Remaining Debt" value={money(debt.remaining_amount)} strong tone="rose" />
            </>
          )}
        </SummaryCard>
      </div>

      <SheetFooter />
    </Sheet>
  );
}

/** Debt settlement receipt — mirrors generateSettlementReceiptPDF. */
export function SettlementReceiptPreview({ settlement, settings }) {
  if (!settlement) return null;

  // A customer-level payment is applied FIFO across several outstanding sales,
  // so every covered sale reference is shown — not just the first.
  const lines = settlement.settlements?.length ? settlement.settlements : null;
  const saleRefText = lines
    ? lines.map(s => s.sale_code).filter(Boolean).join(', ') || 'N/A'
    : (settlement.sale?.sale_code || 'N/A');

  const methodDetail = settlement.payment_method === 'cheque'
    ? ` (No. ${settlement.cheque_no || 'N/A'}${settlement.bank_name ? `, ${settlement.bank_name}` : ''})`
    : settlement.payment_method === 'bank_transfer' && settlement.bank_name
      ? ` (${settlement.bank_name})`
      : '';

  const rows = lines
    ? lines.map(s => [
        `Settlement against Order Reference #${s.sale_code || 'N/A'}`,
        money(s.amount_applied),
        money(s.remaining_amount),
        (s.status || '').toUpperCase()
      ])
    : [[
        `Settlement against Order Reference #${settlement.sale?.sale_code || 'N/A'}`,
        money(settlement.amount_paid),
        money(settlement.remaining_amount),
        (settlement.status || '').toUpperCase()
      ]];

  return (
    <Sheet>
      <SheetHeader settings={settings} title="Debt Settlement Receipt" meta={`#${settlement.settlement_code}`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldBlock
          label="Customer Details"
          rows={[
            ['Customer Name', settlement.customer?.name || 'Walk-in Customer'],
            ['WhatsApp', settlement.customer?.whatsapp_number || settlement.customer?.contact_number || 'N/A'],
            ['Address', settlement.customer?.address || 'N/A']
          ]}
        />
        <div className="space-y-1">
          <FieldBlock
            label="Settlement Details"
            rows={[
              ['Date & Time', toLocalDateTimeStr(settlement.settlement_date) || 'N/A'],
              ['Sale Reference', saleRefText],
              ['Payment Method', `${(settlement.payment_method || 'cash').replace('_', ' ').toUpperCase()}${methodDetail}`],
              ['Authorized By', settlement.created_by || 'System'],
              ...(settlement.notes ? [['Note', settlement.notes]] : [])
            ]}
          />
          <OutstandingBlock record={settlement} />
        </div>
      </div>

      <LineTable
        head={['Description', 'Amount Paid', 'Remaining Debt', 'New Status']}
        rows={rows}
        aligns={['left', 'right', 'right', 'center']}
      />

      <div className="sm:w-1/2 sm:mx-auto">
        <SummaryCard>
          <div className="text-center space-y-2">
            <Pill tone="settled">Receipted &amp; Verified</Pill>
            <p className="text-sm font-extrabold font-mono text-slate-900 dark:text-slate-100">
              {money(settlement.amount_paid)} Paid
            </p>
          </div>
        </SummaryCard>
      </div>

      <SheetFooter />
    </Sheet>
  );
}
