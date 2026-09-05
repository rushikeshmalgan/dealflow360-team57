import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { ApprovalRuleService } from "@/modules/approval/application/approval-rule-service";
import type { ApprovalRuleRepository } from "@/modules/approval/application/ports";
import type { ApprovalRuleDto } from "@/modules/approval/application/types";
import { discountRuleService } from "@/modules/discount-risk";
import type { Actor } from "@/modules/shared/domain/actor";

import { PrismaQuotationRepository } from "../../infrastructure/prisma-quotation-repository";
import { SubmitQuotationUseCase } from "../submit-quotation-use-case";

/**
 * T7.2's DoD: "the Gold/Laptop/Service fixture from T7.1 produces the documented flagged
 * result end-to-end through this endpoint." This hits the real dev Postgres for everything
 * T7.2 actually owns — quotation creation, real DiscountRule ceiling resolution (T3.1), real
 * scoreRisk (T7.1), and the real submit persistence (QuotationVersion, RiskEvaluation,
 * ApprovalRecord, status transition). Only the T3.2 approval-rule *lookup* is faked, because
 * ApprovalRule.riskBand is globally unique — a real MEDIUM-band row here would race against
 * the approval module's own integration test creating one concurrently. T3.2's config CRUD
 * (including that same unique-band backstop) already has its own integration coverage.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  "SubmitQuotationUseCase (integration) — Gold fixture",
  () => {
    const quotationRepository = new PrismaQuotationRepository();

    let actor: Actor;
    let tierId: string;
    let hardwareCategoryId: string;
    let servicesCategoryId: string;
    let customerId: string;
    let laptopId: string;
    let setupServiceId: string;
    let priceListId: string;
    const discountRuleIds: string[] = [];
    const quotationIds: string[] = [];

    beforeAll(async () => {
      const suffix = randomUUID();
      const user = await prisma.user.create({
        data: {
          clerkUserId: `test_${suffix}`,
          email: `rep+${suffix}@test.local`,
          role: "SALES_REP",
        },
      });
      actor = { id: user.id, role: "SALES_REP" };

      const tier = await prisma.customerTier.create({ data: { name: `T7-Gold-Tier-${suffix}` } });
      tierId = tier.id;

      const hardware = await prisma.productCategory.create({
        data: { name: `T7-Hardware-${suffix}` },
      });
      hardwareCategoryId = hardware.id;
      const services = await prisma.productCategory.create({
        data: { name: `T7-Services-${suffix}` },
      });
      servicesCategoryId = services.id;

      // TAD SS10 Gold example: tier ceiling 15% (covers Laptop, which has no category override),
      // category ceiling 10% for Services (lower than tier, so it wins for the Setup Service line).
      const tierRule = await prisma.discountRule.create({
        data: { scope: "TIER", tierId, maxDiscountPct: "0.15", isActive: true },
      });
      const categoryRule = await prisma.discountRule.create({
        data: {
          scope: "CATEGORY",
          categoryId: servicesCategoryId,
          maxDiscountPct: "0.10",
          isActive: true,
        },
      });
      discountRuleIds.push(tierRule.id, categoryRule.id);

      const customer = await prisma.customer.create({
        data: { name: `T7-Gold-Customer-${suffix}`, tierId },
      });
      customerId = customer.id;

      const laptop = await prisma.product.create({
        data: {
          categoryId: hardwareCategoryId,
          sku: `T7-LAPTOP-${suffix}`,
          name: "Laptop",
          price: "1000.00",
          costPrice: "700.00",
          unit: "unit",
          taxPct: "0",
        },
      });
      laptopId = laptop.id;

      const setupService = await prisma.product.create({
        data: {
          categoryId: servicesCategoryId,
          sku: `T7-SETUP-${suffix}`,
          name: "Setup Service",
          price: "200.00",
          costPrice: "100.00",
          unit: "unit",
          taxPct: "0",
        },
      });
      setupServiceId = setupService.id;

      const priceList = await prisma.priceList.create({
        data: {
          name: `T7-Gold-PriceList-${suffix}`,
          tierId,
          currency: "USD",
          items: {
            create: [
              { productId: laptopId, unitPrice: "1000.00" },
              { productId: setupServiceId, unitPrice: "200.00" },
            ],
          },
        },
      });
      priceListId = priceList.id;
    });

    afterAll(async () => {
      const versions = await prisma.quotationVersion.findMany({
        where: { quotationId: { in: quotationIds } },
        select: { id: true },
      });
      const versionIds = versions.map((v) => v.id);
      await prisma.approvalRecord.deleteMany({ where: { quotationVersionId: { in: versionIds } } });
      await prisma.riskEvaluation.deleteMany({ where: { quotationVersionId: { in: versionIds } } });
      await prisma.quotationVersion.deleteMany({ where: { quotationId: { in: quotationIds } } });
      await prisma.quotationLine.deleteMany({ where: { quotationId: { in: quotationIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: quotationIds } } });
      await prisma.quotation.deleteMany({ where: { id: { in: quotationIds } } });
      await prisma.priceListItem.deleteMany({ where: { priceListId } });
      await prisma.priceList.delete({ where: { id: priceListId } });
      await prisma.product.deleteMany({ where: { id: { in: [laptopId, setupServiceId] } } });
      await prisma.discountRule.deleteMany({ where: { id: { in: discountRuleIds } } });
      await prisma.customer.delete({ where: { id: customerId } });
      await prisma.productCategory.deleteMany({
        where: { id: { in: [hardwareCategoryId, servicesCategoryId] } },
      });
      await prisma.customerTier.delete({ where: { id: tierId } });
      await prisma.user.delete({ where: { id: actor.id } });
    });

    it("flags the quotation MEDIUM, persists the risk evaluation, and creates the approval chain", async () => {
      const mediumRule: ApprovalRuleDto = {
        id: "fake-medium-rule",
        riskBand: "MEDIUM",
        isActive: true,
        steps: [{ id: "fake-step-1", stepOrder: 1, role: "MANAGER" }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const fakeApprovalRuleRepository: ApprovalRuleRepository = {
        list: vi.fn().mockResolvedValue([mediumRule]),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      const approvalRuleService = new ApprovalRuleService(fakeApprovalRuleRepository);
      const useCase = new SubmitQuotationUseCase(
        quotationRepository,
        discountRuleService,
        approvalRuleService,
      );

      const created = await quotationRepository.create({ customerId, priceListId }, actor);
      quotationIds.push(created.id);

      const withLaptop = await quotationRepository.addLine(
        created.id,
        {
          expectedVersion: created.version,
          productId: laptopId,
          quantity: 1,
          billingType: "ONE_TIME",
        },
        actor,
      );
      const withBothLines = await quotationRepository.addLine(
        created.id,
        {
          expectedVersion: withLaptop.version,
          productId: setupServiceId,
          quantity: 1,
          billingType: "ONE_TIME",
        },
        actor,
      );
      const laptopLine = withBothLines.lines.find((l) => l.product.id === laptopId)!;
      const serviceLine = withBothLines.lines.find((l) => l.product.id === setupServiceId)!;

      const discounted = await quotationRepository.updateDiscounts(
        created.id,
        {
          expectedVersion: withBothLines.version,
          lineDiscounts: [
            { lineId: laptopLine.id, lineDiscountPct: 12 },
            { lineId: serviceLine.id, lineDiscountPct: 18 },
          ],
        },
        actor,
      );

      const result = await useCase.execute(actor, created.id, {
        expectedVersion: discounted.version,
      });

      expect(result.risk.band).toBe("MEDIUM");
      expect(result.requiresApproval).toBe(true);
      expect(result.approvalSteps).toEqual([{ stepOrder: 1, role: "MANAGER" }]);
      expect(result.quotation.status).toBe("PENDING_APPROVAL");
      expect(result.quotation.version).toBe(discounted.version + 1);

      const explanation = result.risk.explanation as {
        lines: Array<{ lineId: string; excessPct: number }>;
      };
      const laptopExplanation = explanation.lines.find((l) => l.lineId === laptopLine.id)!;
      const serviceExplanation = explanation.lines.find((l) => l.lineId === serviceLine.id)!;
      expect(laptopExplanation.excessPct).toBeCloseTo(0);
      expect(serviceExplanation.excessPct).toBeCloseTo(8);

      const persistedVersion = await prisma.quotationVersion.findFirst({
        where: { quotationId: created.id },
      });
      expect(persistedVersion?.versionNo).toBe(1);

      const persistedRisk = await prisma.riskEvaluation.findFirst({
        where: { quotationVersionId: persistedVersion!.id },
      });
      expect(persistedRisk?.band).toBe("MEDIUM");
      expect(persistedRisk?.score.toNumber()).toBeCloseTo(result.risk.score);

      const persistedApprovals = await prisma.approvalRecord.findMany({
        where: { quotationVersionId: persistedVersion!.id },
      });
      expect(persistedApprovals).toHaveLength(1);
      expect(persistedApprovals[0]).toMatchObject({
        stepOrder: 1,
        role: "MANAGER",
        status: "PENDING",
      });
    });

    it("rejects a stale submit with VERSION_CONFLICT", async () => {
      const approvalRuleService = new ApprovalRuleService({
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      });
      const useCase = new SubmitQuotationUseCase(
        quotationRepository,
        discountRuleService,
        approvalRuleService,
      );

      const created = await quotationRepository.create({ customerId, priceListId }, actor);
      quotationIds.push(created.id);
      await quotationRepository.addLine(
        created.id,
        {
          expectedVersion: created.version,
          productId: laptopId,
          quantity: 1,
          billingType: "ONE_TIME",
        },
        actor,
      );

      await expect(
        useCase.execute(actor, created.id, { expectedVersion: created.version }),
      ).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    });
  },
);
