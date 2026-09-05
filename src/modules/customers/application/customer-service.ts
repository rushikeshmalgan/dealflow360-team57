import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin, requireInternal } from "@/modules/shared/domain/actor";

import type { CreateCustomerInput, UpdateCustomerInput } from "../schemas/customer";
import type { CustomerRepository } from "./ports";

export class CustomerService {
  constructor(private readonly repository: CustomerRepository) {}

  list(actor: Actor | null) {
    requireInternal(actor);
    return this.repository.list();
  }

  async get(actor: Actor | null, id: string) {
    requireInternal(actor);
    const customer = await this.repository.get(id);
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", { id });
    return customer;
  }

  create(actor: Actor | null, input: CreateCustomerInput) {
    requireAdmin(actor);
    return this.repository.create(input);
  }

  async update(actor: Actor | null, id: string, input: UpdateCustomerInput) {
    requireAdmin(actor);
    const customer = await this.repository.update(id, input);
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", { id });
    return customer;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "Customer not found", { id });
    }
  }
}
