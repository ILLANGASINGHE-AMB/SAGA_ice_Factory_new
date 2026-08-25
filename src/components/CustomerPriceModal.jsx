import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Badge } from './Badge';
import { X } from 'lucide-react';

// Admin-only editor for a customer's per-cube custom rates. Leaving a field
// blank (or clearing it) means "no override" — the New Order wizard falls
// back to the live inventory rate for that cube type.
export function CustomerPriceModal({
  isOpen,
  onClose,
  customer,
  customerPrices,
  inventoryDefaults, // { MFC: price, RSC: price }
  setCustomPrice,
  clearCustomPrice,
  onSaved
}) {
  const [mfcRate, setMfcRate] = useState('');
  const [rscRate, setRscRate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !customer) return;
    const existingMfc = customerPrices.find(p => Number(p.customer_id) === Number(customer.id) && p.cube_type === 'manufactured');
    const existingRsc = customerPrices.find(p => Number(p.customer_id) === Number(customer.id) && p.cube_type === 'resell');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMfcRate(existingMfc ? String(existingMfc.price_per_cube) : '');
    setRscRate(existingRsc ? String(existingRsc.price_per_cube) : '');
  }, [isOpen, customer, customerPrices]);

  if (!customer) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const mfcVal = parseFloat(mfcRate);
      const rscVal = parseFloat(rscRate);

      if (mfcRate.trim() === '') {
        await clearCustomPrice(customer.id, 'manufactured');
      } else if (mfcVal > 0) {
        await setCustomPrice(customer.id, 'manufactured', mfcVal);
      } else {
        throw new Error("Production (MFC) rate must be a positive number, or left blank to use the default.");
      }

      if (rscRate.trim() === '') {
        await clearCustomPrice(customer.id, 'resell');
      } else if (rscVal > 0) {
        await setCustomPrice(customer.id, 'resell', rscVal);
      } else {
        throw new Error("Resell (RSC) rate must be a positive number, or left blank to use the default.");
      }

      onSaved({ mode: 'success', name: customer.name });
      onClose();
    } catch (err) {
      onSaved({ mode: 'error', error: err.message || "Failed to save custom prices" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Custom Cube Prices — ${customer.name}`}
      size="md"
    >
      <div className="space-y-4 py-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Set a rate that overrides the inventory default whenever this customer is selected in New Order. Leave a field blank to use the default rate.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2 shrink-0">
              <Badge type="MFC" label="Production (MFC)" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-400 font-mono">
                Default: {Number(inventoryDefaults.MFC || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <input
                type="number"
                step="0.01"
                placeholder="Use default"
                value={mfcRate}
                onChange={(e) => setMfcRate(e.target.value)}
                className="w-28 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-navy-500 font-mono text-right"
              />
              {mfcRate !== '' && (
                <button
                  type="button"
                  onClick={() => setMfcRate('')}
                  title="Clear override — use default"
                  className="p-1 rounded text-slate-400 hover:text-red-500 transition"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2 shrink-0">
              <Badge type="RSC" label="Resell (RSC)" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-slate-400 font-mono">
                Default: {Number(inventoryDefaults.RSC || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <input
                type="number"
                step="0.01"
                placeholder="Use default"
                value={rscRate}
                onChange={(e) => setRscRate(e.target.value)}
                className="w-28 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-navy-500 font-mono text-right"
              />
              {rscRate !== '' && (
                <button
                  type="button"
                  onClick={() => setRscRate('')}
                  title="Clear override — use default"
                  className="p-1 rounded text-slate-400 hover:text-red-500 transition"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-2 mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
          Save Prices
        </Button>
      </div>
    </Modal>
  );
}
