import type {
  CreateWarehouseStockInput,
  ImportWarehouseStockInput,
  UpdateWarehouseStockInput,
  WarehouseStockQuery,
} from "../schemas/warehouse-stock";
import type { WarehouseStockDto } from "./types";

export interface WarehouseStockRepository {
  list(query: WarehouseStockQuery): Promise<WarehouseStockDto[]>;
  get(id: string): Promise<WarehouseStockDto | null>;
  create(input: CreateWarehouseStockInput): Promise<WarehouseStockDto>;
  update(id: string, input: UpdateWarehouseStockInput): Promise<WarehouseStockDto | null>;
  delete(id: string): Promise<boolean>;
  import(input: ImportWarehouseStockInput): Promise<WarehouseStockDto[]>;
}
