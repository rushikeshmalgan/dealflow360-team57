/**
 * Seed script for local/dev database bootstrap.
 * Creates a realistic catalog/customer/pricing/governance dataset plus the 5 role-based demo
 * accounts, so the quotation -> approval -> negotiation -> fulfillment loop has enough real
 * variety to click through end to end.
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

/** Fixed ids (must be version-4-shaped UUIDs — this app's zod schemas reject a nil id) so
 * reseeding stays idempotent instead of piling up duplicate rows on every run. */
const GOLD_CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_IDS = {
  acme: GOLD_CUSTOMER_ID,
  meridian: "11111111-1111-4111-8111-111111111112",
  blueHarbor: "11111111-1111-4111-8111-111111111121",
  crestview: "11111111-1111-4111-8111-111111111122",
  sunrise: "11111111-1111-4111-8111-111111111131",
  pinecrest: "11111111-1111-4111-8111-111111111132",
};

type ProductSeed = {
  sku: string;
  name: string;
  category: "Hardware" | "Networking" | "Software" | "Services";
  price: number;
  costPrice: number;
  unit: string;
  taxPct: number;
  description: string;
  isSubscription?: boolean;
  recurringCycle?: "MONTHLY" | "QUARTERLY" | "YEARLY";
  stocked?: boolean;
};

const PRODUCTS: ProductSeed[] = [
  { sku: "HW-LAPTOP-PRO", name: 'Enterprise Pro Laptop 16"', category: "Hardware", price: 1800, costPrice: 1200, unit: "unit", taxPct: 0.0825, description: "16-inch Core i9, 32GB RAM, high-performance laptop", stocked: true },
  { sku: "HW-LAPTOP-STD", name: 'Business Laptop 14"', category: "Hardware", price: 1100, costPrice: 750, unit: "unit", taxPct: 0.0825, description: "14-inch Core i5, 16GB RAM, everyday business laptop", stocked: true },
  { sku: "HW-MONITOR-27", name: '27" 4K Monitor', category: "Hardware", price: 450, costPrice: 280, unit: "unit", taxPct: 0.0825, description: "27-inch 4K IPS display with USB-C", stocked: true },
  { sku: "HW-DOCK-USBC", name: "USB-C Docking Station", category: "Hardware", price: 180, costPrice: 95, unit: "unit", taxPct: 0.0825, description: "Universal USB-C dock, dual 4K output", stocked: true },
  { sku: "NW-SWITCH-24P", name: "24-Port Managed Switch", category: "Networking", price: 650, costPrice: 400, unit: "unit", taxPct: 0.0825, description: "Layer 2/3 managed Gigabit switch, 24 ports", stocked: true },
  { sku: "NW-ROUTER-ENT", name: "Enterprise Router", category: "Networking", price: 1200, costPrice: 800, unit: "unit", taxPct: 0.0825, description: "Multi-WAN enterprise router with VPN", stocked: true },
  { sku: "NW-AP-WIFI6", name: "Wi-Fi 6 Access Point", category: "Networking", price: 220, costPrice: 130, unit: "unit", taxPct: 0.0825, description: "Wi-Fi 6 access point, PoE powered", stocked: true },
  { sku: "SW-CLOUD-SEC", name: "Cloud Security Suite", category: "Software", price: 49, costPrice: 8, unit: "seat", taxPct: 0, description: "Monthly per-seat enterprise cloud security suite", isSubscription: true, recurringCycle: "MONTHLY" },
  { sku: "SW-CRM-PRO", name: "CRM Professional", category: "Software", price: 79, costPrice: 12, unit: "seat", taxPct: 0, description: "Monthly per-seat CRM with pipeline automation", isSubscription: true, recurringCycle: "MONTHLY" },
  { sku: "SW-OFFICE-STE", name: "Productivity Suite License", category: "Software", price: 299, costPrice: 40, unit: "license", taxPct: 0, description: "Perpetual productivity suite license" },
  { sku: "SVC-IMPL-STD", name: "Standard Implementation Package", category: "Services", price: 2500, costPrice: 1500, unit: "package", taxPct: 0, description: "Standard onboarding and implementation package" },
  { sku: "SVC-TRAIN-DAY", name: "On-site Training (Per Day)", category: "Services", price: 1200, costPrice: 700, unit: "day", taxPct: 0, description: "On-site end-user training, billed per day" },
  { sku: "SVC-SUPPORT-GOLD", name: "Premium Support Plan", category: "Services", price: 99, costPrice: 20, unit: "seat", taxPct: 0, description: "Monthly premium support plan with SLA", isSubscription: true, recurringCycle: "MONTHLY" },
];

