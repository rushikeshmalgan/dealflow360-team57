import type { SubscriptionCadence } from "../domain/cadence";

export type SubscriptionPlanDto = {
  id: string;
  name: string;
  cadence: SubscriptionCadence;
  productId: string | null;
  product?: {
    id: string;
    sku: string;
    name: string;
    price: string;
  } | null;
  prorationRule: Record<string, unknown>;
  cancellationRule: Record<string, unknown>;
  partialRefundRule: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
