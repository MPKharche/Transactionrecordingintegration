# Zoho Books India — API Context (CA Suite)

Permanent reference for Zoho Books India integration in CA Suite.

## Endpoints

| Layer | URL |
|-------|-----|
| Books API base | `https://www.zohoapis.in/books/v3` |
| OAuth authorize | `https://accounts.zoho.in/oauth/v2/auth` |
| OAuth token | `https://accounts.zoho.in/oauth/v2/token` |

Always pass `organization_id` query param on Books API calls.

## OAuth scopes

- `ZohoBooks.fullaccess.all`
- `ZohoBooks.contacts.CREATE`
- `ZohoBooks.invoices.CREATE`

## Document type → Zoho entity

| `gst_documents.doc_type` | Zoho endpoint |
|--------------------------|---------------|
| `sales_invoice` | `POST/PUT /invoices` |
| `purchase_invoice` | `POST/PUT /bills` |
| `credit_note_issued` | `POST/PUT /creditnotes` |
| `credit_note_received` | `POST/PUT /vendorcredits` |
| `debit_note_issued` | `POST/PUT /invoices` (`is_debit_note: true`) |
| `debit_note_received` | `POST/PUT /bills` (`is_debit_note: true`) |

## Field mapping (gst_documents → Zoho)

| CA Suite | Zoho payload |
|----------|--------------|
| `doc_number` | `invoice_number` / `bill_number` |
| `doc_date` | `date` |
| `place_of_supply` | `place_of_supply` |
| counterparty GSTIN | `gst_no` + contact lookup |
| `document_lines.description` | `line_items[].name` |
| `document_lines.hsn_sac` | `line_items[].hsn_or_sac` |
| `document_lines.qty` | `line_items[].quantity` (Decimal string) |
| `document_lines.rate` | `line_items[].rate` (Decimal string) |

## GST treatment

| Condition | `gst_treatment` |
|-----------|-----------------|
| B2B with valid counterparty GSTIN | `business_gst` |
| Business without GSTIN | `business_none` |
| Overseas | `overseas` |
| Consumer | `consumer` |

## Error classification

| HTTP / condition | Code | Retry? |
|------------------|------|--------|
| 429 | `RATE_LIMITED` | Yes (honour Retry-After) |
| 500–504 | `ZOHO_SERVER_ERROR` | Yes |
| 401 after refresh fail | `AUTH_REVOKED` | No |
| 400 / 403 / 404 | `HTTP_*` | No |
| ECONNRESET / ETIMEDOUT | network code | Yes |

## Sync status (`gst_documents.zoho_sync_status`)

`not_configured` → `pending` → `syncing` → `synced` | `error` | `skipped`

Lock API sets `pending` and enqueues BullMQ job `zoho-push-{docId}` without blocking the HTTP response.

## Environment

```bash
ZOHO_TOKEN_ENCRYPTION_KEY=   # openssl rand -hex 32
FEATURE_ZOHO_SYNC_ENABLED=true|false
FEATURE_ZOHO_SYNC_PILOT_TENANT_ID=   # optional pilot
ZOHO_OAUTH_REDIRECT_URI=
ZOHO_CLIENT_ID= / ZOHO_CLIENT_SECRET=  # or per-tenant in DB
```

## Self-healing

- Circuit breaker: 5 failures → OPEN 30 min
- Reconcile cron: stuck `syncing` > 10 min → re-queue
- Token refresh cron: every 30 min, refresh if expires < 1 h
