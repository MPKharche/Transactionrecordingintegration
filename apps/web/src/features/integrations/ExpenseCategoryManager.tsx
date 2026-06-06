/**
 * TIER 3.4: Expense Category Tagging
 * Manage and assign expense categories to line items
 */

import React, { useState, useEffect } from "react";
import { Button } from "@ca-suite/ui/button";
import { Input } from "@ca-suite/ui/input";
import { Card } from "@ca-suite/ui/card";
import { Alert, AlertDescription } from "@ca-suite/ui/alert";
import { Loader2, Plus, X } from "lucide-react";

interface Category {
  code: string;
  name: string;
  account_code?: string;
  is_system: boolean;
}

interface Suggestion {
  suggested_code?: string;
  suggested_name?: string;
}

export function ExpenseCategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newAccountCode, setNewAccountCode] = useState("");

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      setCategories(data.categories);
    } catch (err) {
      console.error(err);
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddCategory() {
    if (!newCode || !newName) {
      setError("Code and name are required");
      return;
    }

    setAdding(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode,
          name: newName,
          account_code: newAccountCode || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create category");

      setSuccess(`Category "${newName}" created successfully`);
      setNewCode("");
      setNewName("");
      setNewAccountCode("");
      await fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Expense Categories</h2>
        <p className="text-gray-600">
          Define expense categories for better expense tracking and accounting
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Add Custom Category</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Code (e.g., travel)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <Input
              placeholder="Name (e.g., Travel & Transport)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder="Account Code (optional)"
              value={newAccountCode}
              onChange={(e) => setNewAccountCode(e.target.value)}
            />
          </div>
          <Button onClick={handleAddCategory} disabled={adding} className="w-full md:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Categories ({categories.length})</h3>
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.code} className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <div className="flex-1">
                <div className="font-medium">{cat.name}</div>
                <div className="text-sm text-gray-600">
                  Code: {cat.code} {cat.account_code && `| Account: ${cat.account_code}`}
                </div>
              </div>
              <span className="text-xs bg-gray-200 px-2 py-1 rounded">
                {cat.is_system ? "System" : "Custom"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 bg-blue-50">
        <h3 className="font-semibold text-blue-900 mb-2">Auto-Suggestion</h3>
        <p className="text-sm text-blue-800">
          Line items are automatically assigned categories based on HSN codes.
          You can override suggestions when reviewing documents.
        </p>
      </Card>
    </div>
  );
}

/**
 * Category Picker for line items in DocumentWorkspace
 */
export function CategoryPicker({
  selected,
  categories,
  onSelect,
  hsnCode,
}: {
  selected?: string;
  categories: Category[];
  onSelect: (code: string) => void;
  hsnCode?: string;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hsnCode && !selected) {
      fetchSuggestion(hsnCode);
    }
  }, [hsnCode, selected]);

  async function fetchSuggestion(hsn: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/categories/suggest?hsn_code=${hsn}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestion(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <select
        value={selected || ""}
        onChange={(e) => onSelect(e.target.value)}
        className="flex-1 px-3 py-2 border rounded-md text-sm"
      >
        <option value="">Select category...</option>
        {categories.map((cat) => (
          <option key={cat.code} value={cat.code}>
            {cat.name}
          </option>
        ))}
      </select>
      {suggestion?.suggested_code && !selected && (
        <Button
          onClick={() => onSelect(suggestion.suggested_code!)}
          size="sm"
          variant="outline"
          title={`Suggested: ${suggestion.suggested_name}`}
        >
          Suggest
        </Button>
      )}
    </div>
  );
}
