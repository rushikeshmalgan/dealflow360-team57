import { FulfillmentService } from "./application/fulfillment-service";
import { PrismaFulfillmentRepository } from "./infrastructure/prisma-fulfillment-repository";

export const fulfillmentService = new FulfillmentService(new PrismaFulfillmentRepository());

export { FulfillmentService } from "./application/fulfillment-service";
export { overrideSplitSchema } from "./schemas/fulfillment";
export type { OverrideSplitInput } from "./schemas/fulfillment";
