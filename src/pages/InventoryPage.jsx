import React, { useState } from 'react';
import { useInventory } from '../hooks/useInventory';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/FormFields';
import { Plus, Minus, Edit, TrendingUp, AlertTriangle } from 'lucide-react';

export function InventoryPage() {
  const { inventory, isLoading, addStock, removeStock, updatePrice } = useInventory();
  const { isAdmin } = useAuth();
  const toast = useToast();

  // Modal control states
  const [activeModal, setActiveModal] = useState(null); // 'add' | 'remove' | 'editPrice' | null
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Input states
  const [quantityInput, setQuantityInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const openModal = (type, item) => {
    setSelectedItem(item);
    setActiveModal(type);
    setQuantityInput('');
    setPriceInput(item.price_per_cube !== null ? item.price_per_cube.toString() : '');
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedItem(null);
    setQuantityInput('');
    setPriceInput('');
  };

  const handleAddStock = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid positive quantity");
      return;
    }

    setActionLoading(true);
    try {
      await addStock(selectedItem.id, qty);
      toast.success(`Successfully added ${qty} cubes to ${selectedItem.code}`);
      closeModal();
    } catch (err) {
      toast.error(err.message || "Failed to add stock");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveStock = async (e) => {
    e.preventDefault();
    const qty = parseInt(quantityInput, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid positive quantity");
      return;
    }
    if (qty > selectedItem.quantity) {
      toast.error(`Cannot remove more than available stock (${selectedItem.quantity})`);
      return;
    }

    setActionLoading(true);
    try {
      await removeStock(selectedItem.id, qty);
      toast.success(`Successfully removed ${qty} cubes from ${selectedItem.code}`);
      closeModal();
    } catch (err) {
      toast.error(err.message || "Failed to remove stock");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditPrice = async (e) => {
    e.preventDefault();
    const price = parseFloat(priceInput);
    if (isNaN(price) || price < 0) {
      toast.error("Please enter a valid price");
      return;
    }

    setActionLoading(true);
    try {
      await updatePrice(selectedItem.id, price);
      toast.success(`Updated price for ${selectedItem.code} to LKR ${price.toFixed(2)}`);
      closeModal();
    } catch (err) {
      toast.error(err.message || "Failed to update price");
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 h-60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Stock Cards Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {inventory.map((item) => {
          const isWst = item.type === 'waste';
          
          return (
            <div 
              key={item.id} 
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden"
            >
              {/* Badge Overlay */}
              <div className="absolute top-4 right-4">
                <Badge type={item.code.split('-')[0]} />
              </div>

              {/* Card Body */}
              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
                    {item.code}
                  </span>
                  <h3 className="text-lg font-bold font-heading text-slate-800 dark:text-slate-100 capitalize mt-0.5">
                    {item.type} Cubes
                  </h3>
                </div>

                <div className="py-2 border-y border-slate-100 dark:border-slate-800 flex justify-between items-baseline">
                  <div>
                    <span className="text-xs text-slate-400 block mb-1">Available Qty</span>
                    <span className="text-3xl font-extrabold font-heading text-slate-900 dark:text-slate-50">
                      {item.quantity.toLocaleString()}
                    </span>
                  </div>
                  
                  {!isWst && (
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block mb-1">Price per Cube</span>
                      {item.price_per_cube !== null && item.price_per_cube !== undefined ? (
                        <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          LKR {item.price_per_cube.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/50 flex items-center">
                          <AlertTriangle size={12} className="mr-1" /> Unset
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Actions */}
              <div className="mt-6 grid grid-cols-3 gap-2">
                {/* Add button visible to all */}
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => openModal('add', item)}
                  className="flex items-center justify-center space-x-1"
                >
                  <Plus size={14} />
                  <span>Add</span>
                </Button>

                {/* Remove stock button admin only */}
                {isAdmin ? (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    disabled={item.quantity === 0}
                    onClick={() => openModal('remove', item)}
                    className="flex items-center justify-center space-x-1 border border-slate-300 dark:border-slate-700"
                  >
                    <Minus size={14} />
                    <span>Remove</span>
                  </Button>
                ) : (
                  <Button 
                    variant="secondary" 
                    size="sm"
                    disabled
                    className="flex items-center justify-center space-x-1 opacity-40 cursor-not-allowed border border-slate-200 dark:border-slate-800"
                    title="Admin privilege required"
                  >
                    <Minus size={14} />
                    <span>Remove</span>
                  </Button>
                )}

                {/* Edit Price admin only, hidden/disabled for WST */}
                {!isWst ? (
                  isAdmin ? (
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={() => openModal('editPrice', item)}
                      className="flex items-center justify-center space-x-1"
                    >
                      <Edit size={14} />
                      <span>Price</span>
                    </Button>
                  ) : (
                    <Button 
                      variant="primary" 
                      size="sm"
                      disabled
                      className="flex items-center justify-center space-x-1 opacity-40 cursor-not-allowed bg-slate-300 text-slate-500 border-none hover:bg-slate-300"
                      title="Admin privilege required"
                    >
                      <Edit size={14} />
                      <span>Price</span>
                    </Button>
                  )
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-lg flex items-center justify-center text-[10px] text-slate-400 font-semibold uppercase">
                    No Price
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* --- Modals --- */}
      
      {/* 1. Add Stock Modal */}
      <Modal 
        isOpen={activeModal === 'add'} 
        onClose={closeModal} 
        title={`Add Cubes: ${selectedItem?.code}`}
        size="sm"
      >
        <form onSubmit={handleAddStock} className="space-y-4">
          <Input
            label="Quantity to Add"
            name="quantity"
            type="number"
            required
            min="1"
            placeholder="e.g. 500"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
          />
          <div className="flex justify-end space-x-3 pt-2">
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={actionLoading}>
              Confirm Add
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Remove Stock Modal */}
      <Modal 
        isOpen={activeModal === 'remove'} 
        onClose={closeModal} 
        title={`Remove Cubes: ${selectedItem?.code}`}
        size="sm"
      >
        <form onSubmit={handleRemoveStock} className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg text-xs flex items-start space-x-2 border border-amber-100 dark:border-amber-900/50">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>Removing stock reduces inventory records directly. Max limit: {selectedItem?.quantity} cubes.</span>
          </div>
          <Input
            label="Quantity to Remove"
            name="quantity"
            type="number"
            required
            min="1"
            max={selectedItem?.quantity}
            placeholder="e.g. 100"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
          />
          <div className="flex justify-end space-x-3 pt-2">
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" isLoading={actionLoading}>
              Deduct Stock
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. Edit Price Modal */}
      <Modal 
        isOpen={activeModal === 'editPrice'} 
        onClose={closeModal} 
        title={`Edit Cube Price: ${selectedItem?.code}`}
        size="sm"
      >
        <form onSubmit={handleEditPrice} className="space-y-4">
          <Input
            label="Price per Cube (LKR)"
            name="price"
            type="number"
            step="0.01"
            required
            min="0"
            placeholder="e.g. 15.00"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
          <div className="flex justify-end space-x-3 pt-2">
            <Button variant="secondary" onClick={closeModal} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={actionLoading}>
              Update Price
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
