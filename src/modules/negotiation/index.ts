import { NegotiationResolutionService } from "./application/negotiation-resolution-service";
import { NegotiationService } from "./application/negotiation-service";
import { PrismaNegotiationRepository } from "./infrastructure/prisma-negotiation-repository";

const sharedRepository = new PrismaNegotiationRepository();

export const negotiationService = new NegotiationService(sharedRepository);
export const negotiationResolutionService = new NegotiationResolutionService(sharedRepository);

export { NegotiationService } from "./application/negotiation-service";
export { NegotiationResolutionService } from "./application/negotiation-resolution-service";
export { negotiateQuotationSchema } from "./schemas/negotiation";
export { resolveNegotiationSchema } from "./schemas/resolve";
export type { NegotiateQuotationInput } from "./schemas/negotiation";
export type { ResolveNegotiationInput } from "./schemas/resolve";
export type { PendingNegotiationDto, ResolveNegotiationResultDto } from "./application/types";
