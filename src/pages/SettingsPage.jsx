import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useCustomers } from '../hooks/useCustomers';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Button } from '../components/Button';
import { Input, TextArea } from '../components/FormFields';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activityLog';
import { testGeminiApiKey } from '../services/sagaAiService';
import {
  Building,
  Building2,
  Upload,
  Palette,
  ShieldAlert,
  Download,
  FolderSync,
  Trash2,
  AlertOctagon,
  Cpu,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  Plus,
  Edit2,
  X
} from 'lucide-react';

export function SettingsPage() {
  const { settings, isLoading, updateSettings } = useSettings();
  const { customers, addCustomer: addCustomerRecord, updateCustomer: updateCustomerRecord, deleteCustomer: deleteCustomerRecord } = useCustomers();
  const { isAdmin } = useAuth();
  const toast = useToast();

  // Branch customers: permanent "customers" flagged is_branch, managed here
  const branches = useMemo(() => (customers || []).filter(c => c.is_branch), [customers]);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchNotes, setBranchNotes] = useState('');
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchDeleteTarget, setBranchDeleteTarget] = useState(null);
  const [branchDeleteConfirmOpen, setBranchDeleteConfirmOpen] = useState(false);
  const [branchDeleteLoading, setBranchDeleteLoading] = useState(false);

  // Settings form states
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoBase64, setLogoBase64] = useState(null);
  const [faviconBase64, setFaviconBase64] = useState(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Appearance states (synced with AppShell localStorage triggers)
  const [isDark, setIsDark] = useState(localStorage.getItem('saga_ice_theme') === 'dark');
  const [textSize, setTextSize] = useState(localStorage.getItem('saga_ice_text_size') || 'medium');

  // Import JSON File states
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  // Clear Database states
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);

  // Sync appearance options from external triggers (like the sidebar)
  useEffect(() => {
    const syncSettings = () => {
      setIsDark(localStorage.getItem('saga_ice_theme') === 'dark');
      setTextSize(localStorage.getItem('saga_ice_text_size') || 'medium');
    };
    window.addEventListener('theme-changed', syncSettings);
    window.addEventListener('storage', syncSettings);
    return () => {
      window.removeEventListener('theme-changed', syncSettings);
      window.removeEventListener('storage', syncSettings);
    };
  }, []);

  // Pre-fill form fields when settings load
  useEffect(() => {
    if (settings) {
      setCompanyName(settings.company_name || '');
      setAddress(settings.company_address || '');
      setPhone(settings.company_phone || '');
      setEmail(settings.company_email || '');
      setLogoBase64(settings.logo_url || null);
      setFaviconBase64(settings.favicon_url || null);
      const savedKey = settings.gemini_api_key || localStorage.getItem('saga_gemini_api_key') || '';
      setGeminiApiKey(savedKey);
      const isEnabled = settings.ai_enabled !== undefined ? settings.ai_enabled : (localStorage.getItem('saga_ai_enabled') !== 'false');
      setAiEnabled(isEnabled);
    }
  }, [settings]);

  // Handle logo upload and base64 conversion
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (< 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image file must be under 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoBase64(event.target.result);
      toast.info("Logo uploaded successfully. Save settings to apply.");
    };
    reader.readAsDataURL(file);
  };

  // Handle favicon upload and base64 conversion
  const handleFaviconUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file size (< 500KB)
    if (file.size > 500 * 1024) {
      toast.error("Favicon file must be under 500KB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setFaviconBase64(event.target.result);
      toast.info("Favicon uploaded successfully. Save settings to apply.");
    };
    reader.readAsDataURL(file);
  };

  // Test SAGA AI Gemini API Key Connection
  const handleTestAiConnection = async () => {
    if (!geminiApiKey.trim()) {
      toast.error("Please enter a Gemini API Key to test");
      return;
    }

    setTestingAi(true);
    try {
      const res = await testGeminiApiKey(geminiApiKey.trim());
      toast.success(`SAGA AI Connected! Model: ${res.modelUsed}`);
    } catch (err) {
      toast.error(`Connection Test Failed: ${err.message}`);
    } finally {
      setTestingAi(false);
    }
  };

  // Save branding & SAGA AI settings
  const handleSaveBranding = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("Company Name is required");
      return;
    }

    setSaveLoading(true);
    try {
      await updateSettings({
        company_name: companyName.trim(),
        company_address: address.trim(),
        company_phone: phone.trim(),
        company_email: email.trim(),
        logo_url: logoBase64,
        favicon_url: faviconBase64,
        gemini_api_key: geminiApiKey.trim(),
        ai_enabled: aiEnabled
      });
      // Clean up legacy client-side localStorage API key to avoid browser exposure
      localStorage.removeItem('saga_gemini_api_key');
      toast.success("Settings & SAGA AI configuration saved successfully (Server Edge Proxy Active)!");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaveLoading(false);
    }
  };

  // Appearance Actions (toggles dark class and dispatches triggers to AppShell)
  const toggleTheme = (val) => {
    setIsDark(val);
    localStorage.setItem('saga_ice_theme', val ? 'dark' : 'light');
    if (val) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Dispatch custom event to notify AppShell
    window.dispatchEvent(new Event('theme-changed'));
    toast.success(`Theme updated to ${val ? 'Dark' : 'Light'} Mode`);
  };

  const changeTextSize = (size) => {
    setTextSize(size);
    localStorage.setItem('saga_ice_text_size', size);
    
    const sizeMap = {
      small: '14px',
      medium: '16px',
      large: '18px'
    };
    document.documentElement.style.setProperty('--text-base-size', sizeMap[size]);
    window.dispatchEvent(new Event('theme-changed'));
    toast.success(`Text scaling adjusted to ${size.toUpperCase()}`);
  };

  // --- Backup & Data Recovery Operations ---

  // Export tables to JSON file
  const handleBackupToPC = async () => {
    try {
      const [
        { data: profiles },
        { data: inventory },
        { data: customers },
        { data: sales },
        { data: saleItems },
        { data: debts },
        { data: settlements },
        { data: settingsData }
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('inventory').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('sales').select('*'),
        supabase.from('sale_items').select('*'),
        supabase.from('debts').select('*'),
        supabase.from('debt_settlements').select('*'),
        supabase.from('settings').select('*')
      ]);

      const backup = {
        profiles:         profiles || [],
        inventory:        inventory || [],
        customers:        customers || [],
        sales:            sales || [],
        sale_items:       saleItems || [],
        debts:            debts || [],
        debt_settlements: settlements || [],
        settings:         settingsData || [],
        exported_at:      new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `sagacious_cube_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Database exported to PC successfully!");
      logActivity({ action: 'export', entityType: 'database', description: 'Exported a full database backup to PC' });
    } catch (err) {
      toast.error(err.message || "Backup compilation failed");
    }
  };

  // Import tables from JSON file triggers
  const handleFileImportSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedImportFile(file);
    setImportConfirmOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!selectedImportFile) return;
    setImportLoading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // Validate basic keys presence before clearing DB
        const requiredKeys = ['profiles', 'inventory', 'customers', 'sales', 'debts', 'debt_settlements', 'settings'];
        const hasAllKeys = requiredKeys.every(k => Array.isArray(data[k]));
        
        if (!hasAllKeys) {
          throw new Error("Invalid backup schema. Required collections missing.");
        }

        // Deletion in reverse dependency order (sale_items cascades from
        // sales' FK, but deleted explicitly here too for parity with the
        // rest of this list)
        await supabase.from('debt_settlements').delete().neq('id', -1);
        await supabase.from('debts').delete().neq('id', -1);
        await supabase.from('sale_items').delete().neq('id', -1);
        await supabase.from('sales').delete().neq('id', -1);
        await supabase.from('customers').delete().neq('id', -1);
        await supabase.from('inventory').delete().neq('id', -1);
        await supabase.from('settings').delete().neq('id', -1);
        await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Insertion in dependency order. sale_items is optional for
        // backward compatibility with backups exported before it existed.
        if (data.profiles.length) await supabase.from('profiles').insert(data.profiles);
        if (data.settings.length) await supabase.from('settings').insert(data.settings);
        if (data.inventory.length) await supabase.from('inventory').insert(data.inventory);
        if (data.customers.length) await supabase.from('customers').insert(data.customers);
        if (data.sales.length) await supabase.from('sales').insert(data.sales);
        if (data.sale_items?.length) await supabase.from('sale_items').insert(data.sale_items);
        if (data.debts.length) await supabase.from('debts').insert(data.debts);
        if (data.debt_settlements.length) await supabase.from('debt_settlements').insert(data.debt_settlements);


        toast.success("Database restored from backup file successfully! Refreshing database hooks.");
        logActivity({ action: 'restore', entityType: 'database', description: 'Restored the database from a backup file' });
        setImportConfirmOpen(false);
        setSelectedImportFile(null);
        // Force page reload after small timeout to reset hooks cleanly
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast.error(`Import failed: ${err.message}`);
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsText(selectedImportFile);
  };

  // --- Admin-Only Clear Database Operation ---
  const handleClearAllData = async () => {
    setClearLoading(true);
    try {
      // Delete records from every operational table, children before parents
      // so FK constraints (e.g. transport_trips.employee_id on delete restrict)
      // never block a step. Master/config tables (settings, profiles,
      // code_counters, expense_categories, expense_items, inventory rows) are
      // preserved; inventory quantities are reset to 0 instead of deleted.
      const tablesInOrder = [
        'debt_settlements',
        'debts',
        'sale_items',
        'sales',
        'customer_cube_prices',
        'customers',
        'transport_trips',
        'vehicle_trips',
        'vehicles',
        'employee_attendance',
        'employees',
        'expense_amounts',
        'expense_ledger_rows',
        'daily_manager_reports',
        'cheque_records',
        'bank_deposits',
        'cash_receives',
        'bank_withdrawals',
        'notes',
        'activity_log',
        'inventory_transactions',
      ];

      for (const table of tablesInOrder) {
        const { error } = await supabase.from(table).delete().neq('id', -1);
        if (error) throw new Error(`${table}: ${error.message}`);
      }

      // `trash` has no delete policy of its own (writes only happen through
      // the purge_trash_item/restore_trash_item RPCs), so a plain
      // .delete() here would silently remove zero rows under RLS.
      const { error: trashError } = await supabase.rpc('purge_all_trash');
      if (trashError) throw new Error(`trash: ${trashError.message}`);

      // Inventory rows themselves (MFC/RSC/BNC) are kept: Sales/New Order's
      // RPCs (place_multi_item_order_transaction etc.) look them up by
      // `type` and expect exactly one row to exist per cube type, so
      // deleting them would break order placement until someone manually
      // recreated the catalog. A full wipe instead zeroes stock and clears
      // the price list back to "not configured" (null, matching the
      // fresh-install seed's BNC row) — same end state (zero data) without
      // bricking Sales.
      const { error: invError } = await supabase
        .from('inventory')
        .update({ quantity: 0, price_per_cube: null, updated_at: new Date().toISOString() })
        .neq('id', -1);
      if (invError) throw new Error(`inventory: ${invError.message}`);

      // Clear local storage fallbacks
      localStorage.removeItem('saga_operating_expenses');
      localStorage.removeItem('saga_inventory_transactions');

      toast.success("All factory records and data cleared successfully!");
      // Logged after the wipe (activity_log itself was just cleared above),
      // so this becomes the first entry in the fresh log.
      logActivity({ action: 'delete', entityType: 'database', description: 'Cleared all factory records and data' });
      setClearConfirmOpen(false);

      // Reload page to refresh all active hooks and state
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      toast.error(`Failed to clear database: ${err.message}`);
    } finally {
      setClearLoading(false);
    }
  };

  // --- Set Branch: permanent branch "customers" (internal cube transfers) ---
  const resetBranchForm = () => {
    setEditingBranchId(null);
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('');
    setBranchNotes('');
  };

  const handleEditBranchClick = (branch) => {
    setEditingBranchId(branch.id);
    setBranchName(branch.name || '');
    setBranchAddress(branch.address || '');
    setBranchPhone(branch.contact_number || branch.whatsapp_number || '');
    setBranchNotes(branch.notes || '');
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    setBranchSaving(true);
    try {
      const payload = {
        name: branchName,
        contact_number: branchPhone,
        address: branchAddress,
        notes: branchNotes,
        is_branch: true
      };
      if (editingBranchId) {
        await updateCustomerRecord(editingBranchId, payload);
        toast.success(`Branch "${branchName}" updated.`);
      } else {
        await addCustomerRecord(payload);
        toast.success(`Branch "${branchName}" saved.`);
      }
      resetBranchForm();
    } catch (err) {
      toast.error(err.message || "Failed to save branch");
    } finally {
      setBranchSaving(false);
    }
  };

  const handleDeleteBranchClick = (branch) => {
    setBranchDeleteTarget(branch);
    setBranchDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteBranch = async () => {
    if (!branchDeleteTarget) return;
    setBranchDeleteLoading(true);
    try {
      await deleteCustomerRecord(branchDeleteTarget.id);
      toast.success(`Branch "${branchDeleteTarget.name}" deleted.`);
      setBranchDeleteConfirmOpen(false);
      setBranchDeleteTarget(null);
      if (editingBranchId === branchDeleteTarget.id) resetBranchForm();
    } catch (err) {
      toast.error(err.message || "Failed to delete branch");
    } finally {
      setBranchDeleteLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 h-80" />
      </div>
    );
  }

  // --- Limited Access View for Non-Admin Staff Users ---
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Info banner */}
        <div className="p-4 bg-navy-50 dark:bg-navy-950/40 border border-navy-200 dark:border-navy-800 rounded-2xl flex items-start space-x-3 text-xs text-navy-800 dark:text-navy-300">
          <Palette className="text-navy-600 dark:text-navy-400 shrink-0 mt-0.5" size={18} />
          <div>
            <span className="font-bold block text-sm mb-0.5">Staff Personal Preferences</span>
            <span>You have access to personal interface preferences (Theme mode & Font scale). Company branding, database backup, and SAGA AI configuration are reserved for System Administrators.</span>
          </div>
        </div>

        {/* Style & Themes Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Palette className="text-navy-500" size={20} />
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Style & Appearance
            </h3>
          </div>

          {/* Theme selection */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Theme Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleTheme(false)}
                className={`py-2.5 text-xs font-semibold rounded-xl border transition ${
                  !isDark 
                    ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                Light Theme
              </button>
              <button
                type="button"
                onClick={() => toggleTheme(true)}
                className={`py-2.5 text-xs font-semibold rounded-xl border transition ${
                  isDark 
                    ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                Dark Theme
              </button>
            </div>
          </div>

          {/* Text scale selectors */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Font Sizing Scale
            </span>
            <div className="grid grid-cols-3 gap-2">
              {['small', 'medium', 'large'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => changeTextSize(size)}
                  className={`py-2.5 text-xs font-semibold capitalize rounded-xl border transition ${
                    textSize === size 
                      ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400' 
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      
      {/* 1. Company Branding Settings Form */}
      <div className="md:col-span-2 space-y-6">
        <form onSubmit={handleSaveBranding} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Building className="text-navy-500" size={20} />
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Company Branding Settings
            </h3>
          </div>

          {/* Upload Grid (Logo + Favicon) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2 border-b border-slate-100 dark:border-slate-800 pb-6">
            
            {/* Logo upload wrapper */}
            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="relative w-20 h-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoBase64 ? (
                  <img src={logoBase64} alt="Company Logo" className="w-full h-full object-cover" />
                ) : (
                  <Building size={28} className="text-slate-300" />
                )}
              </div>
              
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Company Brand Logo
                </span>
                <div className="flex items-center space-x-2">
                  <label className="cursor-pointer inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-medium rounded-lg text-xs transition">
                    <Upload size={12} />
                    <span>Choose Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </label>
                  {logoBase64 && (
                    <button
                      type="button"
                      onClick={() => setLogoBase64(null)}
                      className="text-xs text-red-500 font-semibold hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  PNG/JPEG. Recommended: &lt; 2MB.
                </p>
              </div>
            </div>

            {/* Favicon upload wrapper */}
            <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
              <div className="relative w-20 h-20 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-center overflow-hidden flex-shrink-0">
                {faviconBase64 ? (
                  <img src={faviconBase64} alt="Browser Favicon" className="w-8 h-8 object-contain" />
                ) : (
                  <Building size={20} className="text-slate-300" />
                )}
              </div>
              
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Browser Tab Favicon
                </span>
                <div className="flex items-center space-x-2">
                  <label className="cursor-pointer inline-flex items-center justify-center space-x-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-medium rounded-lg text-xs transition">
                    <Upload size={12} />
                    <span>Choose Icon</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFaviconUpload}
                    />
                  </label>
                  {faviconBase64 && (
                    <button
                      type="button"
                      onClick={() => setFaviconBase64(null)}
                      className="text-xs text-red-500 font-semibold hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">
                  ICO/PNG/SVG. Recommended: &lt; 500KB.
                </p>
              </div>
            </div>

          </div>

          {/* Text fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Company Name"
              name="companyName"
              required
              placeholder="e.g. Sagacious Ice Factory"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <Input
              label="Contact Number"
              name="companyPhone"
              placeholder="e.g. 0771234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Branded Email"
              name="companyEmail"
              type="email"
              placeholder="e.g. billing@sagacious.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div /> {/* Spacer */}
          </div>

          <TextArea
            label="Corporate Address"
            name="companyAddress"
            placeholder="e.g. 102 Industrial Zone, Colombo, Sri Lanka"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          {/* SAGA AI Integration Configuration (Admin & Authorized Users) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cpu className="text-cyan-500" size={20} />
                <h4 className="text-sm font-bold font-heading text-slate-800 dark:text-slate-100">
                  SAGA AI (Gemini Integration)
                </h4>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                geminiApiKey 
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                  : 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
              }`}>
                {geminiApiKey ? 'SAGA AI Active' : 'Key Required'}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Configure your Google Gemini API key to enable <strong>SAGA AI</strong> system intelligence. AI requests are proxied securely via a server-side <strong>Supabase Edge Function</strong> so API keys are never exposed in browser network logs or client storage.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Google Gemini API Key
              </label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="e.g. AIzaSy..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-36 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-navy-500 dark:focus:border-cyan-500 transition"
                />
                <Key size={14} className="absolute left-3 text-slate-400" />
                <div className="absolute right-2 flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                    title={showApiKey ? 'Hide Key' : 'Show Key'}
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestAiConnection}
                    disabled={testingAi || !geminiApiKey.trim()}
                    className="px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-600 dark:text-cyan-400 text-[11px] font-bold rounded-lg transition border border-cyan-200 dark:border-cyan-800 disabled:opacity-40"
                  >
                    {testingAi ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            </div>

            {/* Toggle ON/OFF Switch */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Enable SAGA AI Assistant
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {aiEnabled ? 'SAGA AI floating button is ON across the system' : 'SAGA AI assistant is OFF and hidden'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  aiEnabled ? 'bg-navy-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    aiEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button variant="primary" type="submit" isLoading={saveLoading} className="rounded-xl px-5">
              Save Settings & SAGA AI Config
            </Button>
          </div>
        </form>
      </div>

      {/* 2. Style / Layout Toggles & Data Backup */}
      <div className="space-y-6">
        
        {/* Style & Themes Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Palette className="text-navy-500" size={20} />
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Style & Appearance
            </h3>
          </div>

          {/* Theme selection */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Theme Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => toggleTheme(false)}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  !isDark 
                    ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                Light Theme
              </button>
              <button
                type="button"
                onClick={() => toggleTheme(true)}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  isDark 
                    ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400' 
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                Dark Theme
              </button>
            </div>
          </div>

          {/* Text scale selectors */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Font Sizing Scale
            </span>
            <div className="grid grid-cols-3 gap-2">
              {['small', 'medium', 'large'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => changeTextSize(size)}
                  className={`py-2 text-xs font-semibold capitalize rounded-lg border transition ${
                    textSize === size 
                      ? 'bg-navy-50 dark:bg-navy-950/20 border-navy-500 text-navy-600 dark:text-navy-400' 
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Data Recovery / Backups Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <FolderSync className="text-navy-500" size={20} />
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Data Management
            </h3>
          </div>

          <p className="text-xs text-slate-400">
            Keep factory records safe. Export a JSON file locally or restore files from an existing backup:
          </p>

          <div className="space-y-3 pt-2">
            {/* Backup PC */}
            <Button
              variant="secondary"
              onClick={handleBackupToPC}
              className="w-full flex items-center justify-center space-x-2 py-2 rounded-xl text-slate-800 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Download size={15} />
              <span>Backup to Local PC</span>
            </Button>

            {/* Import PC */}
            <label className="w-full cursor-pointer flex items-center justify-center space-x-2 py-2 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/40 rounded-xl text-xs font-semibold transition border border-blue-200 dark:border-blue-900/50">
              <FolderSync size={15} />
              <span>Import from Backup</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileImportSelect}
              />
            </label>
          </div>
        </div>

        {/* Danger Zone: Clear Database (Admin Only) */}
        {isAdmin && (
          <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-red-100 dark:border-red-900/40 pb-3 text-red-600 dark:text-red-400">
              <AlertOctagon size={20} />
              <h3 className="text-base font-bold font-heading">
                Admin Danger Zone
              </h3>
            </div>

            <p className="text-xs text-red-700 dark:text-red-300 font-medium">
              Irreversibly wipe all operational records (customers, sales, debts, vehicles, employees, transport, expenses, cash & bank, notes, activity log) and reset inventory to zero stock with no prices set. Login accounts are preserved.
            </p>

            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Trash2 size={16} />
              <span>Clear All Data (Wipe Database)</span>
            </button>
          </div>
        )}

      </div>

      {/* 3. Set Branch — permanent branch "customers" for internal cube transfers (Admin Only) */}
      {isAdmin && (
        <div className="md:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Building2 className="text-navy-500" size={20} />
            <h3 className="text-base font-bold font-heading text-slate-800 dark:text-slate-100">
              Set Branch
            </h3>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Branches are saved permanently as Customers (visible in the Customers tab, selectable in Sales) and marked with a small red <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold align-middle mx-0.5">B</span> icon next to their name. Editing and deleting a branch is only possible here.
          </p>

          <form onSubmit={handleSaveBranch} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Branch Name"
              name="branchName"
              required
              placeholder="e.g. Branch PK"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
            <Input
              label="Phone Number"
              name="branchPhone"
              required
              placeholder="e.g. 0771234567"
              value={branchPhone}
              onChange={(e) => setBranchPhone(e.target.value)}
            />
            <Input
              label="Address"
              name="branchAddress"
              placeholder="e.g. 45 Branch Road, Kandy"
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
            />
            <Input
              label="Notes (optional)"
              name="branchNotes"
              placeholder="Any additional info..."
              value={branchNotes}
              onChange={(e) => setBranchNotes(e.target.value)}
            />

            <div className="sm:col-span-2 flex items-center justify-end space-x-2 pt-1">
              {editingBranchId && (
                <Button type="button" variant="secondary" onClick={resetBranchForm} className="flex items-center space-x-1.5">
                  <X size={14} />
                  <span>Cancel Edit</span>
                </Button>
              )}
              <Button type="submit" variant="primary" isLoading={branchSaving} className="flex items-center space-x-1.5 rounded-xl">
                {editingBranchId ? <Edit2 size={14} /> : <Plus size={14} />}
                <span>{editingBranchId ? 'Update Branch' : 'Save Branch'}</span>
              </Button>
            </div>
          </form>

          {branches.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Saved Branches
              </span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {branches.map((branch) => (
                  <div key={branch.id} className="flex items-center justify-between py-2.5 gap-3 flex-wrap">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold shrink-0">B</span>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate block">{branch.name}</span>
                        <span className="text-[11px] text-slate-400 truncate block">
                          {branch.contact_number || branch.whatsapp_number || 'No phone'}{branch.address ? ` • ${branch.address}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={() => handleEditBranchClick(branch)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-navy-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Edit Branch"
                        aria-label="Edit Branch"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteBranchClick(branch)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition"
                        title="Delete Branch"
                        aria-label="Delete Branch"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Import Confirmation Modal --- */}
      <ConfirmDialog
        isOpen={importConfirmOpen}
        onClose={() => {
          setImportConfirmOpen(false);
          setSelectedImportFile(null);
        }}
        onConfirm={handleConfirmImport}
        title="Restore Database from Backup?"
        message="WARNING: Importing data will completely erase and overwrite all current customers, sales history, settings, and outstanding debts. This action is irreversible. Do you want to proceed?"
        confirmLabel="Overwrite DB"
        isLoading={importLoading}
      />

      {/* --- Clear All Database Data Confirmation Modal --- */}
      <ConfirmDialog
        isOpen={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={handleClearAllData}
        title="CRITICAL WARNING: Wipe All Factory Database Records?"
        message="ARE YOU ABSOLUTELY SURE? This will permanently DELETE all customers, sales orders, debts, vehicles & trips, employees & attendance, transport trips, expense ledgers, cash & bank records, notes, and the activity log/trash history. Inventory stock will drop to 0 and all cube prices will be cleared (unset) along with the stock movement history — the system returns to a blank, default state. Factory settings, login accounts, and item/expense category setup will be preserved. This action CANNOT be undone!"
        confirmLabel="YES, PERMANENTLY CLEAR ALL DATA"
        isLoading={clearLoading}
      />

      {/* --- Delete Branch Confirmation Modal --- */}
      <ConfirmDialog
        isOpen={branchDeleteConfirmOpen}
        onClose={() => {
          setBranchDeleteConfirmOpen(false);
          setBranchDeleteTarget(null);
        }}
        onConfirm={handleConfirmDeleteBranch}
        title="Delete Branch?"
        message={`Are you sure you want to delete the branch "${branchDeleteTarget?.name}"? This removes it from the Customers registry as well. Any unsettled debts against it must be cleared first.`}
        confirmLabel="Delete Branch"
        isLoading={branchDeleteLoading}
      />

    </div>
  );
}
