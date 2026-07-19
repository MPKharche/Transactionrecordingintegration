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
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
];

export function PartySection({
  title,
  party,
  onChange,
  readOnly = false,
}: {
  title: string;
  party: PartyDetails;
  onChange: (party: PartyDetails) => void;
  readOnly?: boolean;
}) {
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
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        {title}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Name *
          </label>
          <input
            type="text"
            value={party.name}
            onChange={(e) => handleChange("name", e.target.value)}
            readOnly={readOnly}
            className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary ${
              readOnly ? "bg-muted/30 cursor-not-allowed" : ""
            }`}
            placeholder="Party name"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            GSTIN *
          </label>
          <input
            type="text"
            value={party.gstin}
            onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
            readOnly={readOnly}
            maxLength={15}
            className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:border-primary ${
              readOnly ? "bg-muted/30 cursor-not-allowed" : ""
            }`}
            placeholder="15-digit GSTIN"
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Address
          </label>
          <textarea
            value={party.address}
            onChange={(e) => handleChange("address", e.target.value)}
            readOnly={readOnly}
            rows={2}
            className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary ${
              readOnly ? "bg-muted/30 cursor-not-allowed" : ""
            }`}
            placeholder="Full address"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              City
            </label>
            <input
              type="text"
              value={party.city}
              onChange={(e) => handleChange("city", e.target.value)}
              readOnly={readOnly}
              className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary ${
                readOnly ? "bg-muted/30 cursor-not-allowed" : ""
              }`}
              placeholder="City"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              State *
            </label>
            <select
              value={party.state}
              onChange={(e) => {
                const state = INDIAN_STATES.find((s) => s.name === e.target.value);
                handleChange("state", e.target.value);
                if (state) {
                  handleChange("stateCode", state.code);
                }
              }}
              disabled={readOnly}
              className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary ${
                readOnly ? "bg-muted/30 cursor-not-allowed" : ""
              }`}
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map((state) => (
                <option key={state.code} value={state.name}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Mobile
          </label>
          <input
            type="tel"
            value={party.mobile}
            onChange={(e) => handleChange("mobile", e.target.value)}
            readOnly={readOnly}
            className={`w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary ${
              readOnly ? "bg-muted/30 cursor-not-allowed" : ""
            }`}
            placeholder="Mobile number"
          />
        </div>
      </div>
    </div>
  );
}
