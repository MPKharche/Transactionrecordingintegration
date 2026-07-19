import { useState, useRef } from "react";
import { Search, Plus, Trash2 } from "lucide-react";
import { HSNSearchDropdown } from "./HSNSearchDropdown";

interface LineItem {
  id: string;
  description: string;
  hsnSac: string;
  quantity: number;
  rate: number;
  amount: number;
  gstRate?: number;
}

export function LineItemsTableBeautiful({
  items,
  onChange,
  defaultGstRate = 18,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  defaultGstRate?: number;
}) {
  const addItem = () => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: "",
      hsnSac: "",
      quantity: 1,
      rate: 0,
      amount: 0,
      gstRate: defaultGstRate,
    };
    onChange([...items, newItem]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      onChange(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === "quantity" || field === "rate") {
            updated.amount = updated.quantity * updated.rate;
          }
          return updated;
        }
        return item;
      })
    );
  };

  const handleHSNSelect = (id: string, code: string, description: string, gstRate: number) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            hsnSac: code,
            description: description,
            gstRate: gstRate,
          };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-foreground">Line Items</h3>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 px-2 py-1 bg-primary text-white rounded text-xs font-medium hover:bg-primary/90"
        >
          <Plus size={14} />
          Add Item
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="bg-card border border-border rounded p-2 hover:border-primary/30"
          >
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-xs">
                {index + 1}
              </div>

              <div className="flex-1 space-y-2">
                {/* HSN Search */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">HSN/SAC Search</label>
                  <HSNSearchDropdown
                    value={item.hsnSac}
                    description={item.description}
                    onSelect={(code, desc, gstRate) => handleHSNSelect(item.id, code, desc, gstRate)}
                  />
                </div>

                {/* Description (if no HSN selected) */}
                {!item.description && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Or enter description</label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, "description", e.target.value)}
                      placeholder="Item description"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                )}

                {/* Description display if HSN selected */}
                {item.description && (
                  <div className="bg-primary/5 border border-primary/20 rounded px-2 py-1">
                    <div className="text-xs font-medium text-muted-foreground">Description</div>
                    <div className="text-xs font-semibold text-foreground">{item.description}</div>
                  </div>
                )}

                {/* Quantity, Rate, GST, Amount Grid */}
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">HSN/SAC *</label>
                    <input
                      type="text"
                      value={item.hsnSac}
                      onChange={(e) => updateItem(item.id, "hsnSac", e.target.value)}
                      placeholder="Code"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Quantity *</label>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Rate *</label>
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(item.id, "rate", parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">GST %</label>
                    <input
                      type="number"
                      value={item.gstRate || defaultGstRate}
                      onChange={(e) => updateItem(item.id, "gstRate", parseFloat(e.target.value) || 0)}
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-center font-bold focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                {/* Amount Display */}
                <div className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Line Total</span>
                  <span className="text-sm font-bold text-foreground font-mono">₹{item.amount.toFixed(2)}</span>
                </div>
              </div>

              {/* Delete Button */}
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="flex-shrink-0 w-6 h-6 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded flex items-center justify-center"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 border border-dashed border-border rounded">
          <p className="text-xs text-muted-foreground mb-2">No line items</p>
          <button
            type="button"
            onClick={addItem}
            className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium hover:bg-primary/90"
          >
            Add First Item
          </button>
        </div>
      )}
    </div>
  );
}
