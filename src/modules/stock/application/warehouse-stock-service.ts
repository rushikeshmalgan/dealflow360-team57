import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type {
  CreateWarehouseStockInput,
  ImportWarehouseStockInput,
  UpdateWarehouseStockInput,
  WarehouseStockQuery,
} from "../schemas/warehouse-stock";
import type { WarehouseStockRepository } from "./ports";

export class WarehouseStockService {
  constructor(private readonly repository: WarehouseStockRepository) {}

  list(actor: Actor | null, query: WarehouseStockQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const stock = await this.repository.get(id);
    if (!stock) throw new ServiceError("NOT_FOUND", "Warehouse stock not found", { id });
    return stock;
  }

  create(actor: Actor | null, input: CreateWarehouseStockInput) {
    requireAdmin(actor);
    return this.repository.create(input);
  }

  async update(actor: Actor | null, id: string, input: UpdateWarehouseStockInput) {
    requireAdmin(actor);
    const stock = await this.repository.update(id, input);
    if (!stock) throw new ServiceError("NOT_FOUND", "Warehouse stock not found", { id });
    return stock;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Warehouse stock not found", { id });
    }
  }

  import(actor: Actor | null, input: ImportWarehouseStockInput) {
    requireAdmin(actor);
    return this.repository.import(input);
  }
}
