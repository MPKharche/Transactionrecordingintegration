import fs from "fs";
import path from "path";

const lines = fs.readFileSync("apps/web/src/app/App.tsx", "utf8").split(/\r?\n/);

function body(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function write(rel, content) {
  const p = path.join("apps/web/src", rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  const n = content.split("\n").length;
  console.log(`${rel} (${n} lines)`);
}

write(
  "hooks/useTheme.ts",
  `import { useState, useEffect } from "react";

export type ThemeMode = "light" | "dark" | "system";

${body(16, 28)}
`
);

write(
  "lib/mock-builders.ts",
  `import type { LineItem, Party } from "@ca-suite/shared";

${body(106, 115)}
`
);

write(
  "data/fallback.ts",
  `import type { Client, GSTDocument } from "@ca-suite/shared";
import { mkLine, mkParty } from "../lib/mock-builders";

${body(76, 82).replace("const FALLBACK_CLIENTS", "export const FALLBACK_CLIENTS")}

${body(141, 153).replace("const FALLBACK_DOCS", "export const FALLBACK_DOCS")}
`
);

write(
  "lib/constants.ts",
  `import type { DocStage, DocType } from "@ca-suite/shared";

${body(84, 103).replace(/^const /gm, "export const ")}
`
);

write(
  "lib/format.ts",
  `import type { Client, GSTDocument, Party } from "@ca-suite/shared";

${body(156, 158).replace(/^const /gm, "export const ")}
${body(199, 202).replace(/^function getCounterParty/, "export function getCounterParty")}
`
);

write(
  "lib/gstin-master.ts",
  `import type { Party } from "@ca-suite/shared";
import {
  P_RELIANCE, P_TATA, P_HDFC, P_INFOSYS, P_ITC, P_FUTURE, P_SIEMENS, P_FORD,
  P_BAJAJ, P_ACCENTURE, P_MSFT, P_SPENCERS,
} from "../data/fallback-parties";

export const GSTIN_MASTER: Record<string, Party> = {};
[P_RELIANCE, P_TATA, P_HDFC, P_INFOSYS, P_ITC, P_FUTURE, P_SIEMENS, P_FORD,
 P_BAJAJ, P_ACCENTURE, P_MSFT, P_SPENCERS].forEach((p) => {
  if (p.gstin) GSTIN_MASTER[p.gstin.toUpperCase()] = { ...p };
});
`
);

write(
  "lib/validators-local.ts",
  `${body(161, 185).replace(/^const /gm, "export const ")}
`
);

write(
  "lib/csv-export.ts",
  `${body(188, 196).replace(/^function exportCSV/, "export function exportCSV")}
`
);

write(
  "components/badges/DocTypeBadge.tsx",
  `import { Lock, Clock, XCircle } from "lucide-react";
import type { DocStage, DocType } from "@ca-suite/shared";
import { DOC_TYPE_META, STAGE_META } from "../../lib/constants";

${body(204, 225)}
`
);

write(
  "components/ui/CopyBtn.tsx",
  `import { useState } from "react";
import { Check, Copy } from "lucide-react";

${body(227, 235)}
`
);

write(
  "components/layout/ThemeToggle.tsx",
  `import { Sun, Moon, Monitor } from "lucide-react";
import type { ThemeMode } from "../../hooks/useTheme";

${body(237, 248)}
`
);

write(
  "data/fallback-parties.ts",
  `import { mkParty } from "../lib/mock-builders";

${body(117, 133).replace(/^const /gm, "export const ")}
`
);

write(
  "components/layout/PageHeader.tsx",
  `${body(318, 339).replace(/^function PageHeader/, "export function PageHeader").replace(/^function KpiCard/, "export function KpiCard")}
`
);

write(
  "components/layout/Sidebar.tsx",
  `import {
  LayoutDashboard, FileText, Users, Upload, Shield, ReceiptText,
} from "lucide-react";
import type { ThemeMode } from "../../hooks/useTheme";
import { ThemeToggle } from "./ThemeToggle";

export type Screen =
  | "dashboard"
  | "upload"
  | "records"
  | "review"
  | "clients"
  | "client_detail";

${body(251, 316).replace(/^function Sidebar/, "export function Sidebar")}
`
);

const featImports = `import { useState, useRef, useMemo } from "react";
import type { Client, GSTDocument, DocStage, DocType, Party, LineItem, FieldWarning } from "@ca-suite/shared";
import { PageHeader, KpiCard } from "../../components/layout/PageHeader";
import { DocTypeBadge, StageBadge } from "../../components/badges/DocTypeBadge";
import { CopyBtn } from "../../components/ui/CopyBtn";
import { INR, INR_SIGNED, getCounterParty, clientByIdFrom } from "../../lib/format";
import { exportCSV } from "../../lib/csv-export";
import { DOC_TYPE_META, STAGE_META, INDIAN_STATES, GST_SLABS } from "../../lib/constants";
import { isValidGSTIN, isValidPAN } from "../../lib/validators-local";
import { GSTIN_MASTER } from "../../lib/gstin-master";
import type { Screen } from "../../components/layout/Sidebar";
`;

write(
  "features/dashboard/Dashboard.tsx",
  `${featImports}
import {
  ArrowRight, Building2, TrendingUp, AlertTriangle, Download, ChevronRight,
} from "lucide-react";

${body(341, 447).replace(/^function Dashboard/, "export function Dashboard")}
`
);

write(
  "features/upload/UploadScreen.tsx",
  `${featImports}
import { Plus, Search, Filter, Download } from "lucide-react";

${body(450, 620).replace(/^function UploadScreen/, "export function UploadScreen")}
`
);

write(
  "features/records/RecordsScreen.tsx",
  `${featImports}
import {
  Search, Filter, Download, Eye, ChevronRight, ExternalLink,
} from "lucide-react";

${body(631, 814).replace(/^function RecordsScreen/, "export function RecordsScreen")}
`
);

write(
  "features/review/PartyPanel.tsx",
  `import type { Party } from "@ca-suite/shared";
import { Phone, Mail, ChevronDown } from "lucide-react";
import { isValidGSTIN, isValidPAN } from "../../lib/validators-local";
import { INDIAN_STATES } from "../../lib/constants";
import { GSTIN_MASTER } from "../../lib/gstin-master";

${body(816, 927).replace(/^function PartyPanel/, "export function PartyPanel")}
`
);

write(
  "features/review/ReviewScreen.tsx",
  `${featImports}
import { PartyPanel } from "./PartyPanel";
import {
  Lock, XCircle, AlertTriangle, ChevronRight, ChevronDown, Info, Phone, Mail,
} from "lucide-react";

${body(930, 1245).replace(/^function ReviewScreen/, "export function ReviewScreen")}
`
);

write(
  "features/clients/ClientsScreen.tsx",
  `${featImports}
import { Plus, Search, Building2, ChevronRight, Phone, Mail } from "lucide-react";

${body(1248, 1331).replace(/^function ClientsScreen/, "export function ClientsScreen")}
`
);

write(
  "features/clients/ClientDetailScreen.tsx",
  `${featImports}
import {
  ArrowLeft, Search, Filter, Download, Eye, ChevronRight, Building2, Phone, Mail,
} from "lucide-react";

${body(1342, 1550).replace(/^function ClientDetailScreen/, "export function ClientDetailScreen")}
`
);

console.log("Split complete");
