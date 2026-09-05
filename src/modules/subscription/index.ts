import { PlanService } from "./application/plan-service";
import { PrismaPlanRepository } from "./infrastructure/prisma-plan-repository";

export const planService = new PlanService(new PrismaPlanRepository());

export { PlanService } from "./application/plan-service";
export { PrismaPlanRepository } from "./infrastructure/prisma-plan-repository";
export * from "./application/ports";
export * from "./application/types";
export * from "./domain/cadence";
export * from "./schemas/plan";
