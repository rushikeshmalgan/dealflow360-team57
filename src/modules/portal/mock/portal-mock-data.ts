/**
 * TEMPORARY MOCK FIXTURES — Customer Portal Negotiation (Stage 1: UI only).
 *
 * Backs `MockPortalService`. Delete this file (and the mock service) once the real
 * `/api/portal/*` routes exist and a Prisma-backed PortalService implementation replaces it —
 * see src/modules/portal/application/types.ts for the contract both must satisfy.
 */
import type { PortalQuotationDetailDto } from "@/modules/portal/application/types";

export const MOCK_QUOTATIONS: PortalQuotationDetailDto[] = [
  {
    id: "q-1001",
    code: "Q-1001",
    status: "SENT_TO_CUSTOMER",
    validUntil: "2026-09-20",
    customerName: "Aster Retail Group",
    orderDiscountPct: "5.00",
    orderTotal: "10,133.00",
    updatedAt: "2026-09-02T10:15:00.000Z",
    negotiationStatus: "NONE",
    pendingNegotiation: null,
    lines: [
      {
        id: "line-1001-1",
        productName: "Industrial Shelving Unit",
        sku: "SHLV-200",
        quantity: 12,
        unitPrice: "845.00",
        discountPct: "5.00",
        lineTotal: "9,633.00",
        comments: [],
      },
      {
        id: "line-1001-2",
        productName: "Extended Warranty (3yr)",
        sku: "WARR-3Y",
        quantity: 12,
        unitPrice: "45.00",
        discountPct: "0.00",
        lineTotal: "500.00",
        comments: [],
      },
    ],
    history: [
      {
        id: "hist-1001-1",
        actor: "SALES",
        actorLabel: "Sales Team",
        action: "Quotation sent",
        detail: "Initial quotation shared for your review.",
        createdAt: "2026-09-02T10:15:00.000Z",
      },
    ],
  },
  {
    id: "q-1002",
    code: "Q-1002",
    status: "UNDER_NEGOTIATION",
    validUntil: "2026-09-18",
    customerName: "Aster Retail Group",
    orderDiscountPct: "8.00",
    orderTotal: "24,610.00",
    updatedAt: "2026-09-04T14:40:00.000Z",
    negotiationStatus: "PENDING",
    pendingNegotiation: {
      counterDiscountPct: "12.00",
      requestedDeliveryDate: "2026-10-01",
      generalComment: "Can we get closer to 12% off given the order size? Also need delivery by Oct 1.",
      submittedAt: "2026-09-04T14:40:00.000Z",
    },
    lines: [
      {
        id: "line-1002-1",
        productName: "Loading Dock Kit",
        sku: "DOCK-500",
        quantity: 4,
        unitPrice: "5,200.00",
        discountPct: "8.00",
        lineTotal: "19,136.00",
        comments: [
          {
            id: "cmt-1002-1",
            author: "CUSTOMER",
            authorLabel: "You",
            comment: "Can this ship in two batches instead of one?",
            createdAt: "2026-09-04T14:38:00.000Z",
          },
        ],
      },
      {
        id: "line-1002-2",
        productName: "Docking Setup Service",
        sku: "SVC-DOCK",
        quantity: 1,
        unitPrice: "1,200.00",
        discountPct: "0.00",
        lineTotal: "1,200.00",
        comments: [],
      },
    ],
    history: [
      {
        id: "hist-1002-1",
        actor: "SALES",
        actorLabel: "Sales Team",
        action: "Quotation sent",
        detail: null,
        createdAt: "2026-09-03T09:00:00.000Z",
      },
      {
        id: "hist-1002-2",
        actor: "CUSTOMER",
        actorLabel: "You",
        action: "Requested change",
        detail: "Counter-discount 12%, delivery by 2026-10-01",
        createdAt: "2026-09-04T14:40:00.000Z",
      },
    ],
  },
  {
    id: "q-1003",
    code: "Q-1003",
    status: "CONFIRMED",
    validUntil: "2026-08-30",
    customerName: "Aster Retail Group",
    orderDiscountPct: "6.00",
    orderTotal: "6,478.00",
    updatedAt: "2026-08-22T16:05:00.000Z",
    negotiationStatus: "ACCEPTED",
    pendingNegotiation: null,
    lines: [
      {
        id: "line-1003-1",
        productName: "Pallet Racking — Standard",
        sku: "RACK-STD",
        quantity: 8,
        unitPrice: "862.00",
        discountPct: "6.00",
        lineTotal: "6,478.00",
        comments: [],
      },
    ],
    history: [
      {
        id: "hist-1003-1",
        actor: "SALES",
        actorLabel: "Sales Team",
        action: "Quotation sent",
        detail: null,
        createdAt: "2026-08-18T11:00:00.000Z",
      },
      {
        id: "hist-1003-2",
        actor: "CUSTOMER",
        actorLabel: "You",
        action: "Requested change",
        detail: "Counter-discount 6%",
        createdAt: "2026-08-19T09:30:00.000Z",
      },
      {
        id: "hist-1003-3",
        actor: "SALES",
        actorLabel: "Sales Team",
        action: "Counter-offer accepted",
        detail: "6% discount approved, updated quotation sent.",
        createdAt: "2026-08-20T13:15:00.000Z",
      },
      {
        id: "hist-1003-4",
        actor: "CUSTOMER",
        actorLabel: "You",
        action: "Confirmed quotation",
        detail: null,
        createdAt: "2026-08-22T16:05:00.000Z",
      },
    ],
  },
];
