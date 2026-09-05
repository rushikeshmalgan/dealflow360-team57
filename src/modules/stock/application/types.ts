export type WarehouseStockDto = {
  id: string;
  warehouse: { id: string; name: string };
  product: { id: string; name: string; sku: string };
  availableQty: number;
  reservedQty: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};
