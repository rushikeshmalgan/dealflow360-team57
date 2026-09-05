import { DealHealthService } from "./application/deal-health-service";
import { PrismaDealHealthRepository } from "./infrastructure/prisma-deal-health-repository";

export const dealHealthService = new DealHealthService(new PrismaDealHealthRepository());

export { DealHealthService } from "./application/deal-health-service";
export type { DealHealthRepository } from "./application/ports";
export type {
  DealHealthAlertDto,
  DealHealthListQuery,
  DealHealthStatus,
  DealHealthSummaryDto,
  QuotationHealthSnapshot,
} from "./application/types";
export { DEAL_HEALTH_CONFIG_V1 } from "./domain/config";
export {
  DEAL_HEALTH_ALERT_TYPES,
  DEAL_HEALTH_EVALUATE_EVENT,
} from "./domain/types";
export type { DealHealthAlertType, DealHealthSeverity } from "./domain/types";
