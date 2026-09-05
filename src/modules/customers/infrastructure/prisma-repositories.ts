import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type { CustomerRepository, TierRepository } from "../application/ports";
import type { CustomerDto, TierDto } from "../application/types";
import type { CreateCustomerInput, UpdateCustomerInput } from "../schemas/customer";
import type { CreateTierInput, UpdateTierInput } from "../schemas/tier";

function tierDto(tier: { id: string; name: string; createdAt: Date; updatedAt: Date }): TierDto {
  return { ...tier, createdAt: tier.createdAt.toISOString(), updatedAt: tier.updatedAt.toISOString() };
}

function customerDto(customer: {
  id: string;
  name: string;
  primaryContactEmail: string | null;
  tier: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}): CustomerDto {
  return {
    ...customer,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "Customer tier name must be unique", {
        target: error.meta?.target,
      });
    }
    if (error.code === "P2003") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "The record is referenced by other data");
    }
    if (error.code === "P2025") throw new ServiceError("NOT_FOUND", "Customer record not found");
  }
  throw error;
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list() {
    return (
      await this.db.customer.findMany({
        include: { tier: { select: { id: true, name: true } } },
        orderBy: { name: "asc" },
      })
    ).map(customerDto);
  }

  async get(id: string) {
    const customer = await this.db.customer.findUnique({
      where: { id },
      include: { tier: { select: { id: true, name: true } } },
    });
    return customer ? customerDto(customer) : null;
  }

  async create(input: CreateCustomerInput) {
    try {
      return customerDto(
        await this.db.customer.create({
          data: { ...input, primaryContactEmail: input.primaryContactEmail ?? null },
          include: { tier: { select: { id: true, name: true } } },
        }),
      );
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateCustomerInput) {
    try {
      return customerDto(
        await this.db.customer.update({
          where: { id },
          data: input,
          include: { tier: { select: { id: true, name: true } } },
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      translateWriteError(error);
    }
  }

  async delete(id: string) {
    try {
      await this.db.customer.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }
}

export class PrismaTierRepository implements TierRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list() {
    return (await this.db.customerTier.findMany({ orderBy: { name: "asc" } })).map(tierDto);
  }

  async get(id: string) {
    const tier = await this.db.customerTier.findUnique({ where: { id } });
    return tier ? tierDto(tier) : null;
  }

  async create(input: CreateTierInput) {
    try {
      return tierDto(await this.db.customerTier.create({ data: input }));
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateTierInput) {
    try {
      return tierDto(await this.db.customerTier.update({ where: { id }, data: input }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      translateWriteError(error);
    }
  }

  async delete(id: string) {
    try {
      await this.db.customerTier.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }
}
