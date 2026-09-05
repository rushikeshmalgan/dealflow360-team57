import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type { CreateCategoryInput, UpdateCategoryInput } from "../schemas/category";
import type { CreateProductInput, ProductListQuery, UpdateProductInput } from "../schemas/product";
import type { CategoryRepository, ProductRepository } from "../application/ports";
import type { CategoryDto, ProductDto } from "../application/types";

const productInclude = {
  category: { select: { id: true, name: true } },
  variants: { orderBy: [{ attribute: "asc" }, { value: "asc" }] },
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function categoryDto(category: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CategoryDto {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function productDto(product: ProductRecord): ProductDto {
  return {
    id: product.id,
    category: product.category,
    sku: product.sku,
    name: product.name,
    price: product.price.toFixed(2),
    unit: product.unit,
    taxPct: product.taxPct.toString(),
    description: product.description,
    isSubscription: product.isSubscription,
    recurringCycle: product.recurringCycle,
    isActive: product.isActive,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      attribute: variant.attribute,
      value: variant.value,
      extraPrice: variant.extraPrice.toFixed(2),
      sku: variant.sku,
      isActive: variant.isActive,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "A unique catalog value is already in use", {
        target: error.meta?.target,
      });
    }
    if (error.code === "P2003") {
      throw new ServiceError("CONFIGURATION_CONFLICT", "The record is referenced by other configuration");
    }
    if (error.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "The requested catalog record was not found");
    }
  }
  throw error;
}

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list() {
    return (await this.db.productCategory.findMany({ orderBy: { name: "asc" } })).map(categoryDto);
  }

  async get(id: string) {
    const category = await this.db.productCategory.findUnique({ where: { id } });
    return category ? categoryDto(category) : null;
  }

  async create(input: CreateCategoryInput) {
    try {
      return categoryDto(await this.db.productCategory.create({ data: input }));
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateCategoryInput) {
    try {
      return categoryDto(await this.db.productCategory.update({ where: { id }, data: input }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      translateWriteError(error);
    }
  }

  async delete(id: string) {
    try {
      await this.db.productCategory.delete({ where: { id } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }
}

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: ProductListQuery) {
    const products = await this.db.product.findMany({
      where: { isActive: query.active, categoryId: query.categoryId },
      include: productInclude,
      orderBy: { name: "asc" },
    });
    return products.map(productDto);
  }

  async get(id: string) {
    const product = await this.db.product.findUnique({ where: { id }, include: productInclude });
    return product ? productDto(product) : null;
  }

  async create(input: CreateProductInput) {
    const { variants, ...product } = input;
    try {
      return productDto(
        await this.db.product.create({
          data: {
            ...product,
            description: product.description ?? null,
            recurringCycle: product.recurringCycle ?? null,
            variants: { create: variants.map((variant) => ({ ...variant, sku: variant.sku ?? null })) },
          },
          include: productInclude,
        }),
      );
    } catch (error) {
      translateWriteError(error);
    }
  }

  async update(id: string, input: UpdateProductInput) {
    const { variants, ...product } = input;
    try {
      return await this.db.$transaction(async (tx) => {
        if (variants) {
          await tx.productVariant.deleteMany({ where: { productId: id } });
        }
        const updated = await tx.product.update({
          where: { id },
          data: {
            ...product,
            ...(product.isSubscription === false ? { recurringCycle: null } : {}),
            ...(variants
              ? { variants: { create: variants.map((variant) => ({ ...variant, sku: variant.sku ?? null })) } }
              : {}),
          },
          include: productInclude,
        });
        return productDto(updated);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      translateWriteError(error);
    }
  }

  async delete(id: string) {
    try {
      // Retire products instead of breaking references from historical quotes.
      await this.db.product.update({ where: { id }, data: { isActive: false } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return false;
      translateWriteError(error);
    }
  }
}
