import { describe, expect, it, beforeEach } from "vitest";

import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import { PlanService } from "../application/plan-service";
import type { PlanRepository } from "../application/ports";
import type { SubscriptionPlanDto } from "../application/types";
import {
  DEFAULT_CANCELLATION_RULE,
  DEFAULT_PARTIAL_REFUND_RULE,
  DEFAULT_PRORATION_RULE,
} from "../domain/cadence";
import type {
  CreatePlanOutput,
  PlanListQuery,
  UpdatePlanOutput,
} from "../schemas/plan";
import { createPlanSchema } from "../schemas/plan";

// In-memory repository implementing PlanRepository for deterministic unit tests
class InMemoryPlanRepository implements PlanRepository {
  private plans: Map<string, SubscriptionPlanDto> = new Map();
  private products: Map<string, { id: string; sku: string; name: string; price: string }> = new Map();

  // Test helper to seed valid products
  addProduct(product: { id: string; sku: string; name: string; price: string }) {
    this.products.set(product.id, product);
  }

  clear() {
    this.plans.clear();
    this.products.clear();
  }

  async list(query: PlanListQuery): Promise<SubscriptionPlanDto[]> {
    let result = Array.from(this.plans.values());
    if (query.cadence) {
      result = result.filter((p) => p.cadence === query.cadence);
    }
    if (query.productId) {
      result = result.filter((p) => p.productId === query.productId);
    }
    if (query.active !== undefined) {
      result = result.filter((p) => p.isActive === query.active);
    }
    return result;
  }

  async get(id: string): Promise<SubscriptionPlanDto | null> {
    return this.plans.get(id) ?? null;
  }

  async getByName(name: string): Promise<SubscriptionPlanDto | null> {
    for (const plan of this.plans.values()) {
      if (plan.name === name) return plan;
    }
    return null;
  }

  async create(input: CreatePlanOutput): Promise<SubscriptionPlanDto> {
    // Validate name uniqueness
    for (const plan of this.plans.values()) {
      if (plan.name === input.name) {
        throw new ServiceError("CONFIGURATION_CONFLICT", "A subscription plan with this name already exists", {
          target: ["name"],
        });
      }
    }

    // Validate product existence if attached
    let attachedProduct: { id: string; sku: string; name: string; price: string } | null = null;
    if (input.productId) {
      const prod = this.products.get(input.productId);
      if (!prod) {
        throw new ServiceError("NOT_FOUND", "Attached product does not exist", { productId: input.productId });
      }
      attachedProduct = prod;
    }

    const id = "11111111-2222-3333-4444-555555555555";
    const now = new Date().toISOString();
    const created: SubscriptionPlanDto = {
      id,
      name: input.name,
      cadence: input.cadence,
      productId: input.productId ?? null,
      product: attachedProduct,
      prorationRule: input.prorationRule,
      cancellationRule: input.cancellationRule,
      partialRefundRule: input.partialRefundRule,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.plans.set(id, created);
    return created;
  }

  async update(id: string, input: UpdatePlanOutput): Promise<SubscriptionPlanDto | null> {
    const existing = this.plans.get(id);
    if (!existing) return null;

    if (input.name && input.name !== existing.name) {
      for (const [otherId, plan] of this.plans.entries()) {
        if (otherId !== id && plan.name === input.name) {
          throw new ServiceError("CONFIGURATION_CONFLICT", "A subscription plan with this name already exists", {
            target: ["name"],
          });
        }
      }
    }

    let attachedProduct = existing.product;
    if (input.productId !== undefined) {
      if (input.productId === null) {
        attachedProduct = null;
      } else {
        const prod = this.products.get(input.productId);
        if (!prod) {
          throw new ServiceError("NOT_FOUND", "Attached product does not exist", { productId: input.productId });
        }
        attachedProduct = prod;
      }
    }

    const updated: SubscriptionPlanDto = {
      ...existing,
      name: input.name ?? existing.name,
      cadence: input.cadence ?? existing.cadence,
      productId: input.productId !== undefined ? input.productId : existing.productId,
      product: attachedProduct,
      prorationRule: input.prorationRule ?? existing.prorationRule,
      cancellationRule: input.cancellationRule ?? existing.cancellationRule,
      partialRefundRule: input.partialRefundRule ?? existing.partialRefundRule,
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      updatedAt: new Date().toISOString(),
    };

    this.plans.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.plans.has(id)) return false;
    this.plans.delete(id);
    return true;
  }
}

