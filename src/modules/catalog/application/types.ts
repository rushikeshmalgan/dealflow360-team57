export type CategoryDto = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductDto = {
  id: string;
  category: { id: string; name: string };
  sku: string;
  name: string;
  price: string;
  /** Cost basis for T6.4's margin calculation; never rendered on customer-facing surfaces. */
  costPrice: string;
  unit: string;
  taxPct: string;
  description: string | null;
  isSubscription: boolean;
  recurringCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  isActive: boolean;
  variants: Array<{
    id: string;
    attribute: string;
    value: string;
    extraPrice: string;
    sku: string | null;
    isActive: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
};
