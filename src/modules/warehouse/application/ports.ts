import type { CreateWarehouseInput, UpdateWarehouseInput } from "../schemas/warehouse";
import type { WarehouseDto } from "./types";

export interface WarehouseRepository {
  list(): Promise<WarehouseDto[]>;
  get(id: string): Promise<WarehouseDto | null>;
  create(input: CreateWarehouseInput): Promise<WarehouseDto>;
  update(id: string, input: UpdateWarehouseInput): Promise<WarehouseDto | null>;
  delete(id: string): Promise<boolean>;
}
