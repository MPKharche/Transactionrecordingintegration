import { useState, useEffect } from "react";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";

interface Party {
  id: string;
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  mobile: string;
  email: string;
}

interface PartyDetails {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  stateCode: string;
  mobile: string;
  email: string;
}

const INDIAN_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "19", name: "West Bengal" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
];

export function PartySectionWithSearch({
  title,
  party,
  onChange,
  readOnly = false,
  parties = [],
  onSaveNewParty,
}: {
  title: string;
  party: PartyDetails;
  onChange: (party: PartyDetails) => void;
  readOnly?: boolean;
  parties?: Party[];
  onSaveNewParty?: (party: PartyDetails) => Promise<void>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filter parties by name or GSTIN
  const filteredParties = parties.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      p.gstin.toLowerCase().includes(term)
    );
  }).slice(0, 10);

  const handlePartySelect = (selectedParty: Party) => {
    onChange({
      name: selectedParty.name,
      gstin: selectedParty.gstin,
      address: selectedParty.address,
      city: selectedParty.city,
      state: selectedParty.state,
      stateCode: selectedParty.stateCode,
      mobile: selectedParty.mobile,
      email: selectedParty.email,
    });
    setShowDropdown(false);
    toast.success(`${selectedParty.name} selected`);
  };

  const handleSaveAsNew = async () => {
    if (!party.name || !party.gstin) {
      toast.error("Please enter name and GSTIN");
      return;
    }

    setSaving(true);
    try {
      await onSaveNewParty?.(party);
      toast.success("Party saved to database");
    } catch (error) {
      toast.error("Failed to save party");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof PartyDetails, value: string) => {
    const updated = { ...party, [field]: value };

    // Auto-extract state code from GSTIN
    if (field === "gstin" && value.length >= 2) {
      updated.stateCode = value.slice(0, 2);
      const state = INDIAN_STATES.find((s) => s.code === updated.stateCode);
      if (state) {
        updated.state = state.name;
      }
    }

    onChange(updated);

    // Show dropdown when typing in name or GSTIN
    if (field === "name" || field === "gstin") {
      setSearchTerm(value);
      setShowDropdown(value.length > 0 && parties.length > 0);
    }
  };

  if (readOnly) {
    return (
      <div className="space-y-2 bg-muted/20 rounded border border-dashed border-primary/30 p-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground uppercase">{title}</h3>
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">Auto-filled</span>
        </div>

        <div className="space-y-1.5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Name</label>
            <div className="text-xs font-semibold text-foreground">{party.name || "—"}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">GSTIN</label>
              <div className="text-xs font-mono text-foreground">{party.gstin || "—"}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">State</label>
              <div className="text-xs text-foreground">{party.state || "—"}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 bg-card rounded border border-border p-2">
      <h3 className="text-xs font-bold text-foreground uppercase">{title}</h3>

      <div className="space-y-2">
        {/* Name Field with Dropdown */}
        <div className="relative">
          <label className="block text-xs font-medium text-foreground mb-1">Name *</label>
          <input
            type="text"
            value={party.name}
            onChange={(e) => handleChange("name", e.target.value)}
            onFocus={() => party.name && parties.length > 0 && setShowDropdown(true)}
            placeholder="Type name or select from master"
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />

          {/* Dropdown for Name Search */}
          {showDropdown && filteredParties.length > 0 && searchTerm && (
            <div className="absolute z-40 w-full mt-1 bg-card border border-border rounded shadow-xl max-h-60 overflow-y-auto">
              {filteredParties.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePartySelect(p)}
                  className="w-full px-2 py-1.5 text-left hover:bg-muted/50 border-b border-border last:border-0"
                >
                  <div className="font-semibold text-xs text-foreground">{p.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{p.gstin}</div>
                  <div className="text-xs text-muted-foreground">{p.city}, {p.state}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* GSTIN Field */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">GSTIN *</label>
          <input
            type="text"
            value={party.gstin}
            onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
            maxLength={15}
            placeholder="15-digit GSTIN or type to search"
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {party.gstin.length >= 2 && party.state && (
            <div className="mt-0.5 text-xs text-primary">✓ State: {party.state}</div>
          )}
        </div>

        {/* Other Fields */}
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Address</label>
          <textarea
            value={party.address}
            onChange={(e) => handleChange("address", e.target.value)}
            rows={2}
            placeholder="Full address"
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">City</label>
            <input
              type="text"
              value={party.city}
              onChange={(e) => handleChange("city", e.target.value)}
              placeholder="City"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Mobile</label>
            <input
              type="tel"
              value={party.mobile}
              onChange={(e) => handleChange("mobile", e.target.value)}
              placeholder="Mobile"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Save to Database Button */}
        {onSaveNewParty && party.name && party.gstin && !parties.find(p => p.gstin === party.gstin) && (
          <button
            type="button"
            onClick={handleSaveAsNew}
            disabled={saving}
            className="w-full mt-2 px-2 py-1.5 bg-primary/10 text-primary border border-primary rounded text-xs font-medium hover:bg-primary/20 disabled:opacity-50"
          >
            {saving ? "Saving..." : "💾 Save to master database"}
          </button>
        )}
      </div>
    </div>
  );
}
