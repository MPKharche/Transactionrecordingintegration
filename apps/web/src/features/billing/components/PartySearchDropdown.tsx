import { useState, useEffect } from "react";
import { Search } from "lucide-react";

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

interface PartySearchProps {
  label: string;
  parties: Party[];
  value: Party | null;
  onChange: (party: Party) => void;
  onManualEntry: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PartySearchDropdown({
  label,
  parties,
  value,
  onChange,
  onManualEntry,
  placeholder = "Search by name or GSTIN...",
  disabled = false,
}: PartySearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredParties = parties.filter((party) => {
    const term = searchTerm.toLowerCase();
    return (
      party.name.toLowerCase().includes(term) ||
      party.gstin.toLowerCase().includes(term)
    );
  });

  const handleSelect = (party: Party) => {
    onChange(party);
    setSearchTerm(party.name);
    setShowDropdown(false);
  };

  useEffect(() => {
    if (value) {
      setSearchTerm(value.name);
    }
  }, [value]);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-foreground mb-2">
        {label}
      </label>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          disabled={disabled}
          placeholder={placeholder}
          className={`w-full bg-card border border-border rounded-lg pl-10 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary ${
            disabled ? "bg-muted/30 cursor-not-allowed" : ""
          }`}
        />
      </div>

      {showDropdown && !disabled && filteredParties.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredParties.map((party) => (
            <button
              key={party.id}
              type="button"
              onClick={() => handleSelect(party)}
              className="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-0"
            >
              <div className="font-medium text-sm text-foreground">
                {party.name}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {party.gstin}
              </div>
              <div className="text-xs text-muted-foreground">
                {party.city}, {party.state}
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && !disabled && searchTerm && filteredParties.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg">
          <div className="px-3 py-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No matching party found
            </p>
            <button
              type="button"
              onClick={() => {
                onManualEntry();
                setShowDropdown(false);
              }}
              className="text-sm text-primary hover:underline"
            >
              Enter details manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
