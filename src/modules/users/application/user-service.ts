import { hashPassword } from "@/lib/auth/password";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireAdmin } from "@/modules/shared/domain/actor";

import type { CreateUserInput, UpdateUserInput } from "../schemas/user";
import type { UserRepository } from "./ports";

/**
 * ADMIN-only account management — "admin can add role-based login." Every method requires an
 * ADMIN actor; the self-service CUSTOMER signup path lives entirely in src/lib/auth/login.ts and
 * never touches this service.
 */
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  list(actor: Actor | null) {
    requireAdmin(actor);
    return this.repository.list();
  }

  async create(actor: Actor | null, input: CreateUserInput) {
    requireAdmin(actor);
    const passwordHash = await hashPassword(input.password);
    return this.repository.create(input, passwordHash);
  }

  async update(actor: Actor | null, id: string, input: UpdateUserInput) {
    requireAdmin(actor);
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    const user = await this.repository.update(id, input, passwordHash);
    if (!user) throw new ServiceError("NOT_FOUND", "User not found", { id });
    return user;
  }

  async delete(actor: Actor | null, id: string) {
    requireAdmin(actor);
    if (actor && actor.id === id) {
      throw new ServiceError("VALIDATION_ERROR", "You cannot deactivate your own account");
    }
    if (!(await this.repository.delete(id))) {
      throw new ServiceError("NOT_FOUND", "User not found", { id });
    }
  }
}
