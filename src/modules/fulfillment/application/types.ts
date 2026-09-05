/**
 * Order & Fulfillment — DTO contract (Stage 1: UI only).
 *
 * "Order" is not a separate entity — per docs/ORDERS_FLOW.md §0, the order/deal is the same
 * `Quotation` row that moved through quoting/approval/negotiation, now in one of its
 * fulfillment-stage statuses (CONFIRMED, FULFILLMENT, BILLING, COMPLETED). This module adds
 * fulfillment/shipment/backorder/billing visibility on top of that existing lifecycle — it does
 * not define a competing one. `OrderStatus`/`BillingStatus` below are re-exported verbatim from
 * the quotation/invoice modules rather than redeclared, so there is exactly one source of truth
 * for each.
 *
 * No backend exists yet for this feature (confirmed: `Fulfillment`, `FulfillmentItem`,
 * `Backorder`, `StockReservation` are Prisma models with zero application-layer usage anywhere
 * in `src/modules/*` today). `src/modules/fulfillment/mock/*` stands in for it — see that
 * file's own header for the deletion note once Stage 2 lands.
 *
 * Expected backend contract (translating docs/API_DOCS.md §5's illustrative snake_case /
 * `/fulfillment/...` sketch into this codebase's actual camelCase DTO / `/api/...` convention,
 * exactly as Stage 1 of Customer Portal Negotiation did for §7):
 *   GET  /api/fulfillment/orders                    -> FulfillmentOrderListItemDto[]
 *   GET  /api/fulfillment/orders/{id}                -> FulfillmentOrderDetailDto  (id = quotationId)
 *   POST /api/fulfillment/orders/{id}/accept-split   (no body) -> FulfillmentOrderDetailDto
 *   POST /api/fulfillment/orders/{id}/override       (body: OverrideSplitInput) -> FulfillmentOrderDetailDto
 *
 * Warehouse stock-on-hand levels (Screen 7's other panel) are already real, existing
 * functionality — see `/warehouses` (src/app/warehouses/page.tsx) and `GET /api/warehouse-stock`
 * (src/modules/stock). This module links to that screen rather than re-fetching or duplicating
 * the same data.
 */
import type { InvoiceStatus } from "@/modules/invoice";
import type { QuotationStatus } from "@/modules/quotation";

/** The order's own lifecycle status — literally `Quotation.status` (TAD SS9). Only orders in one
 * of the fulfillment-relevant statuses ever appear in this feature's list/detail. */
export type OrderStatus = QuotationStatus;

/** Verbatim from the Prisma `FulfillmentStatus` enum (schema.prisma) — never redefined. `null`
 * (not a fifth invented member) means no `Fulfillment` row exists yet for this order. */
export type FulfillmentStatus =
  | "PENDING"
  | "SPLIT_PROPOSED"
  | "PARTIALLY_ALLOCATED"
  | "ALLOCATED"
  | "BACKORDERED"
  | "SHIPPED";

/** Verbatim from the Prisma `BackorderStatus` enum. */
export type BackorderStatus = "OPEN" | "CONSOLIDATING" | "RESOLVED";

/** The linked invoice's own status — literally `Invoice.status` (TAD SS8: "status derives from
 * issued amount, payments and credits"). `null` means no invoice has been generated yet. */
export type BillingStatus = InvoiceStatus;

export type FulfillmentOrderListItemDto = {
  id: string;
  orderCode: string;
  customerName: string;
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  hasOpenBackorder: boolean;
  lineCount: number;
  amount: string;
  updatedAt: string;
};

export type FulfillmentLineDto = {
  id: string;
  quotationLineId: string;
  productName: string;
  sku: string;
  orderedQty: number;
  /** Null until stock has been allocated to this line. */
  allocatedQty: number | null;
  warehouseName: string | null;
  estShipmentDate: string | null;
  shippingCost: string | null;
  /** Per-line rollup: PENDING (order confirmed, not yet allocated), ALLOCATED (fully allocated,
   * matches FulfillmentItem.status), or BACKORDERED (a Backorder row exists for this line). */
  lineStatus: "PENDING" | "ALLOCATED" | "BACKORDERED";
};

export type SuggestedSplitDto = {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  estShipmentDate: string | null;
  cost: string | null;
};

export type BackorderDto = {
  id: string;
  productName: string;
  warehouseName: string;
  remainingQty: number;
  status: BackorderStatus;
  restockEta: string | null;
};

export type BillingSummaryDto = {
  invoiceCode: string;
  status: BillingStatus;
  totalAmount: string;
  paidAmount: string;
  dueDate: string | null;
} | null;

export type OrderTimelineEntryDto = {
  id: string;
  actorLabel: string;
  action: string;
  detail: string | null;
  createdAt: string;
};

export type FulfillmentOrderDetailDto = {
  id: string;
  orderCode: string;
  customerName: string;
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  orderTotal: string;
  lines: FulfillmentLineDto[];
  /** Only populated while fulfillmentStatus is SPLIT_PROPOSED and no split has been accepted yet. */
  suggestedSplit: SuggestedSplitDto[];
  backorders: BackorderDto[];
  billing: BillingSummaryDto;
  timeline: OrderTimelineEntryDto[];
  updatedAt: string;
};

export type OverrideSplitInput = {
  splits: Array<{ warehouseId: string; quantity: number }>;
};
