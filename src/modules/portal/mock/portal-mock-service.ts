/**
 * TEMPORARY MOCK ADAPTER — Customer Portal Negotiation (Stage 1: UI only).
 *
 * No backend exists yet for the customer portal (confirmed: no `src/modules/negotiation/*`,
 * no `/api/portal/*` routes). This in-memory implementation of `PortalService` lets Stage 1
 * build and exercise the full negotiation UI against the contract Stage 2 must fulfil.
 *
 * DELETE THIS FILE (and portal-mock-data.ts) once a real, Prisma/Clerk-backed
 * `PortalService` implementation exists. Nothing in `src/app/portal/**` should need to change
 * beyond swapping which implementation `getPortalService()` returns.
 */
import type {
  PortalConfirmResultDto,
  PortalNegotiationRequestInput,
  PortalQuotationDetailDto,
  PortalQuotationListItemDto,
  PortalService,
} from "@/modules/portal/application/types";
import { MOCK_QUOTATIONS } from "@/modules/portal/mock/portal-mock-data";

const MOCK_LATENCY_MS = 450;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_LATENCY_MS));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Quotation states in which a customer may still negotiate or confirm terms. */
const NEGOTIABLE_STATUSES = new Set(["SENT_TO_CUSTOMER", "UNDER_NEGOTIATION"]);

export class MockPortalServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MockPortalServiceError";
  }
}

class MockPortalService implements PortalService {
  // Module-level store so edits persist across navigations within one session, like a real
  // backend would — but resets on every full page reload since it's memory-only.
  private store: PortalQuotationDetailDto[] = clone(MOCK_QUOTATIONS);

  async listQuotations(): Promise<PortalQuotationListItemDto[]> {
    const items = this.store.map((q) => ({
      id: q.id,
      code: q.code,
      status: q.status,
      negotiationStatus: q.negotiationStatus,
      total: q.orderTotal,
      updatedAt: q.updatedAt,
    }));
    return delay(clone(items));
  }

  async getQuotation(id: string): Promise<PortalQuotationDetailDto> {
    const found = this.store.find((q) => q.id === id);
    if (!found) {
      throw new MockPortalServiceError("Quotation not found, or you do not have access to it.");
    }
    return delay(clone(found));
  }

  async submitNegotiation(
    id: string,
    input: PortalNegotiationRequestInput,
  ): Promise<PortalQuotationDetailDto> {
    const quotation = this.store.find((q) => q.id === id);
    if (!quotation) {
      throw new MockPortalServiceError("Quotation not found, or you do not have access to it.");
    }
    if (!NEGOTIABLE_STATUSES.has(quotation.status)) {
      throw new MockPortalServiceError("This quotation is no longer open for negotiation.");
    }
    if (quotation.negotiationStatus === "PENDING") {
      throw new MockPortalServiceError(
        "A request is already pending. Wait for a response before submitting another.",
      );
    }
    if (
      input.counterDiscountPct === undefined &&
      !input.generalComment &&
      (!input.lineComments || input.lineComments.length === 0) &&
      (!input.changeRequests || input.changeRequests.length === 0)
    ) {
      throw new MockPortalServiceError(
        "Add a comment, counter-discount, or change request before submitting.",
      );
    }
    if (
      input.counterDiscountPct !== undefined &&
      (input.counterDiscountPct < 0 || input.counterDiscountPct > 100)
    ) {
      throw new MockPortalServiceError("Counter-discount must be between 0 and 100%.");
    }

    const now = new Date().toISOString();

    for (const lc of input.lineComments ?? []) {
      const line = quotation.lines.find((l) => l.id === lc.lineId);
      if (!line) continue;
      line.comments.push({
        id: `cmt-${quotation.id}-${line.comments.length + 1}-${Date.now()}`,
        author: "CUSTOMER",
        authorLabel: "You",
        comment: lc.comment,
        createdAt: now,
      });
    }

    const detailParts: string[] = [];
    if (input.counterDiscountPct !== undefined) {
      detailParts.push(`Counter-discount ${input.counterDiscountPct}%`);
    }
    if (input.requestedDeliveryDate) {
      detailParts.push(`delivery by ${input.requestedDeliveryDate}`);
    }
    if (input.changeRequests?.length) {
      detailParts.push(`${input.changeRequests.length} line change request(s)`);
    }

    quotation.pendingNegotiation = {
      counterDiscountPct:
        input.counterDiscountPct !== undefined ? input.counterDiscountPct.toFixed(2) : null,
      requestedDeliveryDate: input.requestedDeliveryDate ?? null,
      generalComment: input.generalComment ?? null,
      submittedAt: now,
    };
    quotation.negotiationStatus = "PENDING";
    quotation.status = "UNDER_NEGOTIATION";
    quotation.updatedAt = now;
    quotation.history.push({
      id: `hist-${quotation.id}-${quotation.history.length + 1}`,
      actor: "CUSTOMER",
      actorLabel: "You",
      action: "Requested change",
      detail: detailParts.length > 0 ? detailParts.join(", ") : input.generalComment ?? null,
      createdAt: now,
    });

    return delay(clone(quotation));
  }

  async confirmQuotation(id: string): Promise<PortalConfirmResultDto> {
    const quotation = this.store.find((q) => q.id === id);
    if (!quotation) {
      throw new MockPortalServiceError("Quotation not found, or you do not have access to it.");
    }
    if (!NEGOTIABLE_STATUSES.has(quotation.status)) {
      throw new MockPortalServiceError("This quotation cannot be confirmed in its current state.");
    }
    if (quotation.negotiationStatus === "PENDING") {
      throw new MockPortalServiceError(
        "Resolve the pending negotiation request before confirming.",
      );
    }

    const now = new Date().toISOString();
    // Simulated re-evaluation rule: a heavily discounted order routes back to approval instead
    // of confirming outright, mirroring the real re-approval flow this mock stands in for.
    const requiresReapproval = Number(quotation.orderDiscountPct) > 15;

    quotation.status = requiresReapproval ? "UNDER_NEGOTIATION" : "CONFIRMED";
    quotation.negotiationStatus = requiresReapproval ? "PENDING" : "ACCEPTED";
    quotation.updatedAt = now;
    quotation.history.push({
      id: `hist-${quotation.id}-${quotation.history.length + 1}`,
      actor: "CUSTOMER",
      actorLabel: "You",
      action: requiresReapproval ? "Confirmation routed for re-approval" : "Confirmed quotation",
      detail: requiresReapproval
        ? "Final discount exceeds the auto-confirm threshold; sales must re-approve."
        : null,
      createdAt: now,
    });

    return delay({
      status: requiresReapproval ? "PENDING_APPROVAL" : "CONFIRMED",
      reason: requiresReapproval ? "threshold_exceeded" : undefined,
    });
  }
}

let instance: PortalService | null = null;

/** Single entry point the UI uses to reach the portal backend — swap the implementation here in Stage 2. */
export function getPortalService(): PortalService {
  if (!instance) instance = new MockPortalService();
  return instance;
}
