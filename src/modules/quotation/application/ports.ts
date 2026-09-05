import type { Actor } from "@/modules/shared/domain/actor";

import type {
  AddQuotationLineInput,
  CreateQuotationInput,
  PatchQuotationInput,
  QuotationListQuery,
  UpdateQuotationDiscountsInput,
} from "../schemas/quotation";
import type { QuotationDto } from "./types";

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
}
