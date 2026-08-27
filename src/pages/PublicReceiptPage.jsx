import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateSettlementReceiptPDF } from '../utils/pdfGenerator';
import { toLocalDateTimeStr } from '../utils/date';
import {
  Download,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Phone,
  MapPin
} from 'lucide-react';

// The customer-facing debt settlement receipt, opened straight from the
// WhatsApp/SMS message with no login — the settlement twin of PublicBillPage.
//
// Like the bill link, the content comes from ONE security-definer RPC granted
// to anon (`get_public_settlement_receipt`) rather than from the tables:
// every select policy on debt_settlements / debts / customers is
// `to authenticated`, so a direct query returns nothing for the person the
// link was sent to. The RPC also enforces the 24-hour window server-side, so
// an expired link carries no receipt data at all.
export function PublicReceiptPage() {
  const { settlementCode } = useParams();
  const [settlement, setSettlement] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const fetchPublicReceipt = async () => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase.rpc('get_public_settlement_receipt', {
          p_settlement_code: settlementCode
        });

        if (error) throw error;

        if (!data || data.status === 'not_found') {
          setErrorMsg("Receipt not found. Please check your receipt number or link.");
          setIsLoading(false);
          return;
        }

        if (data.status === 'expired') {
          setIsExpired(true);
          setIsLoading(false);
          return;
        }

        setSettlement(data.settlement);
        setSettings(data.settings || {});
      } catch (err) {
        console.error("Failed to load public settlement receipt:", err);
        setErrorMsg("Failed to load settlement receipt.");
      } finally {
        setIsLoading(false);
      }
    };

    if (settlementCode) fetchPublicReceipt();
  }, [settlementCode]);

  const handleDownloadPDF = () => {
    if (!settlement) return;
    const doc = generateSettlementReceiptPDF(settlement, settings || {});
    doc.save(`Receipt_${settlement.settlement_code}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold text-slate-500">Loading settlement receipt...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4 shadow-lg">
          <AlertTriangle size={36} className="mx-auto text-amber-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">Receipt Unavailable</h2>
          <p className="text-xs text-slate-500">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // Expired links deliberately carry no receipt content back from the server,
  // so this screen is rendered from the code in the URL alone.
  if (isExpired) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4 shadow-lg">
          <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl border border-red-200 dark:border-red-900/40 inline-block">
            <Clock size={32} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
              Temporary 24-Hour Link Expired
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              For security reasons, public online PDF receipt links are valid for <strong>24 hours</strong>. This link has expired.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 text-left">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Receipt No: {settlementCode}</div>
          </div>

          <p className="text-[11px] text-slate-400">
            Need a copy? Please contact Sagacious Ice Factory directly.
          </p>
        </div>
      </div>
    );
  }

  if (!settlement) return null;

  const lines = settlement.settlements || [];
  const amountPaid = Number(settlement.amount_paid) || 0;
  const remainingTotal = Number(settlement.customer_remaining_total) || 0;
  const methodLabel = (settlement.payment_method || 'cash').replace('_', ' ').toUpperCase();
  const methodDetail = settlement.payment_method === 'cheque'
    ? `No. ${settlement.cheque_no || 'N/A'}${settlement.bank_name ? `, ${settlement.bank_name}` : ''}`
    : settlement.payment_method === 'bank_transfer' && settlement.bank_name
      ? settlement.bank_name
      : '';

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">

        {/* Header Branding Banner */}
        <div className="bg-slate-900 text-white p-6 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-navy-600 flex items-center justify-center text-white font-bold font-heading">
                S
              </div>
              <h1 className="font-heading font-bold text-sm">
                {settings?.company_name || 'Sagacious Ice Factory'}
              </h1>
            </div>
            <span className="text-[10px] font-bold font-mono bg-slate-800 text-slate-300 px-2 py-1 rounded">
              {settlement.settlement_code}
            </span>
          </div>

          <div className="pt-2 text-xs text-slate-400 space-y-0.5">
            <p className="flex items-center gap-1.5"><MapPin size={12} /> {settings?.company_address || 'Colombo, Sri Lanka'}</p>
            <p className="flex items-center gap-1.5"><Phone size={12} /> {settings?.company_phone || '+94 77 123 4567'}</p>
          </div>
        </div>

        <div className="p-6 space-y-5">

          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span>Official Debt Settlement Receipt</span>
          </div>

          <div className="space-y-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex justify-between">
              <span className="text-slate-500">Received From:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{settlement.customer?.name || 'Customer'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Receipt Date &amp; Time:</span>
              <span className="text-slate-700 dark:text-slate-300">{toLocalDateTimeStr(settlement.settlement_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Method:</span>
              <span className="font-bold uppercase text-navy-600 dark:text-navy-400">{methodLabel}</span>
            </div>
            {methodDetail && (
              <div className="flex justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="text-slate-700 dark:text-slate-300">{methodDetail}</span>
              </div>
            )}

            {/* A single payment is applied oldest-invoice-first, so the receipt
                itemises which orders it cleared rather than naming just one. */}
            {lines.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-slate-500 block">Applied To:</span>
                {lines.map((line, idx) => (
                  <div key={idx} className="flex justify-between pl-2 text-[11px]">
                    <span className="text-slate-600 dark:text-slate-300 font-mono">{line.sale_code || 'N/A'}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      LKR {Number(line.amount_applied || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Amount Received</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  LKR {amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                Receipted
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Balance still due</span>
                <span className={`font-bold ${remainingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  LKR {remainingTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleDownloadPDF}
            className="w-full py-3 bg-navy-600 hover:bg-navy-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-md"
          >
            <Download size={16} />
            <span>Download Official PDF Receipt</span>
          </button>

          <p className="text-[10px] text-center text-slate-400 flex items-center justify-center gap-1">
            <Clock size={12} /> This link expires 24 hours after the payment.
          </p>

        </div>
      </div>
    </div>
  );
}
