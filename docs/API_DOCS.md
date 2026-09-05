# DealFlow360 — API Reference

Base URL: `/api/v1`. All authenticated requests send `Authorization: Bearer <token>`.
All list endpoints support `?page=&page_size=`; fields marked **(list)** appear in
list/row views, **(detail)** only appear when opening a single record — this split
matters for frontend payload sizing.

Every endpoint below is grouped by the screen(s) it powers, with the exact field
set the frontend needs to render that screen, plus the write endpoints behind
each button in the wireframe.

---

## 1. Auth — Screen 1 (Login/Signup)

### `POST /auth/login`
**Request**
```json
{ "email": "string", "password": "string", "team_id": "string | null" }
```
**Response — fields needed on frontend**
| Field | Type | Used for |
|---|---|---|
| `token` | string | session auth |
| `user.id`, `user.name`, `user.role` | string | header/avatar, role-gated nav (rep/manager/finance/admin/customer) |
| `user.available_teams[]` | array | team/company selector, shown only if user belongs to >1 team |
| `redirect` | enum: `dashboard` \| `customer_portal` | internal users → Screen 2, customers → Screen 11 |

### `POST /auth/signup`
**Request**: `{ name, email, password, account_type: "internal" | "customer" }`
**Response**: same shape as login (auto-login after signup).

Validation errors return `422` with `{ field, message }[]` for inline field errors (email format, password strength) — matches "basic validation on email/password" note on the wireframe.

---

## 2. Dashboard — Screen 2 (Sales Dashboard)

### `GET /dashboard/summary`
**Response — fields needed on frontend**
| Field | Type | Widget |
|---|---|---|
| `pending_approvals_count` | int | "Pending Approvals" tile |
| `open_quotations_count` | int | "Open Quotations" tile |
| `at_risk_deals[]` → `{ id, customer_name, reason }` | array | "At Risk Deals" tile (reason = why Deal Health flagged it) |
| `recent_activity[]` → `{ id, timestamp, actor_name, message, entity_type, entity_id }` | array | Recent Activity feed; `entity_type/id` used to deep-link (e.g. click → Quotation Detail) |

---

## 3. Quotations — Screens 3 & 4

### `GET /quotations`
Query params: `status` (`draft\|pending_approval\|approved\|negotiation\|confirmed`), `q` (search), `view` (`kanban\|table`).
**Response — fields needed (list)**
| Field | Type |
|---|---|
| `id`, `code` (e.g. `Q-1042`) | string |
| `customer_name` | string |
| `amount` | decimal |
| `status` | enum |
| `updated_at` | datetime |

Kanban view groups client-side (or server pre-groups) by `status` into the 5 columns shown in Screen 3.

### `POST /quotations`
Creates a blank draft. **Request**: `{ customer_id, price_list_id }` → returns new `{ id, code }`, frontend redirects to Quotation Detail.

### `GET /quotations/{id}` — Screen 4
**Response — fields needed (detail)**
| Field | Type | Used for |
|---|---|---|
| `code`, `status` | string | header |
| `customer` → `{ id, name }` | object | Customer field |
| `price_list` → `{ id, name }` | object | Price List field |
| `lines[]` → `{ id, product_id, product_name, qty, unit_price, discount_pct, discount_limit_pct, list_price, line_status }` | array | line item table; `discount_limit_pct` from the customer's tier/category ceiling drives the **live** over-limit warning as the rep types |
| `upsell_suggestions[]` → `{ product_id, name, margin_note }` | array | Upsell & Cross-sell panel |
| `requires_approval` | bool | computed flag shown as a banner ("discount exceeds threshold, quote will go to approval") |

### `PATCH /quotations/{id}`
Saves line edits — **Save Draft** button. Body mirrors `lines[]` above (add/update/remove line, change discount/qty).
Server re-validates every `discount_pct` against tier/category ceiling on each save and returns `requires_approval` fresh — this backs the "checked as soon as it's entered" rule.

### `POST /quotations/{id}/submit`
**Submit for Approval** button. No body. Response: `{ status: "pending_approval" | "confirmed" }` — skips straight to `confirmed` if nothing exceeds ceilings.

---

## 4. Approvals — Screens 5 & 6

