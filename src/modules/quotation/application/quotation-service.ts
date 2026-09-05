import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireInternal, requireOwnResource, requireRole } from "@/modules/shared/domain/actor";

import type {
  AddQuotationLineInput,
  CreateQuotationInput,
  PatchQuotationInput,
  QuotationListQuery,
  UpdateQuotationDiscountsInput,
} from "../schemas/quotation";
import type { QuotationRepository } from "./ports";
import type { QuotationDto } from "./types";

/**
 * TAD SS6 role matrix, "Create and revise assigned quotations": Sales Rep is the only role
 * with default write access; Manager and Finance/Ops get Read; Admin has no default access.
 */
const WRITE_ROLES = ["SALES_REP"] as const;

export class QuotationService {
  constructor(private readonly repository: QuotationRepository) {}

  async list(actor: Actor | null, query: QuotationListQuery = {}) {
    requireInternal(actor);
    // A Sales Rep's view is always scoped to their own assigned quotations, regardless of
    // what salesRepId a caller passes — ownership is enforced in code, never trusted from input.
    const scopedQuery = actor.role === "SALES_REP" ? { ...query, salesRepId: actor.id } : query;
    return this.repository.list(scopedQuery);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const quotation = await this.getOrThrow(id);
    this.assertReadable(actor, quotation);
    return quotation;
  }

  create(actor: Actor | null, input: CreateQuotationInput) {
    requireRole(actor, WRITE_ROLES);
    return this.repository.create(input, actor);
  }

  async addLine(actor: Actor | null, id: string, input: AddQuotationLineInput) {
    requireRole(actor, WRITE_ROLES);
    await this.assertOwnedDraft(actor, id);
    return this.repository.addLine(id, input, actor);
  }

  async patch(actor: Actor | null, id: string, input: PatchQuotationInput) {
    requireRole(actor, WRITE_ROLES);
    await this.assertOwnedDraft(actor, id);
    return this.repository.patch(id, input, actor);
  }

  async updateDiscounts(actor: Actor | null, id: string, input: UpdateQuotationDiscountsInput) {
    requireRole(actor, WRITE_ROLES);
    await this.assertOwnedDraft(actor, id);
    return this.repository.updateDiscounts(id, input, actor);
  }

  private async getOrThrow(id: string): Promise<QuotationDto> {
    const quotation = await this.repository.get(id);
    if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id });
    return quotation;
  }

  private assertReadable(actor: Actor, quotation: QuotationDto) {
    if (actor.role === "SALES_REP") requireOwnResource(actor, quotation.salesRep.id);
  }

  /**
   * Builder mutations (add/remove/quantity/discount) are only valid while the quotation is
   * still a Draft — TAD SS9: "Only the state machine can change lifecycle"; once submitted,
   * commercial terms are frozen into an immutable QuotationVersion (T7.2).
   */
  private async assertOwnedDraft(actor: Actor, id: string) {
    const quotation = await this.getOrThrow(id);
    requireOwnResource(actor, quotation.salesRep.id);
    if (quotation.status !== "DRAFT") {
      throw new ServiceError(
        "INVALID_STATE_TRANSITION",
        "Only a Draft quotation's lines and discounts can be edited",
        { id, status: quotation.status },
      );
    }
  }
}
