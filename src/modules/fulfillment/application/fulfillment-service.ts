import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireInternal } from "@/modules/shared/domain/actor";

import type { OverrideSplitInput } from "../schemas/fulfillment";
import type { FulfillmentRepository } from "./ports";

/**
 * No dedicated "Warehouse/Ops" role exists in the Prisma `Role` enum (ADMIN, SALES_REP,
 * MANAGER, FINANCE_OPS, CUSTOMER) even though docs/ORDERS_FLOW.md's actor table lists
 * Warehouse/Ops as a distinct actor scoped to Fulfillment only. Inventing a new role would be a
 * schema change well outside this feature's scope, so every method here uses the same
 * `requireInternal` gate the sibling `warehouseStockService`/`warehouseService` already use for
 * their own view methods (src/modules/stock, src/modules/warehouse) — any non-CUSTOMER actor.
 */
export class FulfillmentService {
  constructor(private readonly repository: FulfillmentRepository) {}

  list(actor: Actor | null) {
    requireInternal(actor);
    return this.repository.listOrders();
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const order = await this.repository.getOrder(id);
    if (!order) throw new ServiceError("NOT_FOUND", "Order not found", { id });
    return order;
  }

  acceptSuggestedSplit(actor: Actor | null, id: string) {
    requireInternal(actor);
    return this.repository.acceptSuggestedSplit(id, actor);
  }

  overrideSplit(actor: Actor | null, id: string, input: OverrideSplitInput) {
    requireInternal(actor);
    return this.repository.overrideSplit(id, input, actor);
  }

  markShipped(actor: Actor | null, id: string) {
    requireInternal(actor);
    return this.repository.markShipped(id, actor);
  }
}
