import { describe, expect, it, vi } from "vitest";

import { ApprovalRuleService } from "@/modules/approval/application/approval-rule-service";
import type { ApprovalRuleRepository } from "@/modules/approval/application/ports";
import type { ApprovalRuleDto } from "@/modules/approval/application/types";
import { DiscountRuleService } from "@/modules/discount-risk/application/discount-rule-service";
import type { DiscountRuleRepository } from "@/modules/discount-risk/application/ports";
import type { ResolvedCeilingDto } from "@/modules/discount-risk/application/types";
import type { Actor } from "@/modules/shared/domain/actor";

import { SubmitQuotationUseCase } from "../submit-quotation-use-case";
import type { QuotationRepository } from "../ports";
import type { QuotationDto, QuotationLineDto } from "../types";

const rep: Actor = { id: "rep-1", role: "SALES_REP" };
const otherRep: Actor = { id: "rep-2", role: "SALES_REP" };

function makeLine(overrides: Partial<QuotationLineDto> = {}): QuotationLineDto {
  return {
    id: "line-1",
    product: { id: "prod-1", name: "Laptop", sku: "SKU-1", categoryId: "cat-hardware" },
    variant: null,
    quantity: 1,
    unitPrice: "1000.00",
    lineDiscountPct: "12",
    billingType: "ONE_TIME",
    effectiveDiscountPct: "12",
    netBeforeTax: "880.00",
    marginAmount: "180.00",
    marginPct: "20.4545",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuotation(overrides: Partial<QuotationDto> = {}): QuotationDto {
  return {
    id: "quote-1",
    code: "QT-000001",
    seqNo: 1,
    customer: { id: "cust-1", name: "Acme Gold", tierId: "tier-gold" },
    salesRep: { id: rep.id, email: "rep@test.local" },
    priceList: { id: "pl-1", name: "Gold USD", currency: "USD" },
    status: "DRAFT",
    orderDiscountPct: "0",
    version: 3,
    lines: [makeLine()],
    summary: {
      netBeforeTax: "880.00",
      totalCost: "700.00",
      marginAmount: "180.00",
      marginPct: "20.4545",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeQuotationRepository(
  overrides: Partial<QuotationRepository> = {},
): QuotationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(makeQuotation()),
    create: vi.fn(),
    addLine: vi.fn(),
    patch: vi.fn(),
    updateDiscounts: vi.fn(),
    submit: vi.fn().mockResolvedValue(makeQuotation({ status: "APPROVED", version: 4 })),
    ...overrides,
  };
}

function makeDiscountRuleService(resolveCeiling: DiscountRuleRepository["resolveCeiling"]) {
  const repository: DiscountRuleRepository = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    resolveCeiling,
  };
  return new DiscountRuleService(repository);
}

function makeApprovalRuleService(rules: ApprovalRuleDto[]) {
  const repository: ApprovalRuleRepository = {
    list: vi.fn().mockResolvedValue(rules),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return new ApprovalRuleService(repository);
}

function noCeiling(): Promise<ResolvedCeilingDto> {
  return Promise.resolve({
    tierId: "tier-gold",
    categoryId: null,
    tierCeilingPct: null,
    categoryCeilingPct: null,
    allowedDiscountPct: null,
    limitingScope: null,
  });
}

describe("SubmitQuotationUseCase authorization and state guards", () => {
  it("denies a non-owning Sales Rep", async () => {
    const useCase = new SubmitQuotationUseCase(
      makeQuotationRepository(),
      makeDiscountRuleService(noCeiling),
      makeApprovalRuleService([]),
    );
    await expect(
      useCase.execute(otherRep, "quote-1", { expectedVersion: 3 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects submitting a quotation that is not Draft", async () => {
    const repository = makeQuotationRepository({
      get: vi.fn().mockResolvedValue(makeQuotation({ status: "SUBMITTED" })),
    });
    const useCase = new SubmitQuotationUseCase(
      repository,
      makeDiscountRuleService(noCeiling),
      makeApprovalRuleService([]),
    );
    await expect(useCase.execute(rep, "quote-1", { expectedVersion: 3 })).rejects.toMatchObject({
      code: "INVALID_STATE_TRANSITION",
    });
  });

  it("rejects submitting a quotation with no lines", async () => {
    const repository = makeQuotationRepository({
      get: vi.fn().mockResolvedValue(makeQuotation({ lines: [] })),
    });
    const useCase = new SubmitQuotationUseCase(
      repository,
      makeDiscountRuleService(noCeiling),
      makeApprovalRuleService([]),
    );
    await expect(useCase.execute(rep, "quote-1", { expectedVersion: 3 })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("SubmitQuotationUseCase — TAD SS10 Gold fixture end-to-end orchestration", () => {
  it("flags a Gold quote (Laptop 12%/15%, Setup Service 18%/10%) and routes it to the MEDIUM-band chain", async () => {
    const quotation = makeQuotation({
      lines: [
        makeLine({
          id: "line-laptop",
          product: { id: "p-laptop", name: "Laptop", sku: "SKU-L", categoryId: "cat-hardware" },
          effectiveDiscountPct: "12",
          netBeforeTax: "880.00",
        }),
        makeLine({
          id: "line-service",
          product: {
            id: "p-service",
            name: "Setup Service",
            sku: "SKU-S",
            categoryId: "cat-services",
          },
          effectiveDiscountPct: "18",
          netBeforeTax: "164.00",
        }),
      ],
      summary: {
        netBeforeTax: "1044.00",
        totalCost: "750.00",
        marginAmount: "294.00",
        marginPct: "28.16",
      },
    });
    const repository = makeQuotationRepository({ get: vi.fn().mockResolvedValue(quotation) });

    // Tier ceiling 15% (Laptop's category has no override), category ceiling 10% for Services —
    // the exact TAD SS10 Gold-customer configuration.
    const resolveCeiling = vi.fn((_actor: unknown, _tierId: string, categoryId: string | null) =>
      Promise.resolve<ResolvedCeilingDto>({
        tierId: "tier-gold",
        categoryId,
        tierCeilingPct: "15",
        categoryCeilingPct: categoryId === "cat-services" ? "10" : null,
        allowedDiscountPct: categoryId === "cat-services" ? "10" : "15",
        limitingScope: categoryId === "cat-services" ? "CATEGORY" : "TIER",
      }),
    ) as unknown as DiscountRuleRepository["resolveCeiling"];

    const mediumRule: ApprovalRuleDto = {
      id: "rule-medium",
      riskBand: "MEDIUM",
      isActive: true,
      steps: [{ id: "step-1", stepOrder: 1, role: "MANAGER" }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const approvalRuleRepository: ApprovalRuleRepository = {
      list: vi.fn().mockResolvedValue([mediumRule]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const approvalRuleService = new ApprovalRuleService(approvalRuleRepository);

    const useCase = new SubmitQuotationUseCase(
      repository,
      makeDiscountRuleService(resolveCeiling),
      approvalRuleService,
    );

    const result = await useCase.execute(rep, "quote-1", { expectedVersion: 3 });

    expect(result.risk.band).toBe("MEDIUM");
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalSteps).toEqual([{ stepOrder: 1, role: "MANAGER" }]);
    expect(approvalRuleRepository.list).toHaveBeenCalledWith({ riskBand: "MEDIUM", active: true });
    expect(repository.submit).toHaveBeenCalledWith(
      "quote-1",
      expect.objectContaining({
        expectedVersion: 3,
        finalStatus: "PENDING_APPROVAL",
        approvalSteps: [{ stepOrder: 1, role: "MANAGER" }],
        risk: expect.objectContaining({ band: "MEDIUM" }),
      }),
      rep,
    );
  });

  it("approves directly (no approval chain) when the risk band is LOW and no rule matches", async () => {
    const useCase = new SubmitQuotationUseCase(
      makeQuotationRepository(),
      makeDiscountRuleService(noCeiling),
      makeApprovalRuleService([]),
    );

    const result = await useCase.execute(rep, "quote-1", { expectedVersion: 3 });

    expect(result.risk.band).toBe("LOW");
    expect(result.requiresApproval).toBe(false);
    expect(result.approvalSteps).toEqual([]);
  });
});
