export interface GuideStep {
  title: string;
  description: string; // HTML string — supports <strong>, <code>, <ul>, <li>, <em>
}

export interface GuideError {
  code: string;
  meaning: string;
  fix: string;
}

export interface Workflow {
  id: string;
  title: string;
  subtitle: string;
  icon: string; // emoji
  estimatedTime: string;
  prerequisites: string[]; // HTML strings
  steps: GuideStep[];
  errors: GuideError[];
  tips?: string[]; // HTML strings
}

export const WORKFLOWS: Workflow[] = [
  // ─── 1. First-time Setup ─────────────────────────────────────────────────
  {
    id: "first-setup",
    title: "First-Time Setup",
    subtitle: "Get your practice ready before uploading any documents",
    icon: "🚀",
    estimatedTime: "5–10 min",
    prerequisites: [
      "You have signed in with your Google account or password",
      "You are the <strong>Admin</strong> of your practice",
    ],
    steps: [
      {
        title: "Verify you are signed in as Admin",
        description:
          "Check the bottom of the sidebar — your role should show <strong>admin</strong>. If it says <em>operator</em>, contact your admin to upgrade your access.",
      },
      {
        title: "Add your first client",
        description:
          "Go to <strong>Clients</strong> in the sidebar. Click <strong>Add Client</strong>. Enter the client's <code>GSTIN</code> (15-character ID) and click <strong>Lookup</strong> — the name, PAN, and state will auto-fill from the GST portal. Save the client.",
      },
      {
        title: "Review the client's HSN master (optional)",
        description:
          "Open the client's detail page and scroll to <strong>HSN Master</strong>. If you know the common HSN codes this client uses (e.g. 9954 for construction services), add them here. This improves AI extraction accuracy.",
      },
      {
        title: "Upload a test document",
        description:
          "Go to <strong>Upload</strong> in the sidebar. Select the client you just created, choose the financial year, and drag a PDF invoice. Click <strong>Upload</strong>. The document will appear in <strong>Records</strong> within 30–60 seconds.",
      },
      {
        title: "Review and lock the document",
        description:
          "Once the document shows <strong>Ready for Review</strong>, click it in Records to open the workspace. Check the extracted data, fix any errors, then click <strong>Lock</strong>. It will appear in <strong>GST Registers</strong>.",
      },
    ],
    errors: [
      {
        code: "no_membership",
        meaning: "Your email is not authorised to access this practice.",
        fix: "Ask your admin to add your email to the allowed list in Settings → Team.",
      },
      {
        code: "GSTIN lookup returns empty",
        meaning: "The GST portal could not find this GSTIN.",
        fix: "Double-check the 15-character GSTIN for typos. If correct, enter the client name manually — the portal sometimes has delays.",
      },
    ],
    tips: [
      "You can add multiple clients before uploading any documents.",
      "The financial year runs <strong>April to March</strong>. Select the correct FY at upload time — it cannot be changed later without re-uploading.",
    ],
  },

  // ─── 2. Upload Documents ─────────────────────────────────────────────────
  {
    id: "upload",
    title: "Upload & Process Documents",
    subtitle: "Upload PDF invoices and let the AI extract the data",
    icon: "📤",
    estimatedTime: "2–5 min per batch",
    prerequisites: [
      "At least one <strong>Client</strong> exists in the system",
      "Documents are in <strong>PDF, JPG, or PNG</strong> format (max 20 MB each)",
      "You know the <strong>Financial Year</strong> the invoices belong to",
    ],
    steps: [
      {
        title: "Go to Upload",
        description:
          "Click <strong>Upload</strong> in the sidebar (or press <code>Alt+2</code>).",
      },
      {
        title: "Select a client",
        description:
          "Use the <strong>Client</strong> dropdown to pick the client whose invoices you are uploading. All uploaded files in this batch will be linked to this client.",
      },
      {
        title: "Select the financial year",
        description:
          "Choose the correct <strong>Financial Year</strong> (e.g. <em>2024–25</em>). The system defaults to the current FY. If uploading old invoices, change this first.",
      },
      {
        title: "Choose document type (optional)",
        description:
          "Leave as <strong>Auto-detect</strong> to let the AI decide. Or manually set it to <em>Invoice</em>, <em>Bill</em>, <em>Credit Note</em>, etc. if you already know.",
      },
      {
        title: "Drag and drop files or click to browse",
        description:
          "You can upload <strong>multiple files at once</strong>. Each file becomes one or more documents depending on the page count. Files are uploaded 2 at a time by default.",
      },
      {
        title: "Click Upload",
        description:
          "A progress indicator shows each file's status. Once uploaded, documents enter the AI pipeline automatically.",
      },
      {
        title: "Wait for processing",
        description:
          "The pipeline runs: <strong>Normalise → OCR → Split → Extract → Validate</strong>. This takes 30–90 seconds per document depending on server load. You will see a badge on the Upload menu item when documents are ready for review.",
      },
    ],
    errors: [
      {
        code: "File too large",
        meaning: "The file exceeds the 20 MB per-file limit.",
        fix: "Compress the PDF (use Smallpdf or Adobe Acrobat) or split it into smaller files before uploading.",
      },
      {
        code: "processing → failed",
        meaning: "The AI could not extract data from this document.",
        fix: "Open the document in <strong>Records</strong>, click <strong>Retry</strong>. If it keeps failing, the document may be scanned at too low a resolution or be password-protected. Try a clearer scan.",
      },
      {
        code: "Budget deferred",
        meaning: "The daily AI processing budget has been reached. Documents are queued.",
        fix: "Documents will process automatically the next day. An admin can increase the budget in <strong>Observe</strong> panel.",
      },
    ],
    tips: [
      "Multi-page PDFs (e.g. a combined invoice book) are automatically split into individual invoices.",
      "Upload up to <strong>50 files</strong> in a single batch. For larger volumes, split into multiple uploads.",
      "The orange badge on the sidebar Upload item shows how many documents are waiting for your review.",
    ],
  },

  // ─── 3. Review & Lock Documents ──────────────────────────────────────────
  {
    id: "review",
    title: "Review & Lock Invoices",
    subtitle: "Verify AI-extracted data and confirm invoices for your GST registers",
    icon: "✅",
    estimatedTime: "1–3 min per document",
    prerequisites: [
      "Documents have been uploaded and are in <strong>Ready for Review</strong> status",
      "You can see them in <strong>Records</strong> with a yellow <em>Review</em> badge",
    ],
    steps: [
      {
        title: "Open Records",
        description:
          "Click <strong>Records</strong> in the sidebar (or press <code>Alt+3</code>). You will see all documents — use the status filter to show only <strong>Ready for Review</strong> documents.",
      },
      {
        title: "Click a document to open the workspace",
        description:
          "A two-panel workspace opens: <strong>left panel</strong> shows extracted data, <strong>right panel</strong> shows the original PDF/image.",
      },
      {
        title: "Verify the party details",
        description:
          "Check <strong>Party GSTIN</strong>, name, and address. If the GSTIN is wrong, correct it — the system will re-validate. A red badge means the GSTIN is invalid.",
      },
      {
        title: "Verify the invoice header",
        description:
          "Check <strong>Invoice Number</strong>, <strong>Date</strong>, and <strong>Document Type</strong> (Invoice / Bill / Credit Note / Debit Note).",
      },
      {
        title: "Review line items",
        description:
          "Each line item shows <strong>HSN code, description, quantity, rate, and tax</strong>. Click any row to edit. Warning badges indicate issues:<ul><li><em>No HSN</em> — HSN code is missing</li><li><em>Tax mismatch</em> — the tax amount doesn't match rate × quantity</li><li><em>Zero qty</em> — quantity is missing or zero</li></ul>",
      },
      {
        title: "Fix any flagged issues",
        description:
          "Correct the highlighted fields. Click <strong>Save</strong> (or <code>Cmd/Ctrl+S</code>) — the system re-validates and clears fixed issues.",
      },
      {
        title: "Lock the document",
        description:
          "When all issues are resolved, click <strong>Lock</strong>. The document moves to <em>Locked</em> status and immediately appears in <strong>GST Registers</strong>. <strong>A locked document cannot be edited</strong> — if you need to change it, contact your admin.",
      },
    ],
    errors: [
      {
        code: "Invalid GSTIN",
        meaning: "The party GSTIN failed format or checksum validation.",
        fix: "Correct the GSTIN by referencing the original invoice. An unregistered party can have an empty GSTIN — just clear the field.",
      },
      {
        code: "Duplicate invoice",
        meaning: "This invoice number + party GSTIN combination already exists for this client.",
        fix: "Check if the invoice was uploaded twice. If so, reject one copy. If they are genuinely different documents, verify the invoice number is correct.",
      },
      {
        code: "Tax mismatch",
        meaning: "The tax amount on a line item doesn't match (rate / 100) × taxable amount.",
        fix: "Edit the tax amounts to match the original invoice exactly. Some invoices round differently — match what is printed.",
      },
      {
        code: "ITC blocked",
        meaning: "Input Tax Credit cannot be claimed for this document type or party.",
        fix: "This is informational. Blocked ITC documents still appear in registers but are flagged. No action needed unless the flag is wrong.",
      },
    ],
    tips: [
      "Use <strong>Bulk Lock</strong> to lock multiple documents at once — select them in Records and click Lock Selected.",
      "Version history is saved automatically every time you save. Click the <strong>History</strong> tab in the workspace to restore a previous version.",
      "<strong>Reject</strong> sends the document back for manual re-extraction — use this if the AI extracted completely wrong data.",
    ],
  },

  // ─── 4. GST Registers ────────────────────────────────────────────────────
  {
    id: "registers",
    title: "View GST Registers",
    subtitle: "See your GSTR-1 and GSTR-2B data and export for filing",
    icon: "📊",
    estimatedTime: "2–5 min",
    prerequisites: [
      "At least one document has been <strong>Locked</strong>",
      "You have selected the correct <strong>Client</strong> and <strong>Financial Year</strong>",
    ],
    steps: [
      {
        title: "Open GST Registers",
        description:
          "Click <strong>GST Registers</strong> in the sidebar (or press <code>Alt+4</code>).",
      },
      {
        title: "Select the register type",
        description:
          "Use the first dropdown to choose:<ul><li><strong>Purchase Register</strong> — inward supply (GSTR-2B / ITC)</li><li><strong>Sales Register</strong> — outward supply (GSTR-1)</li><li>Other types: Import, Export, Nil-rated, etc.</li></ul>",
      },
      {
        title: "Select the client and financial year",
        description:
          "Use the <strong>Client</strong> and <strong>FY</strong> dropdowns to filter. If you see no rows, check that documents are locked for this combination — the system will auto-switch to the FY that has data.",
      },
      {
        title: "Review the KPI cards",
        description:
          "The cards at the top show totals: <strong>Taxable Amount, IGST, CGST, SGST, Grand Total</strong>.",
      },
      {
        title: "Export data",
        description:
          "Three export formats are available:<ul><li><strong>Export as GSTR JSON</strong> — structured JSON ready for filing portals</li><li><strong>Zoho CSV</strong> — import directly into Zoho Books</li><li><strong>TallyPrime CSV</strong> — import into Tally with account mapping</li></ul>",
      },
      {
        title: "Click any row to view the full invoice",
        description:
          "Clicking a row opens the document workspace for that invoice, allowing you to verify or re-lock if needed.",
      },
    ],
    errors: [
      {
        code: "No rows shown",
        meaning: "No locked documents match your filter combination.",
        fix: "Check that documents are <em>Locked</em> (not just reviewed) in Records. Also verify the FY — the system uses the document date's FY, not the upload FY, if different.",
      },
      {
        code: "FY mismatch badge (⚠)",
        meaning: "A document's invoice date falls in a different FY than the one selected.",
        fix: "This is a warning only. The document is shown because it was uploaded under this FY tag. Consider switching to <strong>All FY</strong> view for a complete picture.",
      },
    ],
    tips: [
      "The <strong>ITC</strong> column shows Yes/No for purchase register rows — documents where ITC is blocked show No.",
      "For the Sales register, the last column shows <strong>RC</strong> (Reverse Charge applies) or <strong>B2B/B2C</strong> classification.",
      "Export data before filing deadlines. Cross-check totals against GSTR-2B downloaded from the GST Portal.",
    ],
  },

  // ─── 5. Filing Deadlines ─────────────────────────────────────────────────
  {
    id: "deadlines",
    title: "Track Filing Deadlines",
    subtitle: "Never miss a GSTR filing date for any client",
    icon: "📅",
    estimatedTime: "5 min setup per client",
    prerequisites: [
      "Clients are added to the system",
      "You want to track <strong>GSTR-1, GSTR-3B, GSTR-2B</strong> filing deadlines",
    ],
    steps: [
      {
        title: "Open Filing Deadlines",
        description:
          "Click <strong>Deadlines</strong> from the sidebar or navigate directly. All clients' deadlines are shown in a calendar/list view.",
      },
      {
        title: "Seed deadlines for a new client",
        description:
          "For any new client, click <strong>Seed Deadlines</strong> — the system auto-creates standard GSTR-1 (11th), GSTR-3B (20th), and GSTR-2B (13th) deadlines for all months in the current FY.",
      },
      {
        title: "Mark a return as filed",
        description:
          "Click a deadline row, set the <strong>Filed Date</strong>, and save. The row turns green and the readiness indicator updates.",
      },
      {
        title: "Monitor readiness indicators",
        description:
          "Each deadline shows a <strong>% readiness</strong> score based on how many documents are locked for that period. 100% means all extracted documents are locked and ready to file.",
      },
      {
        title: "Edit a deadline date if needed",
        description:
          "Some returns have extended due dates. Click the deadline, change the <strong>Due Date</strong>, and save.",
      },
    ],
    errors: [
      {
        code: "Readiness shows 0%",
        meaning: "No documents are locked for this client + period.",
        fix: "Upload and lock the client's invoices for the relevant month first.",
      },
    ],
    tips: [
      "Deadlines are auto-created per Indian GST filing calendar (QRMP filers have different dates — edit manually).",
      "Sort by <strong>Due Date</strong> to see the most urgent filings first.",
    ],
  },

  // ─── 6. ITC Reconciliation ───────────────────────────────────────────────
  {
    id: "reconciliation",
    title: "ITC Reconciliation",
    subtitle: "Match your purchase invoices against GSTR-2B from the GST portal",
    icon: "🔁",
    estimatedTime: "10–20 min",
    prerequisites: [
      "Purchase invoices are <strong>uploaded and locked</strong> in CA Suite",
      "<strong>GSTR-2B JSON</strong> has been downloaded from the GST portal (or fetched via GST Portal integration)",
    ],
    steps: [
      {
        title: "Open ITC Reconciliation",
        description:
          "Click <strong>Reconciliation</strong> in the sidebar.",
      },
      {
        title: "Select a client",
        description:
          "Use the client dropdown to pick the client you want to reconcile.",
      },
      {
        title: "Load GSTR-2B data",
        description:
          "Either: (a) Use the <strong>GST Portal integration</strong> to auto-fetch GSTR-2B — go to <em>Integrations → GST Portal</em> and run Fetch. Or (b) upload the GSTR-2B JSON file manually.",
      },
      {
        title: "Review discrepancies",
        description:
          "The table shows three categories:<ul><li><strong>Matched</strong> — invoice found in both CA Suite and GSTR-2B ✓</li><li><strong>In GSTR-2B only</strong> — supplier filed but you haven't captured the invoice yet</li><li><strong>In CA Suite only</strong> — you have the invoice but supplier hasn't filed GSTR-1 yet</li></ul>",
      },
      {
        title: "Take action on discrepancies",
        description:
          "<ul><li>For <em>In GSTR-2B only</em>: locate the missing invoice, upload it to CA Suite, and lock it</li><li>For <em>In CA Suite only</em>: follow up with the supplier to file their GSTR-1</li></ul>",
      },
      {
        title: "Save a reconciliation snapshot",
        description:
          "Click <strong>Save Snapshot</strong> to record the current reconciliation state for audit purposes. Snapshots can be compared later.",
      },
    ],
    errors: [
      {
        code: "No GSTR-2B data found",
        meaning: "GSTR-2B has not been loaded for this client/period.",
        fix: "Go to <strong>Integrations → GST Portal</strong>, log in with the client's credentials, and run Fetch GSTR-2B.",
      },
      {
        code: "Amount mismatch (small difference)",
        meaning: "The invoice amounts match but differ by a few paisa.",
        fix: "Usually a rounding difference. Verify the original invoice — if the taxable value is identical, this can be accepted. The system flags differences > ₹1.",
      },
    ],
    tips: [
      "Run reconciliation <strong>before the 20th of each month</strong> to catch missing invoices before GSTR-3B filing.",
      "A matched rate of <strong>95%+</strong> is typical. Below 80% means significant supplier non-compliance.",
    ],
  },

  // ─── 7. Zoho Books Sync ──────────────────────────────────────────────────
  {
    id: "zoho",
    title: "Connect Zoho Books",
    subtitle: "Sync locked invoices automatically to Zoho Books",
    icon: "🔗",
    estimatedTime: "10 min initial setup",
    prerequisites: [
      "You have a <strong>Zoho Books account</strong> with at least one organisation",
      "The client's GSTIN in CA Suite matches the GSTIN in the Zoho Books organisation",
      "Zoho integration is enabled by your admin (<code>FEATURE_ZOHO_SYNC_ENABLED=true</code>)",
    ],
    steps: [
      {
        title: "Open Zoho Integration",
        description:
          "Go to <strong>Integrations → Zoho Books</strong> in the sidebar.",
      },
      {
        title: "Select a client",
        description:
          "Pick the client you want to connect to Zoho.",
      },
      {
        title: "Click Connect",
        description:
          "You will be redirected to Zoho's OAuth login page. Sign in with your Zoho credentials and grant access.",
      },
      {
        title: "Select the Zoho organisation",
        description:
          "After OAuth, a list of your Zoho organisations appears. Select the one matching this client. The system will verify the GSTIN matches — if there is a mismatch, you will be asked to confirm.",
      },
      {
        title: "Sync is now automatic",
        description:
          "Every time you <strong>lock a document</strong> for this client, it is automatically pushed to Zoho Books. You can also click <strong>Sync Now</strong> to manually trigger a sync of all locked-but-not-synced documents.",
      },
      {
        title: "Check sync status",
        description:
          "The integration screen shows <strong>last sync time</strong> and <strong>number of invoices synced</strong>. Click <strong>Reconcile</strong> to compare CA Suite vs Zoho Books data.",
      },
    ],
    errors: [
      {
        code: "GSTIN mismatch",
        meaning: "The GSTIN on the client record in CA Suite doesn't match the Zoho organisation.",
        fix: "Verify both GSTINs carefully. If correct and you still want to link them, confirm the mismatch prompt. Otherwise correct the wrong GSTIN first.",
      },
      {
        code: "Token expired",
        meaning: "The Zoho OAuth token has expired (typically after 60 days of inactivity).",
        fix: "Go to Integrations → Zoho Books and click <strong>Reconnect</strong>. You will need to re-authorise via Zoho OAuth.",
      },
      {
        code: "Invoice already exists in Zoho",
        meaning: "Zoho Books already has an invoice with this number for this party.",
        fix: "This is a duplicate sync attempt. The system skips these automatically. If the amounts differ, check both systems and resolve manually in Zoho.",
      },
    ],
    tips: [
      "Zoho sync only pushes <strong>locked</strong> documents — unlocked drafts are never synced.",
      "The reconciliation report shows invoices in CA Suite but missing in Zoho (push failed) and vice versa.",
    ],
  },

  // ─── 8. GST Portal Integration ───────────────────────────────────────────
  {
    id: "gst-portal",
    title: "GST Portal Integration",
    subtitle: "Fetch GSTR-2B and return filing status directly from the GST portal",
    icon: "🏛️",
    estimatedTime: "5 min",
    prerequisites: [
      "You have the client's <strong>GST portal login credentials</strong> (username + OTP access on registered mobile)",
      "The client is registered on <strong>www.gst.gov.in</strong>",
    ],
    steps: [
      {
        title: "Open GST Portal Integration",
        description:
          "Go to <strong>Integrations → GST Portal</strong> in the sidebar.",
      },
      {
        title: "Select a client",
        description:
          "Choose the client whose GST portal you want to connect.",
      },
      {
        title: "Click Request OTP",
        description:
          "Enter the client's GST portal username. Click <strong>Request OTP</strong> — an OTP will be sent to the registered mobile number.",
      },
      {
        title: "Enter the OTP",
        description:
          "Type the 6-digit OTP and click <strong>Verify</strong>. A session is established with the GST portal.",
      },
      {
        title: "Fetch GSTR-2B",
        description:
          "Click <strong>Fetch GSTR-2B</strong> for the relevant return period. The data is downloaded and imported into CA Suite for reconciliation.",
      },
      {
        title: "Sync return status",
        description:
          "Click <strong>Sync Return Status</strong> to update the filing status of GSTR-1 and GSTR-3B for this client.",
      },
    ],
    errors: [
      {
        code: "OTP expired",
        meaning: "OTPs are valid for 10 minutes.",
        fix: "Click <strong>Request OTP</strong> again to get a fresh OTP.",
      },
      {
        code: "Invalid credentials",
        meaning: "The GST portal username is incorrect.",
        fix: "Verify the username with the client. It is usually the 15-digit GSTIN.",
      },
      {
        code: "Portal unavailable",
        meaning: "The GST portal is down or undergoing maintenance (common on filing due dates).",
        fix: "Try again after some time. Portal maintenance windows are usually 11 PM–12 AM IST.",
      },
    ],
    tips: [
      "GST portal sessions expire after <strong>30 minutes of inactivity</strong>. If Fetch fails, re-verify with a new OTP.",
      "GSTR-2B is available from the <strong>14th of each month</strong> for the previous month.",
    ],
  },

  // ─── 9. Admin — LLM Budget & Pipeline ───────────────────────────────────
  {
    id: "admin",
    title: "Admin: Monitor Pipeline & Budget",
    subtitle: "Track AI extraction costs and manage the document processing queue",
    icon: "⚙️",
    estimatedTime: "Ongoing",
    prerequisites: [
      "You are signed in as <strong>Admin</strong>",
    ],
    steps: [
      {
        title: "Open Observe panel",
        description:
          "Click <strong>Observe</strong> in the sidebar (visible to admins only). This shows live pipeline metrics.",
      },
      {
        title: "Review daily LLM budget",
        description:
          "The <strong>Daily Budget (USD)</strong> controls how much is spent on AI extraction per day. Default is $2. When the budget is hit, new documents are deferred (queued) until midnight.",
      },
      {
        title: "Increase the daily budget if needed",
        description:
          "Click <strong>Edit Budget</strong>, enter a new amount, and save. Documents in the deferred queue will start processing immediately.",
      },
      {
        title: "Check pipeline queue depth",
        description:
          "The <strong>Queue Depth</strong> metric shows how many documents are waiting to be processed. A high number (>20) means the worker is busy — this is normal after a large batch upload.",
      },
      {
        title: "Check for stuck jobs",
        description:
          "If documents stay in <em>Processing</em> for more than 10 minutes, they may be stuck. The worker automatically reconciles stuck jobs every 5 minutes — or you can trigger a manual retry from the document's Records page.",
      },
    ],
    errors: [
      {
        code: "Budget deferred (all docs stuck in processing)",
        meaning: "Daily AI budget has been exhausted.",
        fix: "Increase the budget in Observe, or wait until midnight for the budget to reset.",
      },
      {
        code: "Worker not running",
        meaning: "The background worker process is down.",
        fix: "On the VPS, run: <code>docker compose up -d worker</code>. Check worker logs with <code>docker compose logs worker</code>.",
      },
    ],
    tips: [
      "Average AI cost is <strong>$0.02–0.05 per document</strong>. A $2 budget handles ~50–100 documents per day.",
      "Use the <strong>Activity Log</strong> to audit all user actions including lock, delete, and client edits.",
    ],
  },
];
