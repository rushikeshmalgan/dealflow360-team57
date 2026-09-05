import type {
  FulfillmentOrderDetailDto,
  FulfillmentOrderListItemDto,
} from "@/modules/fulfillment/application/types";
import type { Actor } from "@/modules/shared/domain/actor";

import type { OverrideSplitInput } from "../schemas/fulfillment";

export interface FulfillmentRepository {
  listOrders(): Promise<FulfillmentOrderListItemDto[]>;

  /** Returns null when the quotation doesn't exist or isn't in a fulfillment-visible status. */
  getOrder(id: string): Promise<FulfillmentOrderDetailDto | null>;

  acceptSuggestedSplit(id: string, actor: Actor): Promise<FulfillmentOrderDetailDto>;

  overrideSplit(
    id: string,
    input: OverrideSplitInput,
    actor: Actor,
  ): Promise<FulfillmentOrderDetailDto>;

  markShipped(id: string, actor: Actor): Promise<FulfillmentOrderDetailDto>;
}
