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
  // Intentionally empty until T13.2 (Seed data & demo fixtures).
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
