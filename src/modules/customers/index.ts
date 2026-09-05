import { CustomerService } from "./application/customer-service";
import { TierService } from "./application/tier-service";
import { PrismaCustomerRepository, PrismaTierRepository } from "./infrastructure/prisma-repositories";

export const customerService = new CustomerService(new PrismaCustomerRepository());
export const tierService = new TierService(new PrismaTierRepository());

export { CustomerService } from "./application/customer-service";
export { TierService } from "./application/tier-service";
