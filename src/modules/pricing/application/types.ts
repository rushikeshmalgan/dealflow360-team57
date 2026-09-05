export type PriceListDto = {
  id: string;
  name: string;
  tier: { id: string; name: string };
  currency: string;
  isActive: boolean;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    variantId: string | null;
    unitPrice: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedPrice = {
  priceListId: string;
  customerTierId: string;
  productId: string;
  variantId: string | null;
  currency: string;
  baseUnitPrice: string;
  variantExtraPrice: string;
  unitPrice: string;
  matchedRule: "VARIANT" | "PRODUCT";
};
