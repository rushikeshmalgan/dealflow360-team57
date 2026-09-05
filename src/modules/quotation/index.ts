import { QuotationService } from "./application/quotation-service";
import { PrismaQuotationRepository } from "./infrastructure/prisma-quotation-repository";

export const quotationService = new QuotationService(new PrismaQuotationRepository());

export { QuotationService } from "./application/quotation-service";
export type { QuotationDto, QuotationLineDto, QuotationSummaryDto } from "./application/types";
