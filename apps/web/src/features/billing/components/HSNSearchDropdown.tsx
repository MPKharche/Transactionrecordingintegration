import { useState, useEffect } from "react";
import { Search } from "lucide-react";

interface HSNItem {
  code: string;
  description: string;
  gstRate: number;
}

// Official HSN/SAC Master Data (Sample - in production, fetch from API)
const HSN_MASTER: HSNItem[] = [
  // Common goods with official GST rates
  { code: "0101", description: "Live horses, asses, mules and hinnies", gstRate: 0 },
  { code: "0201", description: "Meat of bovine animals, fresh or chilled", gstRate: 0 },
  { code: "0401", description: "Milk and cream, not concentrated", gstRate: 0 },
  { code: "0801", description: "Coconuts, Brazil nuts and cashew nuts", gstRate: 5 },
  { code: "0901", description: "Coffee", gstRate: 5 },
  { code: "1001", description: "Wheat and meslin", gstRate: 0 },
  { code: "1006", description: "Rice", gstRate: 0 },
  { code: "1701", description: "Cane or beet sugar", gstRate: 5 },
  { code: "1901", description: "Malt extract; food preparations", gstRate: 18 },
  { code: "2201", description: "Waters, including mineral waters", gstRate: 18 },
  { code: "2202", description: "Soft drinks", gstRate: 28 },
  { code: "2203", description: "Beer made from malt", gstRate: 28 },
  { code: "2204", description: "Wine of fresh grapes", gstRate: 28 },
  { code: "2523", description: "Portland cement", gstRate: 28 },
  { code: "2710", description: "Petroleum oils", gstRate: 18 },
  { code: "3004", description: "Medicaments", gstRate: 12 },
  { code: "3926", description: "Other articles of plastics", gstRate: 18 },
  { code: "4011", description: "New pneumatic tyres, of rubber", gstRate: 28 },
  { code: "6109", description: "T-shirts, singlets", gstRate: 12 },
  { code: "6403", description: "Footwear", gstRate: 18 },
  { code: "7113", description: "Articles of jewellery", gstRate: 3 },
  { code: "8471", description: "Computers and peripherals", gstRate: 18 },
  { code: "8517", description: "Mobile phones", gstRate: 18 },
  { code: "8703", description: "Motor cars", gstRate: 28 },
  { code: "9403", description: "Furniture", gstRate: 18 },

  // Common services (SAC codes)
  { code: "995411", description: "Restaurant services", gstRate: 5 },
  { code: "996511", description: "Accommodation services", gstRate: 12 },
  { code: "997212", description: "Legal services", gstRate: 18 },
  { code: "998314", description: "IT consulting services", gstRate: 18 },
  { code: "996331", description: "Goods transport services", gstRate: 5 },
];

interface HSNSearchProps {
  value: string;
  description: string;
  onSelect: (code: string, description: string, gstRate: number) => void;
}

export function HSNSearchDropdown({ value, description, onSelect }: HSNSearchProps) {
  const [searchTerm, setSearchTerm] = useState(description || value || "");
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredHSN = HSN_MASTER.filter((item) => {
    const term = searchTerm.toLowerCase();
    return (
      item.code.includes(term) ||
      item.description.toLowerCase().includes(term)
    );
  }).slice(0, 10); // Show top 10 matches

  const handleSelect = (item: HSNItem) => {
    onSelect(item.code, item.description, item.gstRate);
    setSearchTerm(item.description);
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          placeholder="Search HSN/SAC or description"
          className="w-full bg-background border border-border rounded pl-7 pr-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {showDropdown && filteredHSN.length > 0 && (
        <div className="absolute z-40 w-96 mt-1 bg-card border border-border rounded shadow-lg max-h-48 overflow-y-auto">
          {filteredHSN.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => handleSelect(item)}
              className="w-full px-2 py-1.5 text-left hover:bg-muted/50 border-b border-border last:border-0"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-xs font-medium text-foreground">{item.code}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
                <div className="text-xs font-semibold text-primary">{item.gstRate}%</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
