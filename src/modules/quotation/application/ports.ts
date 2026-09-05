import type { Actor } from "@/modules/shared/domain/actor";

import type {
  AddQuotationLineInput,
  CreateQuotationInput,
  PatchQuotationInput,
  QuotationListQuery,
  UpdateQuotationDiscountsInput,
} from "../schemas/quotation";
import type { QuotationApprovalStepDto, QuotationDto, QuotationRiskDto } from "./types";

/** What T7.2's SubmitQuotationUseCase asks the repository to persist, atomically, in one
 * transaction: the frozen version snapshot, the risk evaluation it produced, the approval
 * chain it requires (if any), and the resulting Quotation status/version bump. */
export type SubmitQuotationPersistInput = {
  expectedVersion: number;
  /** Immutable snapshot of the quotation at submit time (TAD SS9 QuotationVersion). */
  payload: unknown;
  payloadHash: string;
  risk: QuotationRiskDto;
  approvalSteps: QuotationApprovalStepDto[];
  finalStatus: "APPROVED" | "PENDING_APPROVAL";
};

export interface QuotationRepository {
  list(query: QuotationListQuery): Promise<QuotationDto[]>;
  get(id: string): Promise<QuotationDto | null>;
  create(input: CreateQuotationInput, actor: Actor): Promise<QuotationDto>;
  addLine(id: string, input: AddQuotationLineInput, actor: Actor): Promise<QuotationDto>;
  patch(id: string, input: PatchQuotationInput, actor: Actor): Promise<QuotationDto>;
  updateDiscounts(
    id: string,
    input: UpdateQuotationDiscountsInput,
    actor: Actor,
  ): Promise<QuotationDto>;
  submit(id: string, input: SubmitQuotationPersistInput, actor: Actor): Promise<QuotationDto>;
}
