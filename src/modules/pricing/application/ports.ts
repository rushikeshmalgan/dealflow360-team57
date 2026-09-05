import type { CreatePriceListInput, PriceListQuery } from "../schemas/price-list";
import type { PriceListDto, ResolvedPrice } from "./types";

export interface PricingRepository {
  list(query: PriceListQuery): Promise<PriceListDto[]>;
  save(input: CreatePriceListInput): Promise<PriceListDto>;
  resolvePrice(
    customerTierId: string,
    productId: string,
    variantId: string | null,
    currency: string,
  ): Promise<ResolvedPrice | null>;
}
