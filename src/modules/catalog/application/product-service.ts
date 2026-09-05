import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreateProductInput, ProductListQuery, UpdateProductInput } from "../schemas/product";
import type { ProductRepository } from "./ports";

export class ProductService {
  constructor(private readonly repository: ProductRepository) {}

  list(actor: Actor | null, query: ProductListQuery = {}) {
    requireInternal(actor);
    return this.repository.list(query);
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const product = await this.repository.get(id);
    if (!product) throw new ServiceError("NOT_FOUND", "Product not found", { id });
    return product;
  }

  create(actor: Actor | null, input: CreateProductInput) {
    requireAdmin(actor);
    return this.repository.create(input);
  }

  async update(actor: Actor | null, id: string, input: UpdateProductInput) {
    requireAdmin(actor);
    const product = await this.repository.update(id, input);
    if (!product) throw new ServiceError("NOT_FOUND", "Product not found", { id });
    return product;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Product not found", { id });
    }
  }
}
