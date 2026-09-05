import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreateWarehouseInput, UpdateWarehouseInput } from "../schemas/warehouse";
import type { WarehouseRepository } from "./ports";

export class WarehouseService {
  constructor(private readonly repository: WarehouseRepository) {}

  list(actor: Actor | null) {
    requireInternal(actor);
    return this.repository.list();
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const warehouse = await this.repository.get(id);
    if (!warehouse) throw new ServiceError("NOT_FOUND", "Warehouse not found", { id });
    return warehouse;
  }

  create(actor: Actor | null, input: CreateWarehouseInput) {
    requireAdmin(actor);
    return this.repository.create(input);
  }

  async update(actor: Actor | null, id: string, input: UpdateWarehouseInput) {
    requireAdmin(actor);
    const warehouse = await this.repository.update(id, input);
    if (!warehouse) throw new ServiceError("NOT_FOUND", "Warehouse not found", { id });
    return warehouse;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Warehouse not found", { id });
    }
  }
}