type CustomerSeed = { id: string; name: string; tier: "Bronze" | "Silver" | "Gold"; email: string };

const CUSTOMERS: CustomerSeed[] = [
  { id: CUSTOMER_IDS.acme, name: "Acme Industrial Corp", tier: "Gold", email: "customer@user.gmail.com" },
  { id: CUSTOMER_IDS.meridian, name: "Meridian Manufacturing Co.", tier: "Gold", email: "procurement@meridianmfg.example.com" },
  { id: CUSTOMER_IDS.blueHarbor, name: "Blue Harbor Logistics", tier: "Silver", email: "purchasing@blueharborlogistics.example.com" },
  { id: CUSTOMER_IDS.crestview, name: "Crestview Retail Group", tier: "Silver", email: "it@crestviewretail.example.com" },
  { id: CUSTOMER_IDS.sunrise, name: "Sunrise Bakery Co.", tier: "Bronze", email: "ops@sunrisebakery.example.com" },
  { id: CUSTOMER_IDS.pinecrest, name: "Pinecrest Consulting", tier: "Bronze", email: "admin@pinecrestconsulting.example.com" },
];

/** Tiers get their own price list, priced as a percentage of catalog list price — the
 * mechanism by which "Gold" customers see lower prices than "Bronze" before any negotiated
 * line/order discount is ever applied on top. */
const TIER_PRICE_FACTOR: Record<CustomerSeed["tier"], number> = {
  Bronze: 1.0,
  Silver: 0.95,
  Gold: 0.9,
};

/** Tier discount ceilings (DiscountRuleScope.TIER) — the max negotiated discount before a
 * quotation is flagged by the risk engine. */
const TIER_CEILING_PCT: Record<CustomerSeed["tier"], number> = {
  Bronze: 10,
  Silver: 15,
  Gold: 20,
};

