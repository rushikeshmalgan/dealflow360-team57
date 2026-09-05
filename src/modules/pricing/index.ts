import { PricingService } from "./application/pricing-service";
import { PrismaPricingRepository } from "./infrastructure/prisma-pricing-repository";

export const pricingService = new PricingService(new PrismaPricingRepository());

export { PricingService } from "./application/pricing-service";
export type { ResolvedPrice } from "./application/types";
