/**
 * Seed skeleton for local/dev database bootstrap.
 * Full demo fixtures (five role accounts, Gold customer, A/B/C warehouses, etc.)
 * are populated in T13.2 per DealFlow360_docs/Feature-ticket-list_PhaseI.md.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Example configuration only. Application code always reads tiers from the
  // database; none of these names have special behavior.
  await Promise.all(
    ["Bronze", "Silver", "Gold"].map((name) =>
      prisma.customerTier.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );
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