async function main() {
  // 1. Customer Tiers
  const tiers = Object.fromEntries(
    await Promise.all(
      (["Bronze", "Silver", "Gold"] as const).map(async (name) => [
        name,
        await prisma.customerTier.upsert({ where: { name }, update: {}, create: { name } }),
      ]),
    ),
  ) as Record<CustomerSeed["tier"], { id: string }>;

  // 2. Product Categories
  const categoryNames = ["Hardware", "Networking", "Software", "Services"] as const;
  const categoryDescriptions: Record<(typeof categoryNames)[number], string> = {
    Hardware: "Laptops, monitors, and workstation peripherals",
    Networking: "Switches, routers, and wireless infrastructure",
    Software: "Enterprise SaaS and software licenses",
    Services: "Implementation, training, and support services",
  };
  const categories = Object.fromEntries(
    await Promise.all(
      categoryNames.map(async (name) => [
        name,
        await prisma.productCategory.upsert({
          where: { name },
          update: {},
          create: { name, description: categoryDescriptions[name] },
        }),
      ]),
    ),
  ) as Record<ProductSeed["category"], { id: string }>;

  // 3. Products
  const products = Object.fromEntries(
    await Promise.all(
      PRODUCTS.map(async (p) => [
        p.sku,
        await prisma.product.upsert({
          where: { sku: p.sku },
          update: {
            name: p.name,
            price: p.price,
            costPrice: p.costPrice,
            unit: p.unit,
            taxPct: p.taxPct,
            description: p.description,
            isSubscription: p.isSubscription ?? false,
            recurringCycle: p.recurringCycle ?? null,
            categoryId: categories[p.category].id,
          },
          create: {
            sku: p.sku,
            name: p.name,
            price: p.price,
            costPrice: p.costPrice,
            unit: p.unit,
            taxPct: p.taxPct,
            description: p.description,
            isSubscription: p.isSubscription ?? false,
            recurringCycle: p.recurringCycle ?? null,
            categoryId: categories[p.category].id,
          },
        }),
      ]),
    ),
  ) as Record<string, { id: string }>;

  // 4. Warehouses A, B, and C (TAD §48 demo fixture)
  const [whA, whB, whC] = await Promise.all([
    prisma.warehouse.upsert({
      where: { name: "Warehouse A (Primary Hub)" },
      update: {},
      create: { name: "Warehouse A (Primary Hub)", shippingCostWeight: 1.0, replenishmentRule: { reorderThreshold: 15, targetStock: 60 }, isActive: true },
    }),
    prisma.warehouse.upsert({
      where: { name: "Warehouse B (West Coast)" },
      update: {},
      create: { name: "Warehouse B (West Coast)", shippingCostWeight: 1.25, replenishmentRule: { reorderThreshold: 10, targetStock: 40 }, isActive: true },
    }),
    prisma.warehouse.upsert({
      where: { name: "Warehouse C (East Coast)" },
      update: {},
      create: { name: "Warehouse C (East Coast)", shippingCostWeight: 1.5, replenishmentRule: { reorderThreshold: 5, targetStock: 25 }, isActive: true },
    }),
  ]);

  // 5. Warehouse stock for every physical (non-subscription, non-service) product, split
  // unevenly across the three warehouses so the allocation engine has real splits to compute.
  const stockedProducts = PRODUCTS.filter((p) => p.stocked);
  const stockLevels: [number, number, number][] = [
    [45, 30, 12],
    [25, 20, 8],
    [60, 15, 20],
    [80, 40, 30],
    [18, 22, 10],
    [12, 8, 5],
    [50, 35, 15],
  ];
  await Promise.all(
    stockedProducts.map((p, i) => {
      const [a, b, c] = stockLevels[i % stockLevels.length];
      return Promise.all([
        prisma.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: whA.id, productId: products[p.sku].id } },
          update: {},
          create: { warehouseId: whA.id, productId: products[p.sku].id, availableQty: a, reservedQty: 0 },
        }),
        prisma.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: whB.id, productId: products[p.sku].id } },
          update: {},
          create: { warehouseId: whB.id, productId: products[p.sku].id, availableQty: b, reservedQty: 0 },
        }),
        prisma.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: whC.id, productId: products[p.sku].id } },
          update: {},
          create: { warehouseId: whC.id, productId: products[p.sku].id, availableQty: c, reservedQty: 0 },
        }),
      ]);
    }),
  );

  // 6. One price list per tier, covering every product in the catalog (so "Add Line" always
  // has a resolvable price no matter which product a rep picks), priced at a tier-specific
  // percentage of catalog list price.
  await Promise.all(
    (["Bronze", "Silver", "Gold"] as const).map(async (tierName) => {
      const priceList = await prisma.priceList.upsert({
        where: { tierId_currency: { tierId: tiers[tierName].id, currency: "USD" } },
        update: { name: `${tierName} USD`, isActive: true },
        create: { name: `${tierName} USD`, tierId: tiers[tierName].id, currency: "USD", isActive: true },
      });
      // Prisma's compound-unique input for [priceListId, productId, variantId] requires a
      // non-null variantId (Postgres NULLs never compare equal for uniqueness purposes anyway),
      // so a plain upsert can't target the variantId-null row — look it up manually instead.
      await Promise.all(
        PRODUCTS.map(async (p) => {
          const unitPrice = Math.round(p.price * TIER_PRICE_FACTOR[tierName] * 100) / 100;
          const existingItem = await prisma.priceListItem.findFirst({
            where: { priceListId: priceList.id, productId: products[p.sku].id, variantId: null },
            select: { id: true },
          });
          if (existingItem) {
            await prisma.priceListItem.update({ where: { id: existingItem.id }, data: { unitPrice } });
          } else {
            await prisma.priceListItem.create({
              data: { priceListId: priceList.id, productId: products[p.sku].id, unitPrice },
            });
          }
        }),
      );
    }),
  );

  // 7. Discount rules — one tier ceiling per tier, plus a Services category ceiling that wins
  // whenever it's lower than the tier ceiling (TAD SS10: "lower ceiling wins when both exist").
  // discount_rules.max_discount_pct is stored as a 0-1 fraction (DB check constraint
  // discount_rules_max_discount_pct_range), matching the app's own toFraction() convention
  // (src/modules/discount-risk/infrastructure/prisma-discount-rule-repository.ts) — never the
  // 0-100 percentage the UI/API layer works in. There's also at most one *active* TIER/CATEGORY
  // rule enforced by a partial unique index, so this looks up any existing active rule for the
  // scope instead of a blind upsert-by-id, which would collide with one created via the UI.
  async function upsertActiveDiscountRule(
    where: { scope: "TIER"; tierId: string } | { scope: "CATEGORY"; categoryId: string },
    maxDiscountPct: number,
  ) {
    const existing = await prisma.discountRule.findFirst({ where: { ...where, isActive: true } });
    if (existing) {
      await prisma.discountRule.update({ where: { id: existing.id }, data: { maxDiscountPct } });
    } else {
      await prisma.discountRule.create({ data: { ...where, maxDiscountPct, isActive: true } });
    }
  }
  await Promise.all([
    ...(["Bronze", "Silver", "Gold"] as const).map((tierName) =>
      upsertActiveDiscountRule({ scope: "TIER", tierId: tiers[tierName].id }, TIER_CEILING_PCT[tierName] / 100),
    ),
    upsertActiveDiscountRule({ scope: "CATEGORY", categoryId: categories.Services.id }, 0.12),
  ]);

  // 8. Approval rules — MEDIUM risk routes to Manager, HIGH risk routes to Manager then
  // Finance Ops (TAD SS11's manager-before-finance chain).
  await Promise.all([
    prisma.approvalRule.upsert({
      where: { riskBand: "MEDIUM" },
      update: { isActive: true },
      create: {
        riskBand: "MEDIUM",
        isActive: true,
        steps: { create: [{ stepOrder: 1, role: "MANAGER" }] },
      },
    }),
    prisma.approvalRule.upsert({
      where: { riskBand: "HIGH" },
      update: { isActive: true },
      create: {
        riskBand: "HIGH",
        isActive: true,
        steps: {
          create: [
            { stepOrder: 1, role: "MANAGER" },
            { stepOrder: 2, role: "FINANCE_OPS" },
          ],
        },
      },
    }),
  ]);

  // 9. Customers, one CUSTOMER-role login linked to the first Gold account (Acme).
  await Promise.all(
    CUSTOMERS.map((c) =>
      prisma.customer.upsert({
        where: { id: c.id },
        update: { name: c.name, tierId: tiers[c.tier].id, primaryContactEmail: c.email },
        create: { id: c.id, name: c.name, tierId: tiers[c.tier].id, primaryContactEmail: c.email },
      }),
    ),
  );

  // 10. Five demo role accounts (admin/sales/manager/finance/customer@user.gmail.com).
  for (const account of DEMO_ACCOUNTS) {
    const passwordHash = await hashPassword(account.password);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {
        passwordHash,
        role: account.role,
        isActive: true,
        customerId: account.role === "CUSTOMER" ? GOLD_CUSTOMER_ID : null,
      },
      create: {
        email: account.email,
        passwordHash,
        role: account.role,
        customerId: account.role === "CUSTOMER" ? GOLD_CUSTOMER_ID : null,
      },
    });
  }

  console.log(`Seeded ${PRODUCTS.length} products across ${categoryNames.length} categories, ${CUSTOMERS.length} customers across 3 tiers, 3 price lists, discount + approval rules, and warehouse stock.`);
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
