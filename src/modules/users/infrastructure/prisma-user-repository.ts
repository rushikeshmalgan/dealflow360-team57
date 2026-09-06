import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type { UserRepository } from "../application/ports";
import type { UserDto } from "../application/types";
import type { CreateUserInput, UpdateUserInput } from "../schemas/user";

function userDto(user: {
  id: string;
  email: string;
  role: UserDto["role"];
  customerId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    customerId: user.customerId,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "A user with this email already exists", {
        target: error.meta?.target,
      });
    }
    if (error.code === "P2025") throw new ServiceError("NOT_FOUND", "User not found");
  }
  throw error;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list() {
    return (await this.db.user.findMany({ orderBy: { createdAt: "asc" } })).map(userDto);
  }

  async get(id: string) {
    const user = await this.db.user.findUnique({ where: { id } });
    return user ? userDto(user) : null;
  }

  async create(input: CreateUserInput, passwordHash: string) {
    try {
      return userDto(
        await this.db.user.create({
          data: {
            email: input.email,
            passwordHash,
            role: input.role,
            customerId: input.role === "CUSTOMER" ? (input.customerId ?? null) : null,
          },
        }),
      );
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateUserInput, passwordHash?: string) {
    try {
      return userDto(
        await this.db.user.update({
          where: { id },
          data: {
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
            ...(passwordHash !== undefined ? { passwordHash } : {}),
          },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      translateWriteError(error);
    }
  }

  /** Soft-delete only: Users are referenced (Restrict FK) by quotations/approvals/audit logs
   * across the app, so a hard delete would fail for any account that ever did anything. */
  async delete(id: string) {
    try {
      await this.db.user.update({ where: { id }, data: { isActive: false } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }
}
