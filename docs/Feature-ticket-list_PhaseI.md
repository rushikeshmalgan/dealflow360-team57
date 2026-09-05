# DealFlow360 — P0 Feature Ticket List for Claude Code

**Source documents:** `DealFlow360_Technical_Architecture_Document.md` (TAD) and `DealFlow360_Implementation_Ready_PRD.docx` (PRD).
**Scope:** P0 only (the five-minute-demo backbone per PRD §3 functional-requirement matrix and TAD §44 hour plan). P1 (Socket.IO realtime, recommendations panel, BullMQ/reporting/exports, deal health) and P2 (recommendation-rule setup, Tiptap/Yjs collaboration) are intentionally excluded — listed at the end as a backlog reference only.
**Codebase check:** This workspace has no existing repository, `package.json`, or prior DealFlow360 code — this is a **greenfield build**. Every ticket below assumes nothing exists yet. See "Questions for you" at the bottom before you hand these to Claude Code, in case there *is* a codebase elsewhere I haven't seen.

---

## How to use this list

Each ticket is sized to be one Claude Code session/PR: a single clear objective, explicit dependencies, the exact entities/endpoints it touches, and acceptance criteria lifted from the PRD's Given/When/Then requirements. Work the epics **in order** — Epic 0 in particular is deliberately a hard blocker for everything else, because it's where the shared code that *prevents* duplicate logic gets written once.

Format per ticket: `ID — Title [size] (depends on: …)`

---

## Duplication / overlap flags found while reading the spec (see "Questions for you" at the end)

While mapping PRD requirements to TAD architecture, four places stood out where the spec would cause duplicate or inconsistent logic if tickets were written naively (one ticket per PRD module, independently). I've already resolved these in how the tickets below are structured — flagging them so you can veto the resolution before work starts:

1. **PRD Module Q ("Order and Fulfillment", FR-ORD-001) duplicates PRD Module M ("Fulfillment and Warehouse Split", FR-FUL-001).** Both are P0 and both describe moving an approved/confirmed quotation into fulfillment tracking. The PRD even admits the ambiguity itself: *"PS uses quotation-to-order flow but does not define a formal Order entity or number; implementation must finalize this boundary."* The TAD already finalizes it — Quotation is the aggregate root, there is no separate `Order` entity/module in TAD §8's module table or §31's folder structure. **I merged Q into M as one Fulfillment epic (Epic 9)** rather than generating two overlapping sets of tickets. If you actually want a distinct Order entity/number, say so before Epic 9 starts — it changes the data model.
2. **Risk + margin calculation is invoked from at least three call sites** (initial submit, negotiation acceptance/re-approval, and — in P1 — recommendation acceptance). Written naively, three tickets would each hand-roll their own scoring code. I made it **one pure, versioned utility (T7.1)** that every caller (T7.2 submit flow, T12.4 negotiation flow) is required to import rather than reimplement.
3. **Authorization, audit-logging, and outbox-event writing** are needed by literally every mutating endpoint. I put all three behind **one shared-kernel ticket (T0.4)** that every other epic depends on, instead of letting each module hand-roll its own `authorize()` / audit writer — this is the single most likely source of duplicated or inconsistent logic if epics get worked out of order.
4. **Optimistic concurrency (`expectedVersion` check + version increment)** is required on Quotation, Approval Record, and Subscription per TAD §26. Built once as a generic Prisma helper (T0.4), not three bespoke implementations.

---

## Epic 0 — Foundation & Shared Kernel (blocks every other epic)

### T0.1 — Project scaffold [S]
Next.js App Router + TypeScript + Tailwind + shadcn/ui, ESLint/Prettier, Docker Compose for PostgreSQL 16 + Redis 7, pinned lockfile (Node, Next.js, Prisma versions frozen per TAD §3), `/api/health` route reporting `app/database healthy` vs `queue degraded` separately (TAD §50).
- **DoD:** `docker compose up` boots Postgres+Redis; `npm run dev` serves a page; `/api/health` returns 200 with a JSON body distinguishing DB health from queue health.