### `GET /approvals`
Query: `filter` (`pending\|returned\|approved`).
**Response — fields needed (list)**
| Field | Type |
|---|---|
| `quotation_code` | string |
| `customer_name` | string |
| `amount` | decimal |
| `blended_risk` | enum: `low\|medium\|high` |
| `stage` | enum: `submitted\|sales_manager\|finance\|confirmed` |
| `assigned_to` | string |

### `GET /approvals/{id}` — Screen 6
**Response — fields needed (detail)**
| Field | Type | Used for |
|---|---|---|
| `revenue_size` | enum: `low\|medium\|high` | header badge |
| `customer_tier` | string | header badge |
| `flag_reasons[]` → `{ line_name, discount_given_pct, limit_allowed_pct, over_by_pts, category }` | array | "Why This Quote Was Flagged" table |
| `stage` | enum | stepper position (`submitted→sales_manager→finance→confirmed`) |
| `history[]` → `{ actor_name, action, date, note }` | array | audit trail table |

### `POST /approvals/{id}/approve`
Body: `{ note?: string }`. Advances `stage`; if last required level per the blended-risk routing rule (Screen 18), quotation status → `approved`.

### `POST /approvals/{id}/return`
Body: `{ note: string }` (required — shown in history). Quotation status → `draft`, routed back to the rep.

### `POST /approvals/{id}/reject`
Body: `{ note: string }`. Terminal; quotation status → `rejected`.

All three write `{ actor_id, action, timestamp, note }` into `history[]` — matches the "all approvals/rejections/edits must be logged with user, timestamp, reason" rule from Screen 18.

---

## 5. Fulfillment — Screens 7 & 8

Implemented by `src/modules/fulfillment/*` behind `src/app/api/fulfillment/orders/**`. "Order" is
the same `Quotation` row used everywhere else (docs/ORDERS_FLOW.md §0) — there is no separate
Order model. DTOs live in `src/modules/fulfillment/application/types.ts`, following this repo's
actual camelCase-DTO / `/api/...` convention rather than the illustrative snake_case sketch this
section used to show.

**Authentication**: Clerk session resolved server-side via `getRequestActor()`. No session → `401
AUTHENTICATION_REQUIRED`.

**Authorization**: `requireInternal` (any of ADMIN/SALES_REP/MANAGER/FINANCE_OPS — no CUSTOMER).
No dedicated "Warehouse/Ops" role exists in the `Role` enum even though ORDERS_FLOW.md's actor
table lists one; every internal role can view and act, matching the same gate
`warehouseStockService`/`warehouseService` already use for their own view methods. A CUSTOMER
actor gets `403 FORBIDDEN`.

Only quotations that have reached `CONFIRMED` or later ever appear here: `CONFIRMED`,
`FULFILLMENT`, `BILLING`, `COMPLETED`.

