import React, { useState, useMemo } from 'react';
import { useDebts } from '../hooks/useDebts';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Input, Select } from '../components/FormFields';
import { generateSettlementReceiptPDF } from '../utils/pdfGenerator';
import { Search, DollarSign, Calendar, RefreshCcw } from 'lucide-react';

export function DebtsPage() {
  const { debts, isLoading, settleDebt } = useDebts();
  const { settings } = useSettings();
  const { user } = useAuth();
  const toast = useToast();

  // Filters state
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'partial', 'settled'
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Settlement modal state
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // WhatsApp Prompt State
  const [whatsappPromptOpen, setWhatsappPromptOpen] = useState(false);
  const [settlementReceiptRecord, setSettlementReceiptRecord] = useState(null);

  // Calculate live preview remaining amount in modal
  const remainingPreview = useMemo(() => {
    if (!selectedDebt) return 0;
    const pay = parseFloat(paymentAmount) || 0;
    return Math.max(0, selectedDebt.remaining_amount - pay);
  }, [selectedDebt, paymentAmount]);

  const openSettleModal = (debt) => {
    setSelectedDebt(debt);
    setPaymentAmount('');
    setSettleModalOpen(true);
  };

  const closeSettleModal = () => {
    setSettleModalOpen(false);
    setSelectedDebt(null);
    setPaymentAmount('');
  };

  // Submit Settle Debt
  const handleConfirmSettlement = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid positive payment amount");
      return;
    }
    if (amount > selectedDebt.remaining_amount) {
      toast.error(`Payment amount exceeds remaining debt (LKR ${selectedDebt.remaining_amount})`);
      return;
    }

    setActionLoading(true);
    try {
      const result = await settleDebt(
        selectedDebt.id,
        amount,
        user?.fullName || 'Staff Operator'
      );

      // Trigger PDF Receipt Download
      const receiptDoc = generateSettlementReceiptPDF(result, settings);
      receiptDoc.save(`${result.settlement_code}_receipt.pdf`);

      toast.success(`Settlement recorded! Code: ${result.settlement_code}`);
      setSettlementReceiptRecord(result);
      closeSettleModal();
      setWhatsappPromptOpen(true); // Open WhatsApp prompt dialog
    } catch (err) {
      toast.error(err.message || "Failed to settle debt");
    } finally {
      setActionLoading(false);
    }
  };

  // Send receipt notification via WhatsApp
  const handleSendWhatsAppReceipt = () => {
    if (!settlementReceiptRecord) return;
    const phone = settlementReceiptRecord.customer?.whatsapp_number;
    const name = settlementReceiptRecord.customer?.name;
    const saleCode = settlementReceiptRecord.sale?.sale_code || 'N/A';
    const amount = settlementReceiptRecord.amount_paid;
    const remaining = settlementReceiptRecord.remaining_amount;
    
    // Receipt WhatsApp message format
    const mockPDFURL = `https://sagaciouscube.com/receipt/${settlementReceiptRecord.settlement_code}`;
    const text = `Hello ${name}, your settlement receipt for ${saleCode} is ready. Amount Paid: LKR ${amount.toLocaleString()}. Remaining: LKR ${remaining.toLocaleString()}. View/Download: ${mockPDFURL}`;
    
    const waURL = `https://wa.me/94${phone.substring(1)}?text=${encodeURIComponent(text)}`;
    window.open(waURL, '_blank');
    
    setWhatsappPromptOpen(false);
    setSettlementReceiptRecord(null);
  };

  // Reset all filters
  const resetFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setFromDate('');
    setToDate('');
  };

  // Filtered debt rows
  const filteredDebts = useMemo(() => {
    if (!debts) return [];
    let result = debts.slice();

    // 1. Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(d => d.status === statusFilter);
    }

    // 2. Search Query (Customer Name or Sale Code)
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      result = result.filter(d => 
        d.customer.name.toLowerCase().includes(query) ||
        d.sale?.sale_code?.toLowerCase().includes(query)
      );
    }

    // 3. Date Range Filter
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      result = result.filter(d => new Date(d.created_at) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      result = result.filter(d => new Date(d.created_at) <= to);
    }

    return result;
  }, [debts, statusFilter, searchQuery, fromDate, toDate]);

  return (
    <div className="space-y-6">
      
      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          
          {/* Status Filter */}
          <Select
            label="Payment Status"
            name="statusFilter"
            options={[
              { value: 'all', label: 'All Debts' },
              { value: 'pending', label: 'Pending Only' },
              { value: 'partial', label: 'Partially Settled' },
              { value: 'settled', label: 'Settled Ledger' }
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />

          {/* Customer Search */}
          <Input
            label="Search Registry"
            name="debtSearch"
            placeholder="Search debtor or sale code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Date From */}
          <Input
            label="Date From"
            name="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />

          {/* Date To */}
          <Input
            label="Date To"
            name="toDate"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        
        {/* Reset Filter Button */}
        <div className="flex justify-end pt-1">
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={resetFilters}
            className="flex items-center space-x-1.5"
          >
            <RefreshCcw size={14} />
            <span>Reset Filters</span>
          </Button>
        </div>
      </div>

      {/* Debt ledger List */}
      <Table
        headers={[
          { key: 'customerName', label: 'Customer Name', sortable: true },
          { key: 'saleCode', label: 'Sale Code', sortable: true },
          { key: 'total_amount', label: 'Total Amount', sortable: true },
          { key: 'paid_amount', label: 'Amount Paid', sortable: true },
          { key: 'remaining_amount', label: 'Outstanding Balance', sortable: true },
          { key: 'status', label: 'Status', sortable: true },
          { key: 'created_at', label: 'Date Issued', sortable: true },
          { key: 'action', label: 'Actions', sortable: false }
        ]}
        data={filteredDebts}
        isLoading={isLoading}
        emptyMessage="Clear ledger! No outstanding debts matched the parameters."
        renderRow={(debt) => {
          const isOutstanding = debt.status !== 'settled';
          return (
            <tr key={debt.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
              <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">{debt.customer?.name}</td>
              <td className="px-6 py-4 font-mono font-medium text-navy-600 dark:text-navy-400">{debt.sale?.sale_code}</td>
              <td className="px-6 py-4 font-mono text-slate-700 dark:text-slate-300">LKR {debt.total_amount.toLocaleString()}</td>
              <td className="px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400">LKR {debt.paid_amount.toLocaleString()}</td>
              <td className="px-6 py-4 font-mono font-semibold text-rose-600 dark:text-rose-400">LKR {debt.remaining_amount.toLocaleString()}</td>
              <td className="px-6 py-4"><Badge type={debt.status} /></td>
              <td className="px-6 py-4 text-xs text-slate-400">{new Date(debt.created_at).toLocaleDateString()}</td>
              <td className="px-6 py-4">
                {isOutstanding ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openSettleModal(debt)}
                    className="flex items-center space-x-1"
                  >
                    <DollarSign size={13} />
                    <span>Settle</span>
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center">
                    Cleared
                  </span>
                )}
              </td>
            </tr>
          );
        }}
      />

      {/* --- Settle Debt Modal Dialog --- */}
      <Modal
        isOpen={settleModalOpen}
        onClose={closeSettleModal}
        title="Register Debt Settlement"
      >
        <form onSubmit={handleConfirmSettlement} className="space-y-4">
          
          {/* Summary Details */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 divide-y divide-slate-150 dark:divide-slate-800 space-y-2.5">
            <div className="flex justify-between text-xs py-0.5">
              <span className="text-slate-400">Customer</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {selectedDebt?.customer?.name}
              </span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-slate-400">Order Invoice Reference</span>
              <span className="font-mono text-navy-600 dark:text-navy-400">
                {selectedDebt?.sale?.sale_code}
              </span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-slate-400">Total Indebtedness</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                LKR {selectedDebt?.total_amount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs py-1">
              <span className="text-slate-400">Total Previously Settled</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                LKR {selectedDebt?.paid_amount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-xs py-1 font-bold text-rose-600 dark:text-rose-400">
              <span>Outstanding Balance</span>
              <span className="font-mono">
                LKR {selectedDebt?.remaining_amount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Payment amount */}
          <Input
            label="Payment Amount (LKR)"
            name="amountPaid"
            type="number"
            step="0.01"
            required
            min="0.01"
            max={selectedDebt?.remaining_amount}
            placeholder={`Max LKR ${selectedDebt?.remaining_amount}`}
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />

          {/* Preview panel */}
          <div className="p-3 bg-navy-50/50 dark:bg-navy-950/20 border border-navy-100 dark:border-navy-900/50 rounded-xl flex justify-between items-center text-xs">
            <span className="text-slate-500 font-semibold">Remaining balance after settlement:</span>
            <span className="font-extrabold font-mono text-slate-800 dark:text-slate-200 text-sm">
              LKR {remainingPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={closeSettleModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Settlement
            </Button>
          </div>
        </form>
      </Modal>

      {/* --- WhatsApp Confirmation Receipt Prompt --- */}
      <ConfirmDialog
        isOpen={whatsappPromptOpen}
        onClose={() => {
          setWhatsappPromptOpen(false);
          setSettlementReceiptRecord(null);
        }}
        onConfirm={handleSendWhatsAppReceipt}
        title="Send Receipt to WhatsApp?"
        message={`Settlement saved successfully. Would you like to launch WhatsApp to dispatch the receipt statement to: ${settlementReceiptRecord?.customer?.name}?`}
        confirmLabel="Send Notification"
        cancelLabel="Skip Notification"
        variant="primary"
      />

    </div>
  );
}
