import React, { useState } from 'react';
import { useWholesalePortal } from '../hooks/useWholesalePortal';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Skeleton } from '../components/Skeleton';
import { 
  Building2, 
  ShoppingCart, 
  FileText, 
  Download, 
  CheckCircle2, 
  Clock, 
  Package, 
  CreditCard, 
  DollarSign, 
  ArrowRight,
  Phone,
  MapPin
} from 'lucide-react';

export function ClientPortalPage() {
  const {
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    currentCustomer,
    customerSales,
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
  } = useWholesalePortal();

  const toast = useToast();

  // Reorder Form state
  const [cubeType, setCubeType] = useState('manufactured');
  const [quantity, setQuantity] = useState('');
  const [paymentType, setPaymentType] = useState('debt');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const handleReorderSubmit = async (e) => {
    e.preventDefault();
    try {
      setIsSubmittingOrder(true);
      const res = await submitReorder({ cube_type: cubeType, quantity, payment_type: paymentType });
      toast.success(`Reorder ${res.sale_code} placed successfully! Stock deducted.`);
      setQuantity('');
    } catch (err) {
      toast.error(err.message || "Failed to place reorder");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const selectedUnitPrice = cubeType === 'manufactured' ? mfcPrice : rscPrice;
  const calculatedTotal = (parseFloat(quantity || 0) * selectedUnitPrice).toFixed(2);

  return (
    <div className="space-y-6">
      
      {/* Header & Client Switcher Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="text-navy-500" size={24} />
            Wholesale Client Self-Service Portal & Statements
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            24/7 online reordering, live stock rates, and downloadable account statements for commercial clients.
          </p>
        </div>

        {/* Wholesale Account Selector */}
        <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Client:</span>
          <select
            value={selectedCustomerId || ''}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-navy-500"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.customer_code || 'Wholesale'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentCustomer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left 2 Columns: 24/7 Reorder Portal & Live Rates */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Live Stock & Unit Price Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Manufactured Cubes Rate */}
              <div className={`p-4 rounded-2xl border transition ${cubeType === 'manufactured' ? 'bg-navy-50/70 border-navy-300 dark:bg-navy-950/40 dark:border-navy-800 ring-2 ring-navy-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-center justify-between">
                  <Badge variant="mfc">MFC — Manufactured</Badge>
                  <span className="text-xs font-bold text-slate-500">Available: {mfcStock.toLocaleString()} cubes</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Wholesale Rate</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                      LKR {parseFloat(mfcPrice).toFixed(2)} <span className="text-xs text-slate-400 font-normal">/ cube</span>
                    </h3>
                  </div>
                  <button
                    onClick={() => setCubeType('manufactured')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-navy-600 text-white hover:bg-navy-700 transition"
                  >
                    Select
                  </button>
                </div>
              </div>

              {/* Resell Cubes Rate */}
              <div className={`p-4 rounded-2xl border transition ${cubeType === 'resell' ? 'bg-blue-50/70 border-blue-300 dark:bg-blue-950/40 dark:border-blue-800 ring-2 ring-blue-500/20' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
                <div className="flex items-center justify-between">
                  <Badge variant="rsc">RSC — Resell</Badge>
                  <span className="text-xs font-bold text-slate-500">Available: {rscStock.toLocaleString()} cubes</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Wholesale Rate</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                      LKR {parseFloat(rscPrice).toFixed(2)} <span className="text-xs text-slate-400 font-normal">/ cube</span>
                    </h3>
                  </div>
                  <button
                    onClick={() => setCubeType('resell')}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    Select
                  </button>
                </div>
              </div>

            </div>

            {/* Fast 24/7 Reorder Form Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading flex items-center gap-2">
                  <ShoppingCart size={18} className="text-navy-500" />
                  Instant Reorder Form ({currentCustomer.name})
                </h3>
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={14} /> 24/7 Automated Dispatch
                </span>
              </div>

              <form onSubmit={handleReorderSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ice Cube Category
                    </label>
                    <select
                      value={cubeType}
                      onChange={(e) => setCubeType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-navy-500"
                    >
                      <option value="manufactured">Manufactured Cubes (MFC) — LKR {parseFloat(mfcPrice).toFixed(2)}/cube</option>
                      <option value="resell">Resell Cubes (RSC) — LKR {parseFloat(rscPrice).toFixed(2)}/cube</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Quantity (Cubes / Units) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="e.g. 200"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-navy-500 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Payment Terms
                    </label>
                    <div className="flex items-center space-x-3 mt-1">
                      <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="radio"
                          name="paymentType"
                          value="debt"
                          checked={paymentType === 'debt'}
                          onChange={() => setPaymentType('debt')}
                          className="text-navy-600 focus:ring-navy-500"
                        />
                        <span>On Credit Account (Debt)</span>
                      </label>
                      <label className="flex items-center space-x-2 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="radio"
                          name="paymentType"
                          value="cash"
                          checked={paymentType === 'cash'}
                          onChange={() => setPaymentType('cash')}
                          className="text-navy-600 focus:ring-navy-500"
                        />
                        <span>Cash on Delivery</span>
                      </label>
                    </div>
                  </div>

                  {/* Calculated Order Total Preview */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">Total Order Cost:</span>
                    <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
                      LKR {calculatedTotal}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button variant="primary" type="submit" disabled={isSubmittingOrder} className="w-full sm:w-auto text-xs">
                    {isSubmittingOrder ? 'Placing Order...' : 'Submit Reorder Now'}
                    <ArrowRight size={16} className="ml-1.5" />
                  </Button>
                </div>
              </form>
            </div>

            {/* Recent Orders History Table */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-heading">
                Client Order History ({customerSales.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 uppercase text-[10px] font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Order Ref</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerSales.slice(0, 8).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-slate-100">{s.sale_code}</td>
                        <td className="py-2.5 px-3 text-slate-500">{new Date(s.sale_date).toLocaleDateString()}</td>
                        <td className="py-2.5 px-3 uppercase text-[11px] font-semibold">{s.cube_type}</td>
                        <td className="py-2.5 px-3 text-right font-semibold">{s.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-bold">LKR {parseFloat(s.total_amount).toFixed(2)}</td>
                        <td className="py-2.5 px-3 uppercase font-semibold text-[10px]">{s.payment_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column: Statement of Account & Download Button */}
          <div className="space-y-6">
            
            {/* Account Summary & PDF Download Widget */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading flex items-center gap-2">
                  <FileText size={18} className="text-navy-500" />
                  Statement of Account
                </h3>
              </div>

              {/* Client Details Box */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs space-y-1 text-slate-600 dark:text-slate-300">
                <div className="font-bold text-slate-900 dark:text-slate-100">{currentCustomer.name}</div>
                <div className="flex items-center gap-1.5 text-slate-500"><Phone size={12} /> {currentCustomer.whatsapp_number}</div>
                {currentCustomer.address && <div className="flex items-center gap-1.5 text-slate-500"><MapPin size={12} /> {currentCustomer.address}</div>}
              </div>

              {/* Financial Metrics */}
              <div className="space-y-3 pt-2">
                <div className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-500 font-medium">Total Billed:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                    LKR {totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800">
                  <span className="text-slate-500 font-medium">Total Payments Received:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    LKR {totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40">
                  <span className="text-red-700 dark:text-red-300 font-bold uppercase tracking-wider text-[10px]">Outstanding Balance Due:</span>
                  <span className="font-bold text-red-600 dark:text-red-400 font-mono text-sm">
                    LKR {totalOutstandingDebt.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Export PDF Button */}
              <button
                onClick={downloadStatementPDF}
                className="w-full py-2.5 px-4 rounded-xl bg-navy-600 hover:bg-navy-700 text-white text-xs font-bold transition flex items-center justify-center space-x-2 shadow-sm"
              >
                <Download size={16} />
                <span>Download PDF Statement</span>
              </button>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
