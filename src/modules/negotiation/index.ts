import { NegotiationService } from "./application/negotiation-service";
import { PrismaNegotiationRepository } from "./infrastructure/prisma-negotiation-repository";

export const negotiationService = new NegotiationService(new PrismaNegotiationRepository());

export { NegotiationService } from "./application/negotiation-service";
export { negotiateQuotationSchema } from "./schemas/negotiation";
export type { NegotiateQuotationInput } from "./schemas/negotiation";