describe("T5.1 Subscription Plan CRUD", () => {
  let repository: InMemoryPlanRepository;
  let service: PlanService;

  const adminActor: Actor = { id: "user-admin", role: "ADMIN" };
  const salesRepActor: Actor = { id: "user-rep", role: "SALES_REP" };
  const customerActor: Actor = { id: "user-cust", role: "CUSTOMER" };

  const validProductId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  beforeEach(() => {
    repository = new InMemoryPlanRepository();
    repository.addProduct({
      id: validProductId,
      sku: "PROD-SUB-CARE",
      name: "Standard Care Support",
      price: "199.00",
    });
    service = new PlanService(repository);
  });

  describe("Create valid plans with supported cadences", () => {
    it("creates valid monthly plan", async () => {
      const plan = await service.create(adminActor, {
        name: "Monthly Care Plan",
        cadence: "MONTHLY",
      });

      expect(plan.name).toBe("Monthly Care Plan");
      expect(plan.cadence).toBe("MONTHLY");
      expect(plan.isActive).toBe(true);
      expect(plan.prorationRule).toEqual(DEFAULT_PRORATION_RULE);
      expect(plan.cancellationRule).toEqual(DEFAULT_CANCELLATION_RULE);
      expect(plan.partialRefundRule).toEqual(DEFAULT_PARTIAL_REFUND_RULE);
    });

    it("creates quarterly plan", async () => {
      const plan = await service.create(adminActor, {
        name: "Quarterly Care Plan",
        cadence: "QUARTERLY",
      });

      expect(plan.name).toBe("Quarterly Care Plan");
      expect(plan.cadence).toBe("QUARTERLY");
      expect(plan.isActive).toBe(true);
    });

    it("creates yearly plan", async () => {
      const plan = await service.create(adminActor, {
        name: "Yearly Care Plan",
        cadence: "YEARLY",
      });

      expect(plan.name).toBe("Yearly Care Plan");
      expect(plan.cadence).toBe("YEARLY");
      expect(plan.isActive).toBe(true);
    });
  });

  describe("Product attachment", () => {
    it("attaches valid product", async () => {
      const plan = await service.create(adminActor, {
        name: "Attached Care Plan",
        cadence: "MONTHLY",
        productId: validProductId,
      });

      expect(plan.productId).toBe(validProductId);
      expect(plan.product).toBeDefined();
      expect(plan.product?.name).toBe("Standard Care Support");
      expect(plan.product?.sku).toBe("PROD-SUB-CARE");
    });

    it("rejects non-existent product", async () => {
      const nonExistentProductId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99";

      await expect(
        service.create(adminActor, {
          name: "Invalid Product Plan",
          cadence: "MONTHLY",
          productId: nonExistentProductId,
        }),
      ).rejects.toThrow("Attached product does not exist");
    });

    it("rejects malformed product UUID", async () => {
      await expect(
        service.create(adminActor, {
          name: "Malformed Product Plan",
          cadence: "MONTHLY",
          productId: "not-a-valid-uuid",
        }),
      ).rejects.toThrow();
    });
  });

  describe("Cadence validation", () => {
    it("rejects invalid cadence in service", async () => {
      await expect(
        service.create(adminActor, {
          name: "Invalid Cadence Plan",
          cadence: "WEEKLY" as unknown as "MONTHLY",
        }),
      ).rejects.toThrow("Invalid cadence 'WEEKLY'");
    });

    it("rejects invalid cadence in Zod schema", () => {
      const result = createPlanSchema.safeParse({
        name: "Invalid Cadence Plan",
        cadence: "BIWEEKLY",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toMatch(/MONTHLY.*QUARTERLY.*YEARLY/);
      }
    });
  });

  describe("Configuration fields storage (TAD §25 / §54)", () => {
    it("stores custom proration, cancellation, and refund configuration", async () => {
      const customProrationRule = {
        strategy: "DAY_BASED_EXACT",
        allowMidCycle: true,
        precision: "HOUR",
        rounding: "UP",
      };

      const customCancellationRule = {
        policy: "IMMEDIATE_PRORATED",
        gracePeriodDays: 3,
        notifyAccountManager: true,
      };

      const customPartialRefundRule = {
        strategy: "CREDIT_NOTE_ONLY",
        creditExpiryDays: 90,
        adminApprovalThreshold: 500,
      };

      const plan = await service.create(adminActor, {
        name: "Enterprise SLA Plan",
        cadence: "YEARLY",
        prorationRule: customProrationRule,
        cancellationRule: customCancellationRule,
        partialRefundRule: customPartialRefundRule,
      });

      expect(plan.prorationRule).toEqual(customProrationRule);
      expect(plan.cancellationRule).toEqual(customCancellationRule);
      expect(plan.partialRefundRule).toEqual(customPartialRefundRule);
    });
  });

  describe("Authorization controls", () => {
    it("rejects unauthorized sales rep when attempting to create a plan", async () => {
      await expect(
        service.create(salesRepActor, {
          name: "Unauthorized Plan",
          cadence: "MONTHLY",
        }),
      ).rejects.toThrow("Administrator access is required");
    });

    it("rejects customer when attempting to create a plan", async () => {
      await expect(
        service.create(customerActor, {
          name: "Customer Plan",
          cadence: "MONTHLY",
        }),
      ).rejects.toThrow("Administrator access is required");
    });

    it("rejects unauthenticated caller when attempting to create a plan", async () => {
      await expect(
        service.create(null, {
          name: "Unauthenticated Plan",
          cadence: "MONTHLY",
        }),
      ).rejects.toThrow("Authentication is required");
    });

    it("rejects non-admin when attempting to update a plan", async () => {
      const plan = await service.create(adminActor, {
        name: "Plan to Update",
        cadence: "MONTHLY",
      });

      await expect(
        service.update(salesRepActor, plan.id, {
          name: "Hacked Plan",
        }),
      ).rejects.toThrow("Administrator access is required");
    });

    it("rejects non-admin when attempting to delete a plan", async () => {
      const plan = await service.create(adminActor, {
        name: "Plan to Delete",
        cadence: "MONTHLY",
      });

      await expect(service.delete(salesRepActor, plan.id)).rejects.toThrow("Administrator access is required");
    });

    it("allows sales rep to read and list plans", async () => {
      await service.create(adminActor, {
        name: "Visible Plan",
        cadence: "MONTHLY",
      });

      const plans = await service.list(salesRepActor);
      expect(plans.length).toBe(1);
      expect(plans[0].name).toBe("Visible Plan");

      const single = await service.get(salesRepActor, plans[0].id);
      expect(single.id).toBe(plans[0].id);
    });

    it("rejects customer from listing plans", async () => {
      await expect(service.list(customerActor)).rejects.toThrow("Internal access is required");
    });
  });

  describe("Update and Delete lifecycle", () => {
    it("allows admin to update plan details", async () => {
      const plan = await service.create(adminActor, {
        name: "Initial Plan",
        cadence: "MONTHLY",
      });

      const updated = await service.update(adminActor, plan.id, {
        name: "Renamed Plan",
        cadence: "YEARLY",
        isActive: false,
      });

      expect(updated.name).toBe("Renamed Plan");
      expect(updated.cadence).toBe("YEARLY");
      expect(updated.isActive).toBe(false);
    });

    it("allows admin to delete a plan", async () => {
      const plan = await service.create(adminActor, {
        name: "Delete Me",
        cadence: "QUARTERLY",
      });

      await service.delete(adminActor, plan.id);

      await expect(service.get(adminActor, plan.id)).rejects.toThrow("Subscription plan not found");
    });

    it("throws NOT_FOUND when updating non-existent plan", async () => {
      await expect(
        service.update(adminActor, "00000000-0000-0000-0000-000000000000", {
          name: "Ghost Plan",
        }),
      ).rejects.toThrow("Subscription plan not found");
    });
  });
});
