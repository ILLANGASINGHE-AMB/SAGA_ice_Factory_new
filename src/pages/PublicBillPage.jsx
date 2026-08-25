import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateBillPDF } from '../utils/pdfGenerator';
import { 
    Download, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
    Phone, 
  MapPin 
} from 'lucide-react';

export function PublicBillPage() {
  const { saleCode } = useParams();
  const [sale, setSale] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    // This page is opened straight from a WhatsApp link by a customer who is
    // not logged in. Every table's select policy is `to authenticated`, so
    // querying `sales` / `customers` / `settings` directly always came back
    // empty for them — the bill link simply never worked. `get_public_bill`
    // is a security-definer RPC granted to anon that returns just this one
    // bill and enforces the 24-hour window server-side.
    const fetchPublicBill = async () => {
      try {
        setIsLoading(true);

        const { data, error } = await supabase.rpc('get_public_bill', {
          p_sale_code: saleCode
        });

        if (error) throw error;

        if (!data || data.status === 'not_found') {
          setErrorMsg("Bill invoice not found. Please check your sale code or link.");
          setIsLoading(false);
          return;
        }

        if (data.status === 'expired') {
          setIsExpired(true);
          setIsLoading(false);
          return;
        }

        setSale(data.sale);
        setSettings(data.settings || {});
      } catch (err) {
        console.error("Failed to load public bill:", err);
        setErrorMsg("Failed to load invoice statement.");
      } finally {
        setIsLoading(false);
      }
    };

    if (saleCode) fetchPublicBill();
  }, [saleCode]);

  const handleDownloadPDF = () => {
    if (!sale) return;
    if (sale.bill_pdf_url) {
      window.open(sale.bill_pdf_url, '_blank');
    } else {
      const doc = generateBillPDF(sale, settings || {});
      doc.save(`Invoice_${sale.sale_code}.pdf`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-navy-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-semibold text-slate-500">Loading invoice statement...</p>
        </div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center space-y-4 shadow-lg">
          <AlertTriangle size={36} className="mx-auto text-amber-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">Invoice Unavailable</h2>
          <p className="text-xs text-slate-500">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // Expired links deliberately carry no bill content back from the server, so
  // this screen is rendered from the sale code in the URL alone.
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
              For security reasons, public online PDF bill links are valid for <strong>24 hours</strong>. This link has expired.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 text-left">
            <div className="font-semibold text-slate-800 dark:text-slate-200">Sale Reference: {saleCode}</div>
          </div>

          <p className="text-[11px] text-slate-400">
            Need a copy? Please contact Sagacious Ice Factory directly.
          </p>
        </div>
      </div>
    );
  }

  if (!sale) return null;

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
              {sale.sale_code}
            </span>
          </div>

          <div className="pt-2 text-xs text-slate-400 space-y-0.5">
            <p className="flex items-center gap-1.5"><MapPin size={12} /> {settings?.company_address || 'Colombo, Sri Lanka'}</p>
            <p className="flex items-center gap-1.5"><Phone size={12} /> {settings?.company_phone || '+94 77 123 4567'}</p>
          </div>
        </div>

        {/* ACTIVE 24-HOUR BILL STATE */}
        <div className="p-6 space-y-5">
            
            {/* Live Notice Strip */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-xl flex items-center space-x-2 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              <span>Official Digital Tax Invoice & Statement</span>
            </div>

            {/* Customer & Order Summary */}
            <div className="space-y-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Billed To:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{sale.customer?.name || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice Date:</span>
                <span className="text-slate-700 dark:text-slate-300">{new Date(sale.sale_date).toLocaleDateString()}</span>
              </div>
              {sale.sale_items?.length > 1 ? (
                <div className="space-y-1 pt-1">
                  <span className="text-slate-500 block">Items:</span>
                  {sale.sale_items.map((item, idx) => (
                    <div key={idx} className="flex justify-between pl-2 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-300">
                        {item.cube_type === 'manufactured' ? 'Production' : 'Resell'} × {item.quantity.toLocaleString()}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        LKR {Number(item.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cube Category:</span>
                    <span className="font-semibold uppercase text-slate-800 dark:text-slate-200">{sale.cube_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Quantity:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{sale.quantity.toLocaleString()} cubes</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Terms:</span>
                <span className="font-bold uppercase text-navy-600 dark:text-navy-400">{sale.payment_type}</span>
              </div>
            </div>

            {/* Total Amount Card */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Amount Due</span>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  LKR {parseFloat(sale.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                {sale.payment_type === 'cash' ? 'Paid Cash' : 'Debit Account'}
              </span>
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownloadPDF}
              className="w-full py-3 bg-navy-600 hover:bg-navy-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-md"
            >
              <Download size={16} />
              <span>Download Official PDF Bill</span>
            </button>

            {/* Expiry Warning Footer */}
            <p className="text-[10px] text-center text-slate-400 flex items-center justify-center gap-1">
              <Clock size={12} /> This link expires 24 hours after purchase.
            </p>

        </div>

      </div>
    </div>
  );
}