**Warehouse stock-on-hand** (Screen 7's other panel — `product_name, warehouse_name, in_stock,
reserved, available`) is already real, existing functionality: see `/warehouses`
(src/app/warehouses/page.tsx) and `GET /api/warehouse-stock` (src/modules/stock). This feature
links to that screen rather than re-implementing it.

### `GET /api/fulfillment/orders`
**Response** `FulfillmentOrderListItemDto[]`: `{ id, orderCode, customerName, orderStatus,
fulfillmentStatus, hasOpenBackorder, lineCount, amount, updatedAt }`. `id` is the quotation id.

### `GET /api/fulfillment/orders/{id}` — Screen 8
**Response** `FulfillmentOrderDetailDto`: `{ id, orderCode, customerName, orderStatus,
fulfillmentStatus, orderTotal, lines[], suggestedSplit[], backorders[], billing, timeline[],
updatedAt }`.
- Before any `Fulfillment` row exists, `fulfillmentStatus` and `suggestedSplit[]` are **computed
  live and side-effect-free** on every read (`PENDING` when one warehouse covers the order,
  `SPLIT_PROPOSED` when it takes more than one) — this GET never writes.
- `suggestedSplit[]` → `{ warehouseId, warehouseName, quantity, estShipmentDate, cost }`, using
  the greedy largest-free-stock-first allocation in `domain/allocate-stock.ts` and the
  placeholder, versioned rate/lead-time model in `domain/estimate-shipping.ts` (no real carrier
  rate card exists yet — see that file's header comment before changing the numbers).
- `backorders[]` → `{ id, productName, warehouseName, remainingQty, status, restockEta }`.
- `billing` is a **read-only link** to whatever invoice already exists for this quotation (via
  the existing `invoices`/`payments` tables) — this feature never creates or mutates an invoice.
- `timeline[]` merges this order's own audit events (`ACCEPT_SUGGESTED_SPLIT`,
  `MANUAL_OVERRIDE`, `SHIP`) with the customer portal's `PORTAL_CONFIRM`/`PORTAL_CONFIRM_REROUTED`
  events for the same quotation, oldest first — the full order journey in one feed.
**Errors**: `404 NOT_FOUND` (wrong status or doesn't exist).

### `POST /api/fulfillment/orders/{id}/accept-split`
No body — accepts the server-computed suggestion as-is. **Business rules**: quotation must be
`CONFIRMED` (else `409 INVALID_STATE_TRANSITION`) with no existing `Fulfillment` row (else `409
ALREADY_ACTIONED`). Creates `Fulfillment` + `FulfillmentItem` + `StockReservation` rows,
increments each allocated `WarehouseStock.reservedQty`, creates a `Backorder` for any shortfall,
and advances the quotation to `FULFILLMENT`. Resulting `fulfillmentStatus` is `ALLOCATED` (full
coverage), `PARTIALLY_ALLOCATED` (some backordered), or `BACKORDERED` (none available anywhere).
**Response**: the refreshed `FulfillmentOrderDetailDto`.

### `POST /api/fulfillment/orders/{id}/override`
**Body** (`overrideSplitSchema`): `{ splits: [{ warehouseId, quantity }] }` — **Manual Override**.
Same state guards as accept-split, plus: only supports an order where every line shares one
product (`400 VALIDATION_ERROR` otherwise — `SuggestedSplitDto`/the override body carry no
per-line productId, matching this section's own original sketch); quantities must sum to the
full ordered amount (`400 VALIDATION_ERROR`); each warehouse must have enough free stock
(`availableQty - reservedQty`) for its requested quantity (`409 CONFIGURATION_CONFLICT`
otherwise). Always results in `ALLOCATED` (no backorder possible by construction).
**Response**: the refreshed `FulfillmentOrderDetailDto`.

### `POST /api/fulfillment/orders/{id}/ship`
No body. Not wired to any UI button yet (Stage 1's UI was committed before this endpoint existed)
— available for a future UI update. **Business rules**: a `Fulfillment` row must exist (else
`409 INVALID_STATE_TRANSITION`), no backorder may still be `OPEN`/`CONSOLIDATING` (else `409`),
and it must not already be `SHIPPED` (else `409 ALREADY_ACTIONED`). Decrements
`availableQty`/`reservedQty` for every allocated item, sets `Fulfillment.status` to `SHIPPED`,
and advances the quotation to `BILLING`.
**Response**: the refreshed `FulfillmentOrderDetailDto`.

---

## 6. Subscriptions & Billing — Screens 9 & 10

### `GET /subscriptions`
Query: `status` (`active\|paused\|cancelled`).
**Response — fields needed (list)**: `customer_name, plan_name, cycle, next_bill_date, status`.

### `POST /subscriptions` — **+ New Plan** (admin)
Body: `{ customer_id, plan_id, cycle }`.

### `GET /subscriptions/{id}/billing` — Screen 10
**Response — fields needed (detail)**
| Field | Type |
|---|---|
| `customer_name`, `plan_name` | string |
| `one_time_lines[]` → `{ product_name, qty, amount }` | array — "from originating order" table |
| `recurring_lines[]` → `{ plan_name, cycle, next_bill_date, amount }` | array |

### `POST /subscriptions/{id}/modify`
Body: `{ plan_id?, cycle? }` — **Modify Subscription**.

### `POST /subscriptions/{id}/cancel`
No body — **Cancel Subscription**; status → `cancelled`.

---

## 7. Customer Portal — Screen 11

Implemented by `src/modules/negotiation/*` (application/infrastructure) behind `src/app/api/portal/quotations/**`.
DTOs live in `src/modules/portal/application/types.ts` and follow this codebase's actual
camelCase-DTO / `/api/...` convention rather than the illustrative `snake_case` / `/api/v1`
sketch this section used to show — field names below match what the server actually sends.

**Authentication**: Clerk session (or `x-dev-user-id` in non-production) resolved server-side via
`getRequestActor()` — never trust a customer id supplied by the client. No session → `401
AUTHENTICATION_REQUIRED`.

**Authorization**: every endpoint requires `role === "CUSTOMER"` with a resolved `customerId`
(`requireCustomer` in `src/modules/shared/domain/actor.ts`) — any other role gets `403 FORBIDDEN`.
Every query is additionally scoped to `customerId` at the database level (never fetch-then-check),
so requesting another customer's quotation id returns `404 NOT_FOUND`, identical to a
non-existent id — the response never reveals whether the id belongs to someone else.

Only quotations in a customer-visible status are ever returned: `SENT_TO_CUSTOMER`,
`UNDER_NEGOTIATION`, `RE_APPROVAL_REQUIRED`, `CONFIRMED`, `COMPLETED`. Of those, only
`SENT_TO_CUSTOMER` and `UNDER_NEGOTIATION` accept a negotiate/confirm action.

Every response DTO is pre-scrubbed of internal data (margin, cost, risk score, approval
chain/comments, inventory, other customers) — the repository never selects those columns for
this feature, so there is nothing to accidentally leak.

### `GET /api/portal/quotations`
List the signed-in customer's own quotations — "My Quotes" tab.
**Response** `PortalQuotationListItemDto[]`: `{ id, code, status, negotiationStatus, total, updatedAt }`.

### `GET /api/portal/quotations/{id}`
**Response** `PortalQuotationDetailDto`: `{ id, code, status, validUntil, customerName,
orderDiscountPct, orderTotal, lines[], negotiationStatus, pendingNegotiation, history[], updatedAt }`.
Each line: `{ id, productName, sku, quantity, unitPrice, discountPct, lineTotal, comments[] }`.
`pendingNegotiation` (`null` when none outstanding): `{ counterDiscountPct, requestedDeliveryDate,
generalComment, submittedAt }`. `history[]`: `{ id, actor: "CUSTOMER"|"SALES", actorLabel, action,
detail, createdAt }`, oldest first.
**Errors**: `404 NOT_FOUND` (not owned, wrong status, or doesn't exist).

### `POST /api/portal/quotations/{id}/negotiate`
**Body** (`negotiateQuotationSchema`, at least one field required): `{ counterDiscountPct?: 0-100,
requestedDeliveryDate?: "YYYY-MM-DD", generalComment?: string, lineComments?: [{lineId, comment}],
changeRequests?: [{lineId, requestType: "QUANTITY_CHANGE"|"REMOVE_LINE"|"OTHER", note}] }`.
**Validation**: Zod schema server-side (never trusts client-side validation); every `lineId`
referenced must belong to this quotation or the whole request is rejected.
**Business rules**: quotation must be `SENT_TO_CUSTOMER` or `UNDER_NEGOTIATION` (else `409
INVALID_STATE_TRANSITION`); at most one negotiation may be `PENDING` at a time (else `409
ALREADY_ACTIONED`). Persists one `Negotiation` row plus `CustomerComment`/`ChangeRequest` rows,
moves the quotation to `UNDER_NEGOTIATION`, and writes an audit log entry.
**Response**: the refreshed `PortalQuotationDetailDto`.

### `POST /api/portal/quotations/{id}/confirm`
No body. Re-evaluates the quotation's current discount/risk using the same discount-ceiling and
risk-scoring engines T7.2's submit flow uses (`resolveDiscountCeiling`, `scoreRisk` —
`src/modules/discount-risk`), then looks up the active `ApprovalRule` for the resulting risk band.
**Business rules**: same state/pending guards as negotiate (`409` on either failure). If the risk
band requires approval, freezes a new `QuotationVersion` + `RiskEvaluation` + `ApprovalRecord`
chain (same shape T7.2 writes) and sets status to `RE_APPROVAL_REQUIRED`; otherwise sets `CONFIRMED`.
**Response**: `{ result: { status: "CONFIRMED" | "PENDING_APPROVAL", reason?: "threshold_exceeded" },
quotation: PortalQuotationDetailDto }` — one round trip, no separate re-fetch needed.

---

## 8. Invoices — Screens 12 & 13

### `GET /invoices`
Query: `status` (`unpaid\|paid`).
**Response — fields needed (list)**: `invoice_code, customer_name, amount, status, due_date`.

### `GET /invoices/{id}` — Screen 13
**Response — fields needed (detail)**
| Field | Type |
|---|---|
| `fulfillment_stage` | enum: `order_confirmed\|shipped\|invoiced\|paid` (drives the stepper) |
| `lines[]` → `{ invoice_code, type: "shipping"\|"recurring", amount, status, due_date }` | array |
| `partial_notice` → `{ delivered_pct, days_waiting } \| null` | object — powers "partial invoicing reconciled with partial delivery" banner |

### `POST /invoices/{id}/record-payment`
Body: `{ amount, method?, reference? }` — **Record Payment**; status → `paid`.

### `POST /invoices/{id}/send-reminder`
No body — **Send Reminder** (only enabled when `status = unpaid` and past `due_date`).

---

## 9. Deal Health — Screen 14

### `GET /deal-health/summary`
**Response — fields needed**: `stalled_deals_count, discount_anomalies_count, delivery_slippage_count` — the three tiles.

### `GET /deal-health/flags`
**Response — fields needed (list)**: `customer_name, issue_type (idle\|discount_anomaly\|slippage), detail (e.g. "Idle 6 days", "22% vs avg 8%"), flagged_at, action_taken`.

### `POST /deal-health/flags/{id}/escalate`
### `POST /deal-health/flags/{id}/nudge`
Both no-body; set `action_taken` and notify the assigned rep/manager.

---

## 10. Admin / Reporting — Screen 15

### `GET /reports/summary`
Query: `period, sales_rep_id?, approval_status?, product_id?`.
**Response — fields needed**: `quotes_created_count, avg_approval_time_hours, top_upsell_product_name`.

### `GET /reports/export?format=pdf|xlsx`
Returns a file stream (binary), not JSON — **Export PDF / Export XLS** buttons trigger a direct download using current filter state as query params.

---

## 11. Product Catalog — Screens 16 & 17

### `GET /products`
**Response — fields needed (list)**: `name, category, variant_count, price, unit, tax_pct, status`.
### `GET /products/summary`
**Response — fields needed**: `total_products_count, pricelist_count, variant_count` — the three tiles on Screen 16.

### `GET /products/{id}` — Screen 17
**Response — fields needed (detail)**
| Field | Type |
|---|---|
| `name, category, price, unit, description, tax_pct` | scalar — General Info |
| `is_subscription` | bool | "Subscription Yes/No" toggle |
| `recurring_cycle` | enum: `monthly\|quarterly\|yearly` \| null | only relevant/shown if `is_subscription=true` |
| `variants[]` → `{ attribute, values[], extra_price }` | array | Product Variants table |
| `pricelists[]` → `{ tier, currency, price_rule }` | array | Pricelists table |

### `POST /products` / `PATCH /products/{id}`
Body mirrors the detail shape above — **+ New Product** / edit-save.

---

## 12. Discount Tiers & Approval Chain — Screen 18

### `GET /config/discount-tiers`
**Response — fields needed**
| Field | Type |
|---|---|
| `tier_ceilings[]` → `{ tier, max_discount_pct }` | array |
| `category_ceilings[]` → `{ category, max_discount_pct }` | array |
| `escalation_rules[]` → `{ discount_range_label, approval_level: "none"\|"sales_manager"\|"sales_manager_then_finance" }` | array |

This is the config every quotation/approval calculation reads (`discount_limit_pct` on Screen 4, `flag_reasons` and `stage` routing on Screen 6).

### `PUT /config/discount-tiers`
**Save configuration** — replaces the three arrays above in one call (admin-only).

---

## Cross-cutting notes for frontend implementation

- **List vs. detail payloads**: keep list endpoints thin (only the columns actually rendered in the table/kanban card); never return `lines[]`/`history[]` on list calls — fetch detail on row click.
- **Status enums are shared vocabulary** across quotations, approvals, fulfillment, invoices — keep one enum per domain server-side and let the frontend map to badge colors, don't infer status from other fields.
- **Every mutating endpoint that a human can trigger from a wireframe button** (submit, approve, return, reject, accept-split, override, modify, cancel, negotiate, confirm, record-payment, send-reminder, escalate, nudge) should return the updated parent resource (or at least its new `status`) so the frontend can update in place without a full refetch.
- **Audit logging**: `POST /approvals/{id}/{approve|return|reject}` and `PUT /config/discount-tiers` must persist actor + timestamp + reason server-side regardless of what the frontend sends, per the compliance note on Screen 18.

See [ORDERS_FLOW.md](./ORDERS_FLOW.md) for how these endpoints chain together across the order lifecycle.
