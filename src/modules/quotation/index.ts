import { approvalRuleService } from "@/modules/approval";
import { discountRuleService } from "@/modules/discount-risk";

import { QuotationService } from "./application/quotation-service";
import { SubmitQuotationUseCase } from "./application/submit-quotation-use-case";
import { PrismaQuotationRepository } from "./infrastructure/prisma-quotation-repository";

const quotationRepository = new PrismaQuotationRepository();

export const quotationService = new QuotationService(quotationRepository);
export const submitQuotationUseCase = new SubmitQuotationUseCase(
  quotationRepository,
  discountRuleService,
  approvalRuleService,
);

export { QuotationService } from "./application/quotation-service";
export { SubmitQuotationUseCase } from "./application/submit-quotation-use-case";
export type {
  QuotationApprovalStepDto,
  QuotationDto,
  QuotationLineDto,
  QuotationRiskDto,
  QuotationStatus,
  QuotationSummaryDto,
  SubmitQuotationResult,
} from "./application/types";
