import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreateCategoryInput, UpdateCategoryInput } from "../schemas/category";
import type { CategoryRepository } from "./ports";

export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  list(actor: Actor | null) {
    requireInternal(actor);
    return this.repository.list();
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const category = await this.repository.get(id);
    if (!category) throw new ServiceError("NOT_FOUND", "Category not found", { id });
    return category;
  }

  create(actor: Actor | null, input: CreateCategoryInput) {
    requireAdmin(actor);
    return this.repository.create(input);
  }

  async update(actor: Actor | null, id: string, input: UpdateCategoryInput) {
    requireAdmin(actor);
    const category = await this.repository.update(id, input);
    if (!category) throw new ServiceError("NOT_FOUND", "Category not found", { id });
    return category;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Category not found", { id });
    }
  }
}
