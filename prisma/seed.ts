/**
 * Seed skeleton for local/dev database bootstrap.
 * Full demo fixtures (five role accounts, Gold customer, A/B/C warehouses, etc.)
 * are populated in T13.2 per DealFlow360_docs/Feature-ticket-list_PhaseI.md.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Fixed ids so local API testing (e.g. the Postman collection in docs/) can hardcode
 * `x-dev-user-id` without re-reading them from the database after every reseed.
 * These are the ONLY ids the dev-only bypass in src/lib/auth/resolve-actor.ts can ever
 * impersonate with — it looks up the row and trusts its role/customerId, nothing from
 * the request. Real Clerk users are unaffected; this is purely a local testing seam.
 */
const DEV_USERS = [
  { id: "210b50ce-53f1-4762-906e-292cca031b02", clerkUserId: "dev-admin", email: "dev-admin@dealflow360.local", role: "ADMIN" as const },
  { id: "54c4f54f-c413-44c7-98b1-60c0adb9ebef", clerkUserId: "dev-sales-rep", email: "dev-sales-rep@dealflow360.local", role: "SALES_REP" as const },
  { id: "62b0a6e1-07b5-4806-9c3f-42426c32b57a", clerkUserId: "dev-manager", email: "dev-manager@dealflow360.local", role: "MANAGER" as const },
  { id: "b27383ea-84f4-4f95-b2df-7160a08bda1f", clerkUserId: "dev-finance-ops", email: "dev-finance-ops@dealflow360.local", role: "FINANCE_OPS" as const },
];

async function main() {
  // 1. Customer Tiers
  await Promise.all(
    ["Bronze", "Silver", "Gold"].map((name) =>
      prisma.customerTier.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  // 2. Product Categories
  const [hardwareCat, softwareCat, serviceCat] = await Promise.all([
    prisma.productCategory.upsert({
      where: { name: "Hardware" },
      update: {},
      create: { name: "Hardware", description: "Laptops, monitors, and networking equipment" },
    }),
    prisma.productCategory.upsert({
      where: { name: "Software" },
      update: {},
      create: { name: "Software", description: "Enterprise SaaS and software licenses" },
    }),
    prisma.productCategory.upsert({
      where: { name: "Services" },
      update: {},
      create: { name: "Services", description: "Implementation, training, and professional services" },
    }),
  ]);

  // 3. Products
  const [laptopProduct, cloudProduct] = await Promise.all([
    prisma.product.upsert({
      where: { sku: "HW-LAPTOP-01" },
      update: {},
      create: {
        sku: "HW-LAPTOP-01",
        name: "Enterprise Pro Laptop 16\"",
        price: 1800.0,
        unit: "unit",
        taxPct: 0.0825,
        description: "16-inch Core i9 32GB RAM high-performance laptop",
        categoryId: hardwareCat.id,
      },
    }),
    prisma.product.upsert({
      where: { sku: "SW-CLOUD-01" },
      update: {},
      create: {
        sku: "SW-CLOUD-01",
        name: "Cloud Security Suite",
        price: 49.0,
        unit: "seat",
        taxPct: 0.0,
        isSubscription: true,
        recurringCycle: "MONTHLY",
        description: "Monthly per-seat enterprise cloud security suite",
        categoryId: softwareCat.id,
      },
    }),
  ]);

  // 4. Warehouses A, B, and C (TAD §48 demo fixture)
  const [whA, whB, whC] = await Promise.all([
    prisma.warehouse.upsert({
      where: { name: "Warehouse A (Primary Hub)" },
      update: {},
      create: {
        name: "Warehouse A (Primary Hub)",
        shippingCostWeight: 1.0,
        replenishmentRule: { reorderThreshold: 15, targetStock: 60 },
        isActive: true,
      },
    }),
    prisma.warehouse.upsert({
      where: { name: "Warehouse B (West Coast)" },
      update: {},
      create: {
        name: "Warehouse B (West Coast)",
        shippingCostWeight: 1.25,
        replenishmentRule: { reorderThreshold: 10, targetStock: 40 },
        isActive: true,
      },
    }),
    prisma.warehouse.upsert({
      where: { name: "Warehouse C (East Coast)" },
      update: {},
      create: {
        name: "Warehouse C (East Coast)",
        shippingCostWeight: 1.5,
        replenishmentRule: { reorderThreshold: 5, targetStock: 25 },
        isActive: true,
      },
    }),
  ]);

  // 5. Initial Warehouse Stock for Hardware
  await Promise.all([
    prisma.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: whA.id, productId: laptopProduct.id } },
      update: {},
      create: {
        warehouseId: whA.id,
        productId: laptopProduct.id,
        availableQty: 45,
        reservedQty: 5,
      },
    }),
    prisma.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: whB.id, productId: laptopProduct.id } },
      update: {},
      create: {
        warehouseId: whB.id,
        productId: laptopProduct.id,
        availableQty: 30,
        reservedQty: 0,
      },
    }),
    prisma.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: whC.id, productId: laptopProduct.id } },
      update: {},
      create: {
        warehouseId: whC.id,
        productId: laptopProduct.id,
        availableQty: 12,
        reservedQty: 2,
      },
    }),
  ]);

  // 6. Dev-only test users (local API testing bypass, see src/lib/auth/resolve-actor.ts)
  for (const user of DEV_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { clerkUserId: user.clerkUserId, email: user.email, role: user.role, isActive: true },
      create: user,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
