import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";

interface LineItem {
  id: string;
  description: string;
  hsnSac: string;
  quantity: number;
  rate: number;
  amount: number;
}

export function LineItemsTable({
  items,
  onChange,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  const addItem = () => {
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: "",
      hsnSac: "",
      quantity: 1,
      rate: 0,
      amount: 0,
    };
    onChange([...items, newItem]);
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof LineItem, value: any) => {
    onChange(
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Auto-calculate amount
          if (field === "quantity" || field === "rate") {
            updated.amount = updated.quantity * updated.rate;
          }
          return updated;
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Line Items</h3>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Plus size={14} />
          Add Item
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-8">#</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">Description *</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-24">HSN/SAC</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-20">Qty *</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-24">Rate *</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-muted-foreground w-28">Amount</th>
              <th className="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-2 py-2 text-muted-foreground">{index + 1}</td>
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    placeholder="Item description"
                    className="w-full bg-transparent border-0 focus:outline-none text-foreground"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={item.hsnSac}
                    onChange={(e) => updateItem(item.id, "hsnSac", e.target.value)}
                    placeholder="HSN"
                    className="w-full bg-transparent border-0 focus:outline-none text-foreground"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, "quantity", parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    className="w-full bg-transparent border-0 focus:outline-none text-foreground"
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    value={item.rate}
                    onChange={(e) => updateItem(item.id, "rate", parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.01"
                    className="w-full bg-transparent border-0 focus:outline-none text-foreground"
                  />
                </td>
                <td className="px-2 py-2 text-right font-mono">
                  ₹{item.amount.toFixed(2)}
                </td>
                <td className="px-2 py-2">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No line items. Click "Add Item" to start.
        </div>
      )}
    </div>
  );
}
