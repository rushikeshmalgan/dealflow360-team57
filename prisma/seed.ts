/**
 * Seed script for local/dev database bootstrap.
 * Creates the demo catalog/warehouse fixtures plus the 5 role-based demo accounts.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const scryptAsync = promisify(scrypt);

/** Mirrors src/lib/auth/password.ts's hashPassword (kept standalone so seeding never imports
 * Next.js app code). */
async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Five fixed demo accounts, one per role — `<role>@user.gmail.com` / password `<role>`.
 * Any other email/password typed into /login self-provisions as a brand-new CUSTOMER instead
 * (see src/lib/auth/login.ts); these five are the only accounts seeded up front.
 */
const DEMO_ACCOUNTS = [
  { email: "admin@user.gmail.com", password: "admin", role: "ADMIN" as const },
  { email: "sales@user.gmail.com", password: "sales", role: "SALES_REP" as const },
  { email: "manager@user.gmail.com", password: "manager", role: "MANAGER" as const },
  { email: "finance@user.gmail.com", password: "finance", role: "FINANCE_OPS" as const },
  { email: "customer@user.gmail.com", password: "customer", role: "CUSTOMER" as const },
];

async function main() {
  // 1. Customer Tiers
  const [, , goldTier] = await Promise.all(
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

  // 6. Gold-tier demo customer, linked to the seeded CUSTOMER account below. Fixed id so
  // reseeding stays idempotent; must be a version-4-shaped UUID (RFC 4122) since this app's own
  // zod schemas (z.string().uuid()) reject a nil/all-zero id, unlike Postgres's uuid column.
  const demoCustomer = await prisma.customer.upsert({
    where: { id: "11111111-1111-4111-8111-111111111111" },
    update: {},
    create: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Acme Industrial Corp",
      tierId: goldTier.id,
      primaryContactEmail: "customer@user.gmail.com",
    },
  });

  // 7. Five demo role accounts (admin/sales/manager/finance/customer@user.gmail.com).
  for (const account of DEMO_ACCOUNTS) {
    const passwordHash = await hashPassword(account.password);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {
        passwordHash,
        role: account.role,
        isActive: true,
        customerId: account.role === "CUSTOMER" ? demoCustomer.id : null,
      },
      create: {
        email: account.email,
        passwordHash,
        role: account.role,
        customerId: account.role === "CUSTOMER" ? demoCustomer.id : null,
      },
    });
  }

  console.log("Seeded demo accounts:");
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.email} / ${account.password}  (${account.role})`);
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
