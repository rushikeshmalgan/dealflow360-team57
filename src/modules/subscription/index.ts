import { PlanService } from "./application/plan-service";
import { SubscriptionService } from "./application/subscription-service";
import { PrismaPlanRepository } from "./infrastructure/prisma-plan-repository";
import { PrismaSubscriptionRepository } from "./infrastructure/prisma-subscription-repository";

const prismaPlanRepository = new PrismaPlanRepository();
const prismaSubscriptionRepository = new PrismaSubscriptionRepository();

export const planService = new PlanService(prismaPlanRepository);
export const subscriptionService = new SubscriptionService(
  prismaSubscriptionRepository,
  prismaPlanRepository,
);

export { PlanService } from "./application/plan-service";
export { SubscriptionService } from "./application/subscription-service";
export { PrismaPlanRepository } from "./infrastructure/prisma-plan-repository";
export { PrismaSubscriptionRepository } from "./infrastructure/prisma-subscription-repository";
export * from "./application/ports";
export * from "./application/types";
export * from "./domain/cadence";
export * from "./domain/cancellation";
export * from "./domain/proration";
export * from "./schemas/plan";
export * from "./schemas/subscription";
