import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSales } from '../hooks/useSales';
import { useInventory } from '../hooks/useInventory';
import { useCustomers } from '../hooks/useCustomers';
import { useCustomerPrices } from '../hooks/useCustomerPrices';
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
import { generateBillPDF } from '../utils/pdfGenerator';
import { ShoppingCart, Search, FileDown, MessageSquare, ArrowRight, ArrowLeft, Check, Trash2, Eye, Pencil } from 'lucide-react';

export function SalesPage() {
  const { sales, isLoading: salesLoading, placeOrder, updateSale, deleteSale } = useSales();
  const { inventory, isLoading: inventoryLoading } = useInventory();
  const { customers, addCustomer } = useCustomers();
  const { customerPrices } = useCustomerPrices();
  const { debts } = useDebts();
  const { settings } = useSettings();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('sale_date');
  const [sortDirection, setSortDirection] = useState('desc');

  // --- New Order Wizard State ---
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);

  // Form Fields State
  const [paymentType, setPaymentType] = useState('cash'); // 'cash' | 'debt'
  const [customerId, setCustomerId] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [showMiniCustomerForm, setShowMiniCustomerForm] = useState(false);
  const [customerFieldFocused, setCustomerFieldFocused] = useState(false);

  // Order items — fixed two categories (Production/MFC and Resell/RSC),
  // both always present so the operator never has to pick a category.
  const [orderRows, setOrderRows] = useState([]);

  // Post placement prompt state
  const [whatsappPromptOpen, setWhatsappPromptOpen] = useState(false);
  const [placedSaleRecord, setPlacedSaleRecord] = useState(null);

  // Delete sale state variables
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // View bill preview state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewPdfUrl, setViewPdfUrl] = useState(null);
  const [viewSale, setViewSale] = useState(null);

  // Edit bill state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState(null);
  const [editCubeType, setEditCubeType] = useState('manufactured');
  const [editPricePerCube, setEditPricePerCube] = useState(0);
  const [editQuantity, setEditQuantity] = useState('');
  const [editPaymentType, setEditPaymentType] = useState('cash');
  const [editLoading, setEditLoading] = useState(false);

  // Stock values lookup
  const stockMap = useMemo(() => {
    if (!inventory) {
      return {
        MFC: { qty: 0, price: 0, id: null },
        RSC: { qty: 0, price: 0, id: null },
        BNC: { qty: 0 }
      };
    }
    const mfc = inventory.find(i => i.type === 'manufactured');
    const rsc = inventory.find(i => i.type === 'resell');
    const bnc = inventory.find(i => i.type === 'waste');
    return {
      MFC: mfc ? { qty: mfc.quantity, price: mfc.price_per_cube || 0, id: mfc.id } : { qty: 0, price: 0, id: null },
      RSC: rsc ? { qty: rsc.quantity, price: rsc.price_per_cube || 0, id: rsc.id } : { qty: 0, price: 0, id: null },
      BNC: bnc ? { qty: bnc.quantity } : { qty: 0 }
    };
  }, [inventory]);

  // Open Wizard flow
  const handleOpenWizard = () => {
    setStep(1);
    setPaymentType('cash');
    setCustomerId('');
    setCustomerSearchQuery('');
    setNewCustName('');
    setNewCustPhone('');
    setShowMiniCustomerForm(false);
    setOrderRows([
      { id: 'mfc', cubeType: 'manufactured', pricePerCube: '', quantity: '' },
      { id: 'rsc', cubeType: 'resell', pricePerCube: '', quantity: '' }
    ]);
    setWizardOpen(true);
  };

  // Rate for a cube type: the selected customer's custom price if one is set,
  // otherwise the live inventory default. Resolved fresh whenever the wizard
  // advances past customer selection so it always reflects the chosen
  // customer, but stored on the row afterwards so an admin's manual edit
  // sticks instead of being overwritten on every keystroke.
  const resolveDefaultRate = (cubeType) => {
    const cid = Number(customerId);
    if (cid) {
      const custom = customerPrices.find(p => Number(p.customer_id) === cid && p.cube_type === cubeType);
      if (custom && Number(custom.price_per_cube) > 0) return Number(custom.price_per_cube);
    }
    return cubeType === 'manufactured' ? stockMap.MFC.price : stockMap.RSC.price;
  };

  const hasCustomRate = (cubeType) => {
    const cid = Number(customerId);
    if (!cid) return false;
    return customerPrices.some(p => Number(p.customer_id) === cid && p.cube_type === cubeType && Number(p.price_per_cube) > 0);
  };

  // Row helpers — quantity always editable; pricePerCube only for admins (UI-gated).
  const updateRow = (id, field, value) => {
    setOrderRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Allow navigating here from other tabs (e.g. Dashboard's "Add New Order")
  // and land straight in the checkout wizard.
  useEffect(() => {
    if (location.state?.openNewOrder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleOpenWizard();
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Outstanding debt for the currently selected customer — 'pending' and
  // 'partial' are both still-owed statuses (matches the FIFO offset logic
  // in place_multi_item_order_transaction, which targets both the same way).
  const customerPendingDebt = useMemo(() => {
    const cid = Number(customerId);
    if (!cid || !debts) return 0;
    return debts
      .filter(d => Number(d.customer_id) === cid && (d.status === 'pending' || d.status === 'partial'))
      .reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0);
  }, [debts, customerId]);

  // Customers for step 2 dropdown: full registry by default, filtered as the
  // operator types a search term.
  const filteredCustomersForSearch = useMemo(() => {
    if (!customers) return [];
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.whatsapp_number?.includes(q) ||
      c.contact_number?.includes(q)
    );
  }, [customers, customerSearchQuery]);

  // Calculate grand total across all rows
  const calculatedTotal = useMemo(() => {
    return orderRows.reduce((sum, r) => {
      const qty = parseInt(r.quantity, 10) || 0;
      const rate = parseFloat(r.pricePerCube) || 0;
      return sum + qty * rate;
    }, 0);
  }, [orderRows]);

  // Handle customer selection
  const selectCustomer = (cust) => {
    setCustomerId(cust.id);
    setCustomerSearchQuery(cust.name);
  };

  // Wizard Navigation
  const nextStep = async () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      // Validate customer selection
      if (!customerId && !showMiniCustomerForm) {
        toast.error("Please search and select a customer, or toggle the registration form.");
        return;
      }
      if (showMiniCustomerForm) {
        if (!newCustName || newCustName.trim().length < 2) {
          toast.error("Please enter a valid customer name (min 2 chars)");
          return;
        }
        if (!newCustPhone || !/^0\d{9}$/.test(newCustPhone)) {
          toast.error("Please enter a valid 10-digit WhatsApp number starting with 0 (e.g. 0771234567)");
          return;
        }
      }
      // Resolve each row's rate now that the customer is known: their custom
      // price if set, otherwise the inventory default.
      setOrderRows(rows => rows.map(r => ({ ...r, pricePerCube: resolveDefaultRate(r.cubeType) })));
      setStep(3);
    } else if (step === 3) {
      // Only rows the operator actually filled in (quantity > 0) count toward the order.
      const activeRows = orderRows.filter(r => (parseInt(r.quantity, 10) || 0) > 0);
      if (activeRows.length === 0) {
        toast.error("Enter a quantity for at least one cube type.");
        return;
      }
      for (const r of activeRows) {
        if (!(parseFloat(r.pricePerCube) > 0)) {
          const label = r.cubeType === 'manufactured' ? 'Production (MFC)' : 'Resell (RSC)';
          toast.error(isAdmin
            ? `Enter a rate for ${label} before continuing.`
            : `No rate set for ${label}. Ask an admin to set it in Inventory or the customer's Custom Prices.`);
          return;
        }
      }
      // Tally quantities by cube type to check stock
      const mfcQty = activeRows.filter(r => r.cubeType === 'manufactured').reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0);
      const rscQty = activeRows.filter(r => r.cubeType === 'resell').reduce((s, r) => s + (parseInt(r.quantity, 10) || 0), 0);
      if (mfcQty > stockMap.MFC.qty) { toast.error(`Insufficient Production stock! Available: ${stockMap.MFC.qty}`); return; }
      if (rscQty > stockMap.RSC.qty) { toast.error(`Insufficient Resell stock! Available: ${stockMap.RSC.qty}`); return; }
      setStep(4);
    }
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // Final Order Placement
  const handlePlaceOrder = async () => {
    setActionLoading(true);
    try {
      let finalCustomerId = customerId;
      
      // 1. Create customer if mini-form was used
      if (showMiniCustomerForm) {
        const createdCust = await addCustomer({
          name: newCustName,
          whatsapp_number: newCustPhone
        });
        finalCustomerId = createdCust.id;
      }

      // 2. Place a single order covering every filled-in row — one bill, one sale_code
      const sale = await placeOrder({
        customer_id: finalCustomerId,
        items: orderRows
          .filter(row => (parseInt(row.quantity, 10) || 0) > 0)
          .map(row => ({
            cube_type: row.cubeType,
            quantity: parseInt(row.quantity, 10),
            price_per_cube: parseFloat(row.pricePerCube)
          })),
        payment_type: paymentType,
        created_by: user?.fullName || 'Staff Operator'
      });

      // 3. Immediately trigger PDF generation and download
      const billDoc = generateBillPDF(sale, settings);
      billDoc.save(`${sale.sale_code}_invoice.pdf`);

      // When a CASH order reduces pre-existing old debt, notify the operator
      // so they know the cash went toward old balances (debtsLogic.md rule).
      if (sale.appliedToOldDebt > 0) {
        toast.success(
          `LKR ${sale.appliedToOldDebt.toLocaleString()} was applied to ${sale.customer?.name || 'the customer'}'s existing debt. ` +
          `Outstanding debt reduced \u2014 remaining balance date has been refreshed to today.`
        );
      }

      toast.success(`Order placed successfully! Invoiced: ${sale.sale_code}`);
      setPlacedSaleRecord(sale);
      setWizardOpen(false);
      setWhatsappPromptOpen(true); // Open WhatsApp prompt modal
    } catch (err) {
      toast.error(err.message || "Failed to place order");
    } finally {
      setActionLoading(false);
    }
  };

  // WhatsApp redirection
  const handleSendWhatsApp = () => {
    if (!placedSaleRecord) return;
    const phone = placedSaleRecord.customer?.whatsapp_number || placedSaleRecord.customer?.contact_number;
    const name = placedSaleRecord.customer?.name;
    const amount = placedSaleRecord.total_amount;
    
    const paymentTypeText = placedSaleRecord.payment_type === 'cash' ? 'Cash' : 'Debit';
    
    // Construct 24-hour PDF bill link
    const billURL = `${window.location.origin}/bill/${placedSaleRecord.sale_code}`;

    const text = `Hello, ${name},
Your Order with ${placedSaleRecord.quantity.toLocaleString()} Ice Cubes is completed.
The Payment type is : ${paymentTypeText}
The Total is : LKR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}

📄 View/Download 24-Hour PDF Bill:
${billURL}`;
    
    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    const formattedPhone = cleanPhone.length === 10 ? `94${cleanPhone.substring(1)}` : cleanPhone;

    const waURL = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
    window.open(waURL, '_blank');
    
    setWhatsappPromptOpen(false);
    setPlacedSaleRecord(null);
  };

  const handleDeleteClick = (sale) => {
    setSaleToDelete(sale);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async (restoreStock) => {
    if (!saleToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteSale(saleToDelete.id, restoreStock);
      if (restoreStock) {
        toast.success(`Sale ${saleToDelete.sale_code} deleted and stock restored.`);
      } else {
        toast.success(`Sale ${saleToDelete.sale_code} deleted (stock not modified).`);
      }
      setDeleteConfirmOpen(false);
      setSaleToDelete(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete sale");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle table downloads manually
  const downloadInvoice = (sale) => {
    const doc = generateBillPDF(sale, settings);
    doc.save(`${sale.sale_code}_invoice.pdf`);
    toast.info(`Downloaded invoice ${sale.sale_code}`);
  };

  // View bill: render the invoice PDF in-app as a preview, no download required
  const handleViewClick = (sale) => {
    const doc = generateBillPDF(sale, settings);
    const blobUrl = doc.output('bloburl');
    setViewPdfUrl(blobUrl);
    setViewSale(sale);
    setViewModalOpen(true);
  };

  const handleCloseViewModal = () => {
    if (viewPdfUrl) URL.revokeObjectURL(viewPdfUrl);
    setViewModalOpen(false);
    setViewSale(null);
    setViewPdfUrl(null);
  };

  // Edit bill: open the correction form pre-filled with the sale's current values
  const handleEditClick = (sale) => {
    setSaleToEdit(sale);
    setEditCubeType(sale.cube_type);
    setEditPricePerCube(sale.price_per_cube);
    setEditQuantity(String(sale.quantity));
    setEditPaymentType(sale.payment_type);
    setEditModalOpen(true);
  };

  const editAvailableStock = useMemo(() => {
    if (!saleToEdit) return 0;
    const limit = editCubeType === 'manufactured' ? stockMap.MFC.qty : stockMap.RSC.qty;
    // The quantity currently held by this sale hasn't been restored to stock
    // yet, so add it back when previewing "available" for the same type.
    return editCubeType === saleToEdit.cube_type ? limit + saleToEdit.quantity : limit;
  }, [saleToEdit, editCubeType, stockMap]);

  const editCalculatedTotal = useMemo(() => {
    const qty = parseInt(editQuantity, 10) || 0;
    const rate = parseFloat(editPricePerCube) || 0;
    return qty * rate;
  }, [editQuantity, editPricePerCube]);

  const handleEditCubeTypeChange = (type) => {
    setEditCubeType(type);
    if (saleToEdit && type !== saleToEdit.cube_type) {
      setEditPricePerCube(type === 'manufactured' ? stockMap.MFC.price : stockMap.RSC.price);
    }
  };

  const handleSaveEdit = async () => {
    if (!saleToEdit) return;
    const qty = parseInt(editQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantity must be a positive integer");
      return;
    }
    if (qty > editAvailableStock) {
      toast.error(`Insufficient stock! Available: ${editAvailableStock} cubes`);
      return;
    }
    if (!editPricePerCube || editPricePerCube <= 0) {
      toast.error("Price per cube must be a valid positive number");
      return;
    }

    setEditLoading(true);
    try {
      await updateSale({
        id: saleToEdit.id,
        cube_type: editCubeType,
        quantity: qty,
        price_per_cube: parseFloat(editPricePerCube),
        payment_type: editPaymentType,
        edited_by: user?.fullName || 'Staff Operator'
      });
      toast.success(`Sale ${saleToEdit.sale_code} updated successfully.`);
      setEditModalOpen(false);
      setSaleToEdit(null);
    } catch (err) {
      toast.error(err.message || "Failed to update sale");
    } finally {
      setEditLoading(false);
    }
  };

  // Searching and sorting table records
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    let result = sales.slice();

    // Search query filter
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      result = result.filter(s =>
        s.sale_code.toLowerCase().includes(query) ||
        (s.customer?.name || '').toLowerCase().includes(query)
      );
    }

    // Sort operations
    result.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // Deep resolves
      if (sortKey === 'customerName') {
        valA = a.customer?.name || '';
        valB = b.customer?.name || '';
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [sales, searchQuery, sortKey, sortDirection]);

  if (salesLoading || inventoryLoading || !customers) {
    return (
      <div className="space-y-6">
        {/* 1. Live Stock indicators Strip Skeleton */}
        <div className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 h-14" />
        
        {/* 2. Search & Order Trigger Skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl h-10 w-full max-w-md" />
          <div className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl h-10 w-28" />
        </div>

        {/* 3. Sales Table Skeleton */}
        <div className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* 1. Live Stock indicators Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-3.5 sm:p-4 flex flex-wrap items-center gap-3 sm:gap-4 justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-navy-500 animate-pulse" />
          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Live Warehouse Stock
          </span>
        </div>
        
        <div className="flex items-center space-x-4 sm:space-x-6">
          <div className="flex items-center space-x-2">
            <Badge type="MFC" label="MFC" />
            <span className="text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
              {stockMap.MFC.qty.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Badge type="RSC" label="RSC" />
            <span className="text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
              {stockMap.RSC.qty.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Badge type="BNC" label="BNC" />
            <span className="text-xs sm:text-sm font-bold font-mono text-slate-800 dark:text-slate-200">
              {stockMap.BNC.qty.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Search & Order Trigger */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 focus:ring-navy-500 focus:border-navy-500 rounded-xl text-slate-900 dark:text-slate-100 shadow-xs focus:outline-none focus:ring-2 focus:ring-opacity-50 transition min-h-[40px]"
            placeholder="Search sale by code or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* New Order Trigger */}
        <Button
          variant="primary"
          onClick={handleOpenWizard}
          className="flex items-center justify-center space-x-2 rounded-xl"
        >
          <ShoppingCart size={16} />
          <span>New Order</span>
        </Button>
      </div>

      {/* 3. Sales Table */}
      <Table
        enablePagination={false}
        compact
        headers={[
          { key: 'sale_code', label: 'Sale Code', sortable: true },
          { key: 'customerName', label: 'Customer', sortable: true },
          { key: 'cube_type', label: 'Cube Type', sortable: true },
          { key: 'quantity', label: 'Qty', sortable: true },
          { key: 'total_amount', label: 'Amount', sortable: true },
          { key: 'payment_type', label: 'Payment', sortable: true },
          { key: 'sale_date', label: 'Date', sortable: true },
          { key: 'bill', label: isAdmin ? 'Actions' : 'Invoice', sortable: false }
        ]}
        data={filteredSales}
        isLoading={salesLoading}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={handleSort}
        emptyMessage="No sales recorded in the system ledger."
        renderRow={(sale) => {
          const isMultiItem = (sale.sale_items?.length || 0) > 1;
          return (
          <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800">
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono font-medium text-navy-600 dark:text-navy-400">{sale.sale_code}</td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-semibold text-slate-900 dark:text-slate-100">{sale.customer?.name}</td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
              {isMultiItem ? (
                <Badge type="mixed" label="MIXED" />
              ) : (
                <Badge type={sale.cube_type === 'manufactured' ? 'MFC' : 'RSC'} />
              )}
            </td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-mono">{sale.quantity.toLocaleString()}</td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 font-semibold font-mono text-slate-800 dark:text-slate-200">LKR {sale.total_amount.toLocaleString()}</td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3"><Badge type={sale.payment_type} /></td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(sale.sale_date).toLocaleString()}</td>
            <td className="px-2.5 sm:px-4 py-2.5 sm:py-3">
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleViewClick(sale)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center"
                  title="View Bill Preview"
                  aria-label="View Bill Preview"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={() => downloadInvoice(sale)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center"
                  title="Download Bill PDF"
                  aria-label="Download Bill PDF"
                >
                  <FileDown size={16} />
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => !isMultiItem && handleEditClick(sale)}
                      disabled={isMultiItem}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[32px] min-h-[32px] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title={isMultiItem ? "Editing multi-item bills isn't supported yet" : "Edit Sale Record"}
                      aria-label="Edit Sale Record"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(sale)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition min-w-[32px] min-h-[32px] flex items-center justify-center"
                      title="Delete Sale Record"
                      aria-label="Delete Sale Record"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </td>
          </tr>
          );
        }}
      />

      {/* --- Checkout Order Wizard Modal --- */}
      <Modal
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        title={`New Order Checkout (Step ${step}/4)`}
        size="lg"
      >
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-1">
            {Array.from({ length: 4 }).map((_, idx) => (
              <span 
                key={idx} 
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx + 1 === step 
                    ? 'w-7 bg-navy-600' 
                    : idx + 1 < step 
                      ? 'w-3.5 bg-emerald-500' 
                      : 'w-2 bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center space-x-3">
            {step === 3 && (
              <div className="flex items-center space-x-2.5">
                <span className="flex items-center space-x-1">
                  <Badge type="MFC" label="MFC" />
                  <span className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300">
                    {stockMap.MFC.qty.toLocaleString()}
                  </span>
                </span>
                <span className="flex items-center space-x-1">
                  <Badge type="RSC" label="RSC" />
                  <span className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-300">
                    {stockMap.RSC.qty.toLocaleString()}
                  </span>
                </span>
              </div>
            )}
            <span className="text-[11px] sm:text-xs text-slate-400 font-semibold uppercase tracking-wider">
              {step === 1 && '1. Billing Terms'}
              {step === 2 && '2. Customer Profile'}
              {step === 3 && '3. Order Details'}
              {step === 4 && '4. Review & Confirm'}
            </span>
          </div>
        </div>

        {/* Wizard Form Panels */}
        
        {/* STEP 1: Payment Type Select */}
        {step === 1 && (
          <div className="space-y-3 py-1">
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              Select the payment terms for this factory cube order:
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setPaymentType('cash')}
                className={`p-4 sm:p-5 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
                  paymentType === 'cash'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/10'
                }`}
              >
                <div className={`p-2 rounded-full ${paymentType === 'cash' ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  <Check size={18} />
                </div>
                <span className="font-semibold text-xs sm:text-sm">Cash Sales</span>
                <span className="text-[10px] opacity-80">Immediate full payment</span>
              </button>
              
              <button
                type="button"
                onClick={() => setPaymentType('debt')}
                className={`p-4 sm:p-5 rounded-2xl border text-center transition flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
                  paymentType === 'debt'
                    ? 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/10'
                }`}
              >
                <div className={`p-2 rounded-full ${paymentType === 'debt' ? 'bg-rose-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  <Check size={18} />
                </div>
                <span className="font-semibold text-xs sm:text-sm">Debt Credit</span>
                <span className="text-[10px] opacity-80">Added to debt ledger</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Customer Select or Create */}
        {step === 2 && (
          <div className="space-y-3 py-1">
            {!showMiniCustomerForm ? (
              <>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  Search existing registry or register new client:
                </p>
                <div className="relative">
                  <Input
                    label="Customer Search Query"
                    name="custSearch"
                    placeholder="Enter customer name or phone number..."
                    value={customerSearchQuery}
                    onFocus={() => setCustomerFieldFocused(true)}
                    onBlur={() => setCustomerFieldFocused(false)}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      if (customerId) setCustomerId(''); // Reset ID on retype
                    }}
                  />
                  {/* Droplist Results — shows the full registry on focus, filters as you type */}
                  {customerFieldFocused && !customerId && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-36 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 divide-y divide-slate-100 dark:divide-slate-800 touch-scroll">
                      {filteredCustomersForSearch.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 text-center">
                          No matching profiles.
                        </div>
                      ) : (
                        filteredCustomersForSearch.map(c => (
                          <div
                            key={c.id}
                            className="p-2.5 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between items-center text-slate-800 dark:text-slate-200"
                            onMouseDown={(e) => { e.preventDefault(); selectCustomer(c); }}
                          >
                            <span className="font-semibold">{c.name}</span>
                            <span className="font-mono text-slate-400">{c.whatsapp_number || c.contact_number}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="text-center pt-1.5">
                  <span className="text-xs text-slate-400">Not in system registry?</span>{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMiniCustomerForm(true);
                      setCustomerId('');
                    }}
                    className="text-xs text-navy-600 dark:text-sky-400 font-bold hover:underline"
                  >
                    Register Mini-Form
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3 bg-slate-50 dark:bg-slate-800/20 p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Quick Registration Form
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Name (Required)"
                    name="newName"
                    placeholder="e.g. John Doe"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                  />
                  <Input
                    label="WhatsApp Number (10 Digits)"
                    name="newPhone"
                    placeholder="e.g. 0771234567"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                  />
                </div>
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowMiniCustomerForm(false)}
                    className="text-xs text-slate-400 font-bold hover:underline"
                  >
                    Back to Registry Search
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Order details — fixed Production (MFC) / Resell (RSC) rows */}
        {step === 3 && (
          <div className="space-y-3 py-1">
            {/* Column Headers */}
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
              <span>Cube Type</span>
              <span>Rate / Cube (LKR)</span>
              <span>Qty</span>
              <span>Total</span>
            </div>

            {/* Order Rows — always both categories, no add/remove */}
            <div className="space-y-2">
              {orderRows.map((row) => {
                const rowTotal = (parseInt(row.quantity, 10) || 0) * (parseFloat(row.pricePerCube) || 0);
                const availableStock = row.cubeType === 'manufactured' ? stockMap.MFC.qty : stockMap.RSC.qty;
                const rateIsCustom = hasCustomRate(row.cubeType);
                return (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
                    <div className="flex items-center px-2 py-2">
                      <Badge type={row.cubeType === 'manufactured' ? 'MFC' : 'RSC'} label={row.cubeType === 'manufactured' ? 'Production (MFC)' : 'Resell (RSC)'} />
                    </div>
                    <div className="flex flex-col space-y-0.5">
                      <input
                        type="number"
                        step="0.01"
                        disabled={!isAdmin}
                        value={row.pricePerCube}
                        onChange={(e) => updateRow(row.id, 'pricePerCube', e.target.value)}
                        title={isAdmin ? 'Editable — overrides the auto-fetched rate for this order' : 'Auto-fetched rate — editable by Administrators only'}
                        className={`px-2 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-navy-500 font-mono ${!isAdmin ? 'opacity-70' : ''}`}
                      />
                      <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-400 px-0.5">
                        {rateIsCustom ? 'Customer rate' : 'Inventory default'}
                      </span>
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder={`max ${availableStock}`}
                        value={row.quantity}
                        onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                        className="w-full px-2 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-navy-500 font-mono"
                      />
                    </div>
                    <span className="text-xs font-bold font-mono text-navy-600 dark:text-sky-400 min-w-[70px] text-right py-2">
                      LKR {rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Totals + Debt Summary */}
            <div className="space-y-2 pt-1">
              {/* Auto-Calculated Total */}
              <div className="p-3 bg-navy-50/50 dark:bg-navy-950/20 border border-navy-100 dark:border-navy-900/50 rounded-xl flex justify-between items-center">
                <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">Auto-Calculated Total:</span>
                <span className="text-base sm:text-lg font-extrabold font-heading text-navy-600 dark:text-sky-400">
                  LKR {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Existing Debt Amount — shown whenever a customer is selected */}
              {(customerId || showMiniCustomerForm) && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl flex justify-between items-center">
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">Existing Debt Amount:</span>
                  <span className="text-sm font-extrabold font-heading text-red-600 dark:text-red-400">
                    LKR {customerPendingDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Cash order — preview how this payment applies FIFO against existing debt.
                  The sale itself still saves as a full cash order for calculatedTotal;
                  this box only previews the FIFO offset performed server-side. */}
              {paymentType === 'cash' && customerPendingDebt > 0 && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-xl space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Applied to Existing Debt (FIFO):</span>
                    <span className="text-sm font-extrabold font-heading text-emerald-700 dark:text-emerald-400">
                      LKR {Math.min(calculatedTotal, customerPendingDebt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">Remaining Debt After:</span>
                    <span className="text-xs font-bold text-emerald-600/80 dark:text-emerald-400/80">
                      LKR {Math.max(0, customerPendingDebt - calculatedTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 pt-0.5">
                    This order still saves as a full cash sale of LKR {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}.
                  </p>
                </div>
              )}

              {/* Debt order — projected total debt after this order is added */}
              {paymentType === 'debt' && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl flex justify-between items-center">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Total Debt After Order:</span>
                  <span className="text-sm font-extrabold font-heading text-amber-700 dark:text-amber-400">
                    LKR {(customerPendingDebt + calculatedTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: Review and Confirm Order */}
        {step === 4 && (
          <div className="space-y-3 py-1">
            <p className="text-xs text-slate-500">
              Please double check checkout summary details before factory order completion:
            </p>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-150 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-3.5 sm:p-4 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs py-1">
                <span className="text-slate-400">Customer</span>
                <span className="font-semibold text-right text-slate-800 dark:text-slate-200">
                  {showMiniCustomerForm ? newCustName : customers.find(c => c.id === Number(customerId))?.name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs py-1">
                <span className="text-slate-400">WhatsApp Phone</span>
                <span className="font-mono text-right text-slate-800 dark:text-slate-200">
                  {showMiniCustomerForm ? newCustPhone : (customers.find(c => c.id === Number(customerId))?.whatsapp_number || customers.find(c => c.id === Number(customerId))?.contact_number)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs py-1">
                <span className="text-slate-400">Billing Terms</span>
                <span className="font-bold uppercase text-right text-slate-800 dark:text-slate-200">
                  {paymentType}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs py-1">
                <span className="text-slate-400">Existing Debt</span>
                <span className={`font-mono text-right ${customerPendingDebt > 0 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                  LKR {customerPendingDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs py-1">
                <span className="text-slate-400">New Order</span>
                <span className="font-mono text-right text-slate-800 dark:text-slate-200">
                  LKR {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              {/* Per-row summary — only rows the operator actually filled in */}
              {orderRows.filter(row => (parseInt(row.quantity, 10) || 0) > 0).map((row, idx) => {
                const rate = parseFloat(row.pricePerCube) || 0;
                const rowTotal = (parseInt(row.quantity, 10) || 0) * rate;
                return (
                  <div key={row.id} className="grid grid-cols-2 gap-2 text-xs py-1">
                    <span className="text-slate-400">Item {idx + 1} ({row.cubeType === 'manufactured' ? 'MFC' : 'RSC'})</span>
                    <span className="font-mono text-right text-slate-800 dark:text-slate-200">
                      {parseInt(row.quantity, 10).toLocaleString()} × LKR {rate.toFixed(2)} = LKR {rowTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-2 text-sm pt-2 font-bold text-navy-600 dark:text-sky-400">
                <span>Invoiced Amount</span>
                <span className="font-heading text-right">
                  LKR {calculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div className="flex justify-between items-center mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          {step > 1 ? (
            <Button variant="secondary" onClick={prevStep} disabled={actionLoading} className="flex items-center space-x-1">
              <ArrowLeft size={14} />
              <span>Back</span>
            </Button>
          ) : (
            <div /> // Spacer
          )}

          {step < 4 ? (
            <Button variant="primary" onClick={nextStep} className="flex items-center space-x-1">
              <span>Next</span>
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button variant="primary" onClick={handlePlaceOrder} isLoading={actionLoading} className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700">
              <Check size={16} />
              <span>Complete Order</span>
            </Button>
          )}
        </div>
      </Modal>


      {/* --- WhatsApp Confirmation Prompt Dialog --- */}
      <ConfirmDialog
        isOpen={whatsappPromptOpen}
        onClose={() => {
          setWhatsappPromptOpen(false);
          setPlacedSaleRecord(null);
        }}
        onConfirm={handleSendWhatsApp}
        title="Send Invoice to WhatsApp?"
        message={`Sale order complete. Would you like to launch WhatsApp to send the invoice notification message to customer: ${placedSaleRecord?.customer?.name}?`}
        confirmLabel="Send Notification"
        cancelLabel="Skip Notification"
        variant="primary"
      />

      {/* --- Delete Confirmation Modal --- */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setSaleToDelete(null);
        }}
        title="Delete Sale Ledger Entry"
        size="sm"
      >
        <div className="space-y-4 py-2 text-sm text-slate-600 dark:text-slate-300">
          <p>
            Are you sure you want to delete the sale transaction <strong className="text-slate-850 dark:text-slate-100">{saleToDelete?.sale_code}</strong>?
          </p>
          <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 p-3 rounded-lg border border-amber-200/50 dark:border-amber-900/30 text-xs">
            <strong>Warning:</strong> This will permanently delete the invoice ledger record and any associated pending debts.
          </div>
          <p className="text-xs">
            Please choose how you would like to handle the stock adjustment:
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2 mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setDeleteConfirmOpen(false);
              setSaleToDelete(null);
            }}
            disabled={deleteLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          
          <Button
            variant="danger"
            onClick={() => handleConfirmDelete(false)}
            isLoading={deleteLoading}
            className="w-full sm:w-auto"
          >
            Delete Sale Only
          </Button>
          
          <Button
            variant="primary"
            onClick={() => handleConfirmDelete(true)}
            isLoading={deleteLoading}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 border-emerald-600 hover:border-emerald-700"
          >
            Delete & Restore Stock
          </Button>
        </div>
      </Modal>

      {/* --- View Bill Preview Modal --- */}
      <Modal
        isOpen={viewModalOpen}
        onClose={handleCloseViewModal}
        title={`Bill Preview ${viewSale ? `— ${viewSale.sale_code}` : ''}`}
        size="2xl"
      >
        <div className="space-y-3">
          {viewPdfUrl && (
            <iframe
              src={viewPdfUrl}
              title="Bill PDF Preview"
              className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-800"
            />
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => viewSale && downloadInvoice(viewSale)}
              className="flex items-center space-x-1.5"
            >
              <FileDown size={16} />
              <span>Download PDF</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* --- Edit Bill Modal --- */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSaleToEdit(null);
        }}
        title={`Edit Sale ${saleToEdit ? `— ${saleToEdit.sale_code}` : ''}`}
        size="md"
      >
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Cube Type"
              name="editCubeType"
              options={[
                { value: 'manufactured', label: 'Production (MFC)' },
                { value: 'resell', label: 'Resell (RSC)' }
              ]}
              value={editCubeType}
              onChange={(e) => handleEditCubeTypeChange(e.target.value)}
            />
            <Select
              label="Payment Terms"
              name="editPaymentType"
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'debt', label: 'Debt' }
              ]}
              value={editPaymentType}
              onChange={(e) => setEditPaymentType(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Rate per Cube (LKR)"
              name="editPrice"
              type="number"
              step="0.01"
              value={editPricePerCube}
              onChange={(e) => setEditPricePerCube(e.target.value)}
            />
            <Input
              label="Order Quantity"
              name="editQty"
              type="number"
              value={editQuantity}
              onChange={(e) => setEditQuantity(e.target.value)}
            />
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400">Available Stock:</span>
            <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{editAvailableStock.toLocaleString()}</span>
          </div>

          <div className="p-3.5 bg-navy-50/50 dark:bg-navy-950/20 border border-navy-100 dark:border-navy-900/50 rounded-xl flex justify-between items-center">
            <span className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300">Recalculated Total:</span>
            <span className="text-base sm:text-lg font-extrabold font-heading text-navy-600 dark:text-sky-400">
              LKR {editCalculatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {saleToEdit?.payment_type === 'debt' && editPaymentType === 'cash' && (
            <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 p-3 rounded-lg border border-amber-200/50 dark:border-amber-900/30 text-xs">
              <strong>Note:</strong> Switching to cash will remove this sale's debt ledger entry. This is only allowed if no payment has been settled against it yet.
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          <Button
            variant="secondary"
            onClick={() => {
              setEditModalOpen(false);
              setSaleToEdit(null);
            }}
            disabled={editLoading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSaveEdit}
            isLoading={editLoading}
            className="flex items-center space-x-1.5"
          >
            <Check size={16} />
            <span>Save Changes</span>
          </Button>
        </div>
      </Modal>

    </div>
  );
}
