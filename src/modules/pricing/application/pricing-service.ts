import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreatePriceListInput, PriceListQuery } from "../schemas/price-list";
import type { PricingRepository } from "./ports";

export class PricingService {
  constructor(private readonly repository: PricingRepository) {}

  list(actor: Actor | null, query: PriceListQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  save(actor: Actor | null, input: CreatePriceListInput) {
    requireAdmin(actor);
    return this.repository.save(input);
  }

  /**
   * Canonical price lookup. Quotation code must call this method and must not
   * query price-list tables or reconstruct variant pricing itself.
   */
  async resolvePrice(
    customerTierId: string,
    productId: string,
    variantId: string | null | undefined,
    currency: string,
  ) {
    const normalizedCurrency = currency.trim().toUpperCase();
    const resolved = await this.repository.resolvePrice(
      customerTierId,
      productId,
      variantId ?? null,
      normalizedCurrency,
    );
    if (!resolved) {
      throw new ServiceError("NOT_FOUND", "No active price can be resolved for this selection", {
        customerTierId,
        productId,
        variantId: variantId ?? null,
        currency: normalizedCurrency,
      });
    }
    return resolved;
  }
}