### T0.2 — Full P0 Prisma schema + migration + seed skeleton [M] (depends on: T0.1)
One migration covering **every** entity referenced by P0 tickets below (TAD §27 table + PRD §10 conceptual data model): users/roles, customers/customer_tiers, product_categories/products/product_variants, price_lists/price_list_items, discount_rules/approval_rules/approval_steps, quotations/quotation_lines/quotation_versions, risk_evaluations, approval_records, warehouses/warehouse_stock/stock_reservations, fulfillments/fulfillment_items/backorders, subscription_plans/subscriptions/billing_schedules, invoices/invoice_lines/payments/credit_notes, negotiations/change_requests/customer_comments, audit_logs, notification_outbox. UUID PKs, `created_at`/`updated_at`, `version` on aggregates, `numeric(14,2)` money, `numeric(7,4)` percentages, `timestamptz`.
- **Why one ticket, not per-module:** a shared schema avoids five different tickets each adding conflicting FKs to `quotations` or duplicate `version` columns.
- **DoD:** `prisma migrate dev` succeeds; `prisma/seed.ts` stub exists (populated fully in T13.2); ERD in TAD §27/§11 matches generated schema.

### T0.3 — API response & error-handling conventions [S] (depends on: T0.1)
`lib/errors.ts` with the typed error-code envelope from TAD §30 (`VALIDATION_ERROR` 400, `AUTHENTICATION_REQUIRED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INVALID_STATE_TRANSITION`/`VERSION_CONFLICT`/`ALREADY_ACTIONED` 409, `FILE_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500); a Zod-parse wrapper for every Route Handler; DTO convention (handlers never return raw Prisma models).
- **DoD:** one example Route Handler demonstrates the full envelope round-trip with a Zod validation failure and a typed business error.

### T0.4 — Shared domain kernel: authorize / audit / outbox / optimistic-concurrency [M] (depends on: T0.2, T0.3)
This is the ticket that prevents duplicate logic everywhere downstream:
- `authorize(actor, action, resource)` policy function + `requireRole()` / `requirePermission()`, enforcing TAD §6's role matrix and the invariant that IDs from the browser/job payload never establish ownership — `resource.customerId === actor.customerId` is checked in code, not trusted from input.
- `recordAuditAndOutbox(tx, {entityType, entityId, actorId, action, before, after, reason, outboxEvent?})` — single helper called inside every business transaction from every epic below; nothing downstream writes its own `audit_logs` insert or its own `notification_outbox` insert.
- `withOptimisticVersion(tx, entity, expectedVersion)` — generic conditional-update-or-409 helper reused by Quotation, Approval Record, Subscription mutations (TAD §26).
- **DoD:** unit tests proving `authorize()` denies cross-customer access even when a valid session is presented; a fake write path shows one call each to the audit and version helpers.

### T0.5 — Module folder scaffolding [S] (depends on: T0.4)
Create the empty `modules/<name>/{domain,application,infrastructure,schemas}` tree from TAD §31 for every P0 module (auth, users, customers, catalog, pricing, quotation, discount-risk, approval, warehouse, stock, fulfillment, subscription, billing, invoice, payment, negotiation, audit). Add a lint rule or code-review checklist item: **route handlers may not import `@prisma/client` directly** — only `infrastructure/` repositories may.
- **DoD:** an intentionally-broken PR (route handler importing Prisma directly) fails lint/CI.

---

## Epic 1 — Authentication & Identity (PRD Module A)

### T1.1 — Clerk integration [S] (depends on: T0.1)
`@clerk/nextjs`, `ClerkProvider` in root `<body>`, `clerkMiddleware()`/`proxy.ts` (Next 16+) or `middleware.ts` (Next ≤15), prebuilt `<SignIn/>`/`<SignUp/>`. Five roles (`ADMIN`, `SALES_REP`, `MANAGER`, `FINANCE_OPS`, `CUSTOMER`) stored in `publicMetadata.role`, settable only via trusted server/admin tooling.
- **PRD ref:** FR-AUTH-001, WF01, screen "Internal Login and Signup".
- **DoD:** signing in as a seeded user reaches an authenticated internal session; role claim is readable server-side via `auth()`.

### T1.2 — User sync (Clerk → PostgreSQL) [S] (depends on: T1.1, T0.4)
`POST /api/webhooks/clerk` (signature-verified) + an explicit seed/sync command; `users` row keyed by unique `clerk_user_id`, mirrors role + optional `customer_id`. Reject missing/unknown/mismatched roles — never accept a role from form data or client state.
- **DoD:** a webhook payload with an invalid signature is rejected with `INVALID_SIGNATURE`; a synced user's role in Postgres matches Clerk's claim.

### T1.3 — Portal vs internal context separation [S] (depends on: T1.2, T0.4)
Separate `(internal)` and `portal` route groups (TAD §31); portal session establishes `CUSTOMER` context only, with `authorize()` from T0.4 enforcing `resource.customerId === actor.customerId` on every portal query. Magic-link or email/password entry point for the portal (PRD WF01, WF37, screen "Customer Portal Login").
- **DoD:** a customer session cannot reach any `(internal)` route or API even with a guessed URL; automated test asserts 403.

---

## Epic 2 — Catalog & Pricing Configuration (PRD Module B)

### T2.1 — Product & Category CRUD [S] (depends on: T0.5, T1.3)
Admin-only `ProductService`/`CategoryService`; name, category, price, unit, tax, description, variants, extra price. `POST/GET /api/products`.
- **PRD ref:** FR-PROD-001, WF03, screen "Product and Price List".
- **DoD:** only active products/variants with a resolvable price can later enter a submitted quote (rule enforced in T6.3, but the "active" flag is created here).

### T2.2 — Customer & Customer Tier CRUD [S] (depends on: T0.5)
`CustomerService`/`TierService`; unique tier name; seed Bronze/Silver/Gold as *examples*, not hardcoded values. `GET/POST /api/customers`.
- **PRD ref:** entities Customer / Customer Tier (PRD §10).

### T2.3 — Price List resolution service [M] (depends on: T2.1, T2.2)
`PricingService.resolvePrice(customerTierId, productId, variantId, currency)` — deterministic, rejects overlapping price-list configuration at save time. `POST /api/price-lists`, `GET /api/price-lists`.
- **Reuse flag:** this single function is the *only* price lookup used by the Quotation Builder (T6.3). Do not let T6.3 re-derive price another way.
- **DoD:** two overlapping price-list rules for the same tier/currency/product are rejected on save.

---

## Epic 3 — Discount & Approval Governance Configuration (PRD Module C)

### T3.1 — Discount Rule CRUD (tier + category ceilings) [S] (depends on: T2.2, T2.1)
`DiscountRuleService`; configured tier/category ceiling, "lower ceiling wins when both exist" per TAD §10. `PUT /api/discount-rules/{id}`.
- **PRD ref:** FR-DISC-001, WF05, screen "Discount and Approval Setup".

### T3.2 — Approval Rule & Approval Step CRUD [S] (depends on: T3.1)
Risk-band → chain mapping (LOW→none, MEDIUM→manager, HIGH→manager then Finance), ordered `approval_step` records. `PUT /api/approval-rules/{id}`.
- **Reuse flag:** this config is read by exactly one place downstream — T8.1's chain-creation logic. Don't let T7.2 (risk scoring) also embed a copy of the band thresholds; it only *outputs* a score/band, T8.1 maps band→chain using this config.
- **DoD:** saving an overlapping or gapped approval range is rejected.

---

## Epic 4 — Warehouse Configuration (PRD Module D)

### T4.1 — Warehouse CRUD + shipping-cost weighting [S] (depends on: T0.5)
`WarehouseService`; name, replenishment rule, shipping-cost weighting. `POST /api/warehouses` (create as needed alongside `GET /api/warehouse-stock`).
- **PRD ref:** FR-WH-001, WF07, screen "Warehouse and Plan Setup".

### T4.2 — Warehouse Stock CRUD/import [S] (depends on: T4.1)
`warehouse_stock` unique on `(warehouse_id, product_id)`, `available_qty`/`reserved_qty` with `CHECK (available_qty >= reserved_qty)`. `GET /api/warehouse-stock`.
- **Reuse flag:** this table is the *only* place stock quantities live — the allocation engine (T9.1) reads/writes here directly; do not let the Fulfillment module cache its own copy of availability.

---

## Epic 5 — Subscription Plan Configuration (PRD Module E)

### T5.1 — Subscription Plan CRUD [S] (depends on: T2.1)
`PlanService`; monthly/quarterly/yearly cadence, product attachment, proration rule, cancellation rule, partial-refund rule (all stored as labeled configuration, not hardcoded, per TAD §25/§54). `POST /api/subscriptions` reads this at creation time (endpoint itself lives in Epic 10).
- **PRD ref:** FR-SUB-001, WF08, screen "Warehouse and Plan Setup" (shared screen with T4.1 per PRD).

---

## Epic 6 — Quotation Builder Core (PRD Modules H, I, J)

### T6.1 — Sales Workspace shell [S] (depends on: T1.3)
Nav for Quotations/Pipeline; Reload Data, Go to Back-end (role-gated), Close Workspace actions.
- **PRD ref:** FR-WS-001, WF10, screen "Sales Workspace".

### T6.2 — Quotation List & Pipeline [S] (depends on: T6.1)
Selectable cards (customer, amount, stage); Draft and Pending Approval stages at minimum (PRD explicitly says the complete stage list is "Not specified in PS" — use TAD §9's full state machine as the closed list). `GET /api/quotations`.
- **PRD ref:** FR-QUOTE-001, WF11, screen "Quotation List and Pipeline".

### T6.3 — Quotation aggregate: create + lines + quantity [M] (depends on: T2.3, T6.2, T0.4)
`QuotationService`; create Draft (customer + rep, version 1); add/remove Hardware/Services/Subscriptions lines via T2.3's `resolvePrice`; quantity +/-. Every mutation uses `withOptimisticVersion` from T0.4 — **not** a bespoke version check written inside `QuotationService`. `POST /api/quotations`, `POST /api/quotations/{id}/lines`, `PATCH /api/quotations/{id}`.
- **PRD ref:** FR-QUOTE-002 (partial), WF11–WF13.
- **DoD:** a stale-version PATCH returns `409 VERSION_CONFLICT` with the current version.

### T6.4 — Line & order discount + shared discount/margin calculation utility [M] (depends on: T6.3)
Pure function (`modules/discount-risk/domain/`): sequential combination `effectiveDiscount = 1 - (1-lineDiscount)*(1-orderDiscount)` (TAD §10); margin calculation from cost basis. `PATCH /api/quotations/{id}/discounts`.
- **Reuse flag:** this pure function is imported by T7.1 (risk scoring, which needs `excess_i` per line) and by the live-margin display (T6.5). It is written **once**, here, as domain code with no Next.js/Prisma dependency (TAD §31), so both callers get identical numbers.
- **PRD ref:** WF14, WF15, WF16.

### T6.5 — Live margin indicator [S] (depends on: T6.4)
Recalculates on price/quantity/discount change using T6.4's pure function; UI shows totals + margin live.
- **PRD ref:** screen "Quotation Builder" margin display; WF16.

---

## Epic 7 — Discount & Blended Risk Engine

### T7.1 — Risk-scoring pure utility [M] (depends on: T6.4)
`modules/discount-risk/domain/scoreRisk.ts` implementing TAD §10's exact formula: per-line `excess_i`, `valueWeight_i`, `weightedExcess`, `violationBreadth`, `maxExcess`, `marginPressure` → `riskScore`. Versioned config for weights/normalizers/thresholds. Returns `{score, band, configVersion, explanation}` with per-line allowed-limit/effective-discount/excess/weight/contribution — this is what gets persisted as `risk_evaluation` JSONB.
- **PRD ref:** "Blended Discount Risk Score" (PRD §5.B) — Gold-customer example (Laptop 12%/15% no violation; Setup Service 18%/10% flagged) is the required unit-test fixture.
- **Reuse flag:** the *only* other caller allowed is T12.4 (negotiation re-approval). No third implementation.

### T7.2 — Wire risk evaluation into submit/confirm flow [M] (depends on: T7.1, T3.1)
`SubmitQuotationUseCase`: freeze `QuotationVersion` (immutable snapshot/hash), call T7.1, persist `risk_evaluation`, determine required approval level from T3.1's ceilings + T3.2's band mapping (read-only from here). `POST /api/quotations/{id}/submit`.
- **PRD ref:** FR-QUOTE-002 (confirm behavior), WF17, WF18.
- **DoD:** the Gold/Laptop/Service fixture from T7.1 produces the documented flagged result end-to-end through this endpoint.

---

## Epic 8 — Approval Engine (PRD Module K)

### T8.1 — Automatic approval-chain creation [S] (depends on: T7.2, T3.2)
On submit, create ordered `approval_records` for the current `quotation_version_id` from T3.2's step config; only the first pending step is actionable.
- **PRD ref:** WF18, "Approval Routing" (PRD §5.C).

### T8.2 — Approve / Reject / Return actions [M] (depends on: T8.1, T0.4)
Conditional update where `status = PENDING AND version matches`; manager-before-Finance guard; second reviewer on an already-decided step gets `409 APPROVAL_ALREADY_ACTIONED`; every decision writes through T0.4's `recordAuditAndOutbox` (not a second audit writer). `POST /api/approvals/{recordId}/decision`.
- **PRD ref:** FR-APP-001, WF19–WF22.
- **DoD:** two concurrent approval attempts on the same step — one succeeds, one gets `409`.

### T8.3 — Approval queue & audit-trail views [S] (depends on: T8.2)
Manager/Finance queue (`GET /api/approvals/{quotationId}` scoped to role); read-only audit trail view sourced from the *same* `audit_logs` table T0.4 writes to.
- **PRD ref:** screen "Discount Approval"; WF22.

---

## Epic 9 — Warehouse Allocation & Fulfillment (merges PRD Modules M and Q — see flag #1 above)

### T9.1 — Stock-locking & reservation transaction [M] (depends on: T4.2, T0.4)
Deterministic `(warehouse_id, product_id)` row-lock order, `SELECT ... FOR UPDATE`, revalidate after lock, insert `stock_reservations`, enforce `CHECK (available_qty >= reserved_qty)`, `UNIQUE(fulfillment_id, product_id, warehouse_id)` + idempotency key. This is the **only** code path allowed to mutate `warehouse_stock`.
- **PRD ref:** "Warehouse Splitting" (PRD §5.E), TAD §14.

### T9.2 — Weighted-greedy warehouse allocation algorithm [M] (depends on: T9.1)
Heap-driven greedy plan + direct single-source plan comparison per TAD §13; scoring on coverage/shipping-cost/delivery-days/split-penalty/backorder-risk; picks lower final objective. `POST /api/fulfillments/recommend`.
- **PRD ref:** FR-FUL-001, WF25–WF26.
- **DoD:** the documented A/B/C warehouse fixture (TAD §48 demo script) picks the cheaper combined plan, not the single warehouse with the most raw stock.

### T9.3 — Accept split / manual override [S] (depends on: T9.2)
Both the "accept suggested" and "manual override" actions call **the same** feasibility+reservation validation from T9.1 — no second, looser validation path for manual overrides. `PUT /api/fulfillments/{id}/splits`.
- **PRD ref:** WF27, screen "Fulfillment Split".

### T9.4 — Backorder creation & consolidation prompt [S] (depends on: T9.3)
Persist unfilled quantity; when stock changes for a backordered product, surface the consolidation prompt. `POST /api/backorders/{id}/consolidate`.
- **PRD ref:** WF28–WF29.

### T9.5 — Confirmed-quotation → Fulfillment transition (absorbs FR-ORD-001) [S] (depends on: T9.1, T6.3)
No separate Order entity/number — `Fulfillment` references `quotation_id` directly (TAD §31 module list has no Order module; matches TAD architecture, differs from the PRD's ambiguous framing — **flagged in "Questions for you"**). Duplicate-confirmation must not create duplicate downstream fulfillment records (idempotency key on the transition).
- **PRD ref:** FR-ORD-001, WF44–WF45.

---

## Epic 10 — Hybrid Billing & Subscriptions (PRD Module N)

### T10.1 — Billing-plan creation on confirm [M] (depends on: T9.5, T5.1)
Classify each line `ONE_TIME`/`RECURRING`; one-time → invoice lines; recurring → `Subscription` + `BillingSchedule` from T5.1's cadence config. `POST /api/subscriptions`, `GET /api/billing-schedules/{subscriptionId}`.
- **PRD ref:** FR-BILL-001, WF30–WF32.

### T10.2 — Proration engine [S] (depends on: T10.1)
One transparent day-based rule for the demo, explicitly labeled as configuration (TAD §25 — the PS does not define a formula, so this is a documented implementation decision, not a gap). `PATCH /api/subscriptions/{id}`.
- **PRD ref:** WF33–WF34.

### T10.3 — Subscription modify/cancel + refund/credit-note trigger [S] (depends on: T10.2)
`POST /api/subscriptions/{id}/cancel`; refund/credit-note record created under the configured cancellation rule.
- **PRD ref:** WF35–WF36, screen "Subscription and Billing".

---

## Epic 11 — Payment & Invoice Status (PRD Module R)

### T11.1 — Idempotent payment recording + invoice status derivation [M] (depends on: T10.1, T0.4)
`recordPayment(invoiceId, amount, idempotencyKey)` — one transaction: unique idempotency record, Payment row, invoice status recalculation (`DRAFT`/`ISSUED`/`PARTIALLY_PAID`/`PAID`/`VOID`/`CREDITED`) as a **pure status-derivation function** — not recomputed ad hoc anywhere else that displays invoice status. `POST /api/invoices/{id}/payments`.
- **PRD ref:** FR-PAY-001, WF46–WF48.
- **DoD:** submitting the same payment twice with the same idempotency key returns the original result, not a duplicate.

---

## Epic 12 — Customer Portal & Negotiation (PRD Module O)

### T12.1 — Portal quotation DTO with internal fields stripped [S] (depends on: T1.3, T6.3)
A **dedicated portal DTO** built server-side that never includes margin/risk/approval/inventory/analytics fields — not the internal DTO with fields hidden in the client. `GET /api/portal/quotations/{id}`.
- **PRD ref:** FR-PORTAL-001, WF37–WF38, screen "Customer Quotation and Negotiation".

### T12.2 — Line comment + change request + counter-discount [S] (depends on: T12.1)
`Negotiation`/`ChangeRequest`/`CustomerComment` creation; comments never mutate terms directly. `POST /api/portal/quotations/{id}/requests`.
- **PRD ref:** WF39–WF41.

### T12.3 — Customer confirmation [S] (depends on: T12.2)
One-click confirm of displayed terms.
- **PRD ref:** WF42, screen action "Confirm Quotation".

### T12.4 — Negotiation acceptance → re-approval or fulfillment [M] (depends on: T12.3, T7.1, T8.1, T9.5)
When accepted terms are applied: one transaction creates a new `QuotationVersion`, **re-calls T7.1's risk utility and T6.4's discount/margin utility** (not a re-implementation), invalidates prior-version approval applicability, creates a new chain via T8.1's logic when thresholds are exceeded, otherwise routes straight to T9.5's fulfillment transition. `POST /api/quotations/{id}/confirm` (customer-triggered path) — note this is a *different* endpoint from T7.2's rep-side submit but **the same underlying risk/approval code**.
- **PRD ref:** WF43, "Customer Negotiation" (PRD §5.H).
- **DoD:** the documented demo fixture (customer counters, risk recalculates, quote re-enters approval automatically) passes end-to-end.

---

## Epic 13 — Cross-cutting transaction & seed hardening

### T13.1 — Transaction-boundary audit against TAD §26 [S] (depends on: T7.2, T8.2, T9.4, T11.1, T12.4)
Verify every listed write path (submit, approval action, negotiation acceptance, stock allocation, payment) is genuinely one Prisma interactive transaction with short timeout, and that email/Socket.IO calls (P1, not built yet) are never invoked *inside* a transaction, so P1 work can't later reintroduce a duplicate transactional side-effect pattern.
- **DoD:** a written checklist, one row per operation in TAD §26's table, each ticked with the PR link that implemented it.

### T13.2 — Seed data & demo fixtures [S] (depends on: T13.1)
Five demo role accounts, Gold customer with Laptop (12% discount, within 15% ceiling) and Setup Service (18% discount, above 10% ceiling) lines, three warehouses (A/B/C) with the stock split described in TAD §48, one subscription plan.
- **PRD ref:** TAD §48 five-minute demo script — this is the literal fixture set judges will see.

---

## Epic 14 — Integration & Security Testing (P0 exit criteria, TAD §47)

### T14.1 — Integration tests: full P0 happy path [M] (depends on: Epics 6–12 complete)
quotation → approval → allocation; negotiation → re-approval; payment → PAID; each against the seeded fixtures from T13.2.

### T14.2 — Security tests [S] (depends on: T14.1)
Missing/invalid Clerk session, unknown/mismatched role, webhook signature failure, cross-customer quotation/document access — all must be denied.

### T14.3 — Concurrency tests [S] (depends on: T14.1)
Duplicate approval on one step, simultaneous stock reservation, stale quotation version, duplicate payment — assert the exact behaviors documented in TAD §41's concurrency table.

---

## Excluded from this list (P1/P2 backlog — for later tickets, not now)

- Socket.IO realtime rooms/events (TAD §23) — P1
- BullMQ/Redis worker + outbox dispatcher, Resend email (TAD §24/§24A) — P1
- Upsell/cross-sell recommendation engine + panel (PRD Modules F, L) — P1/P2
- Deal Health dashboard (PRD Module P) — P1
- Reporting dashboard + PDF/XLS export (PRD Module G) — P1
- Tiptap/Yjs/Hocuspocus collaborative editing (TAD §20–21) — P2, feature-flagged

---

## Questions for you (answer whenever convenient — this didn't block the list above)

1. **No existing codebase was found** in this workspace (empty directory, no git repo, no `package.json`). I've written every ticket assuming a from-scratch build. If there's actually a partial DealFlow360 codebase somewhere I should be looking at instead (a separate repo, a folder on your linked computer), point me to it and I'll re-scan for existing logic before any ticket gets handed to Claude Code — some of these could shrink to "extend existing X" rather than "build X."
2. **Order entity decision (flag #1 above):** I merged PRD's "Order and Fulfillment" module into the Fulfillment epic with no distinct Order entity/number, matching the TAD. Confirm that's what you want for the demo, since it affects the data model in T0.2 and the endpoint shape in T9.5.
3. Do you want the risk-scoring utility (T7.1) and discount/margin utility (T6.4) split into two packages/services, or is one shared `discount-risk` module (as scoped above) fine? I defaulted to "one module, two pure functions" per TAD's module table.
4. Should Epic 0's shared kernel (T0.4) also stub the P1 audit/notification outbox row shape now (even though the BullMQ dispatcher that reads it isn't built until P1), so P0 code doesn't need to touch that table again later? Currently scoped as "yes, write the row; no, don't build the dispatcher" — flag if you'd rather defer the outbox write entirely to P1.