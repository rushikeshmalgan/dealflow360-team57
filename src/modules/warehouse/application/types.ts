export type WarehouseDto = {
  id: string;
  name: string;
  replenishmentRule: Record<string, unknown> | null;
  shippingCostWeight: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
