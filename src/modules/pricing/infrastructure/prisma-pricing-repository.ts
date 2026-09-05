import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import type { PricingRepository } from "../application/ports";
import type { PriceListDto } from "../application/types";
import type { CreatePriceListInput, PriceListQuery } from "../schemas/price-list";

const priceListInclude = {
  tier: { select: { id: true, name: true } },
  items: {
    include: { product: { select: { name: true } } },
    orderBy: [{ productId: "asc" }, { variantId: "asc" }],
  },
} satisfies Prisma.PriceListInclude;

type PriceListRecord = Prisma.PriceListGetPayload<{ include: typeof priceListInclude }>;

function priceListDto(priceList: PriceListRecord): PriceListDto {
  return {
    id: priceList.id,
    name: priceList.name,
    tier: priceList.tier,
    currency: priceList.currency,
    isActive: priceList.isActive,
    items: priceList.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      variantId: item.variantId,
      unitPrice: item.unitPrice.toFixed(2),
    })),
    createdAt: priceList.createdAt.toISOString(),
    updatedAt: priceList.updatedAt.toISOString(),
  };
}

function ruleScope(productId: string, variantId: string | null) {
  return `${productId}:${variantId ?? "product"}`;
}

export class PrismaPricingRepository implements PricingRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: PriceListQuery) {
    return (
      await this.db.priceList.findMany({
        where: { tierId: query.tierId, currency: query.currency, isActive: query.active },
        include: priceListInclude,
        orderBy: [{ currency: "asc" }, { name: "asc" }],
      })
    ).map(priceListDto);
  }

  async save(input: CreatePriceListInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        const tier = await tx.customerTier.findUnique({ where: { id: input.tierId }, select: { id: true } });
        if (!tier) throw new ServiceError("NOT_FOUND", "Customer tier not found", { id: input.tierId });

        const products = await tx.product.findMany({
          where: { id: { in: [...new Set(input.items.map((item) => item.productId))] } },
          select: { id: true },
        });
        if (products.length !== new Set(input.items.map((item) => item.productId)).size) {
          throw new ServiceError("NOT_FOUND", "One or more price-list products do not exist");
        }

        const variantIds = input.items.flatMap((item) => (item.variantId ? [item.variantId] : []));
        if (variantIds.length) {
          const variants = await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, productId: true },
          });
          const variantProducts = new Map(variants.map((variant) => [variant.id, variant.productId]));
          const mismatch = input.items.find(
            (item) => item.variantId && variantProducts.get(item.variantId) !== item.productId,
          );
          if (mismatch) {
            throw new ServiceError("VALIDATION_ERROR", "A variant does not belong to its price-rule product", {
              productId: mismatch.productId,
              variantId: mismatch.variantId,
            });
          }
        }

        const existing = await tx.priceList.findUnique({
          where: { tierId_currency: { tierId: input.tierId, currency: input.currency } },
          include: { items: { select: { productId: true, variantId: true } } },
        });

        if (existing) {
          const existingScopes = new Set(existing.items.map((item) => ruleScope(item.productId, item.variantId)));
          const overlap = input.items.find((item) => existingScopes.has(ruleScope(item.productId, item.variantId)));
          if (overlap) {
            throw new ServiceError(
              "CONFIGURATION_CONFLICT",
              "An overlapping price-list rule already exists for this tier, currency, product, and variant scope",
              { tierId: input.tierId, currency: input.currency, productId: overlap.productId, variantId: overlap.variantId },
            );
          }

          return priceListDto(
            await tx.priceList.update({
              where: { id: existing.id },
              data: {
                name: input.name,
                isActive: input.isActive,
                items: { create: input.items },
              },
              include: priceListInclude,
            }),
          );
        }

        return priceListDto(
          await tx.priceList.create({
            data: {
              name: input.name,
              tierId: input.tierId,
              currency: input.currency,
              isActive: input.isActive,
              items: { create: input.items },
            },
            include: priceListInclude,
          }),
        );
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ServiceError("CONFIGURATION_CONFLICT", "Overlapping price-list configuration", {
          target: error.meta?.target,
        });
      }
      throw error;
    }
  }

  async resolvePrice(customerTierId: string, productId: string, variantId: string | null, currency: string) {
    const product = await this.db.product.findUnique({
      where: { id: productId },
      select: { isActive: true },
    });
    if (!product?.isActive) return null;

    const variant = variantId
      ? await this.db.productVariant.findFirst({
          where: { id: variantId, productId, isActive: true },
          select: { id: true, extraPrice: true },
        })
      : null;
    if (variantId && !variant) return null;

    const priceList = await this.db.priceList.findUnique({
      where: { tierId_currency: { tierId: customerTierId, currency } },
      select: {
        id: true,
        isActive: true,
        items: {
          where: { productId, OR: [{ variantId }, { variantId: null }] },
          select: { variantId: true, unitPrice: true },
        },
      },
    });
    if (!priceList?.isActive) return null;

    const exactRule = variantId ? priceList.items.find((item) => item.variantId === variantId) : undefined;
    const productRule = priceList.items.find((item) => item.variantId === null);
    const rule = exactRule ?? productRule;
    if (!rule) return null;

    const extraPrice = variant?.extraPrice ?? new Prisma.Decimal(0);
    const resolved = rule.unitPrice.plus(extraPrice);
    return {
      priceListId: priceList.id,
      customerTierId,
      productId,
      variantId,
      currency,
      baseUnitPrice: rule.unitPrice.toFixed(2),
      variantExtraPrice: extraPrice.toFixed(2),
      unitPrice: resolved.toFixed(2),
      matchedRule: exactRule ? ("VARIANT" as const) : ("PRODUCT" as const),
    };
  }
}
