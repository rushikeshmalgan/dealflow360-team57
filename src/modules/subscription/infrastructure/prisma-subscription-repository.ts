import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { withOptimisticVersion } from "@/lib/optimistic-version";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import type { SubscriptionRepository } from "../application/ports";
import type {
  BillingDetailDto,
  BillingPlanCreationResultDto,
  BillingScheduleDto,
  SubscriptionCancellationDto,
  SubscriptionDto,
  SubscriptionModificationDto,
} from "../application/types";
import { calculateCycleEndDate } from "../domain/cadence";
import type { CancellationResult } from "../domain/cancellation";
import type { ProrationResult } from "../domain/proration";
import type {
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  ModifySubscriptionInput,
  SubscriptionListQuery,
} from "../schemas/subscription";

const subscriptionInclude = {
  customer: { select: { id: true, name: true } },
  plan: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          price: true,
        },
      },
    },
  },
  billingSchedules: {
    orderBy: { cycleStart: "asc" },
  },
} satisfies Prisma.SubscriptionInclude;

type SubscriptionRecord = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionInclude;
}>;

function billingScheduleDto(schedule: {
  id: string;
  subscriptionId: string;
  cycleStart: Date;
  cycleEnd: Date;
  amount: Prisma.Decimal;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): BillingScheduleDto {
  return {
    id: schedule.id,
    subscriptionId: schedule.subscriptionId,
    cycleStart: schedule.cycleStart.toISOString(),
    cycleEnd: schedule.cycleEnd.toISOString(),
    amount: schedule.amount.toString(),
    status: schedule.status,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

function subscriptionDto(sub: SubscriptionRecord): SubscriptionDto {
  return {
    id: sub.id,
    customerId: sub.customerId,
    customer: sub.customer,
    quotationId: sub.quotationId,
    planId: sub.planId,
    plan: sub.plan
      ? {
          id: sub.plan.id,
          name: sub.plan.name,
          cadence: sub.plan.cadence,
          productId: sub.plan.productId,
          product: sub.plan.product
            ? {
                id: sub.plan.product.id,
                sku: sub.plan.product.sku,
                name: sub.plan.product.name,
                price: sub.plan.product.price.toString(),
              }
            : null,
          prorationRule: (sub.plan.prorationRule ?? {}) as Record<string, unknown>,
          cancellationRule: (sub.plan.cancellationRule ?? {}) as Record<string, unknown>,
          partialRefundRule: (sub.plan.partialRefundRule ?? {}) as Record<string, unknown>,
          isActive: sub.plan.isActive,
          createdAt: sub.plan.createdAt.toISOString(),
          updatedAt: sub.plan.updatedAt.toISOString(),
        }
      : null,
    cycle: sub.cycle,
    status: sub.status,
    startDate: sub.startDate.toISOString(),
    nextBillDate: sub.nextBillDate.toISOString(),
    version: sub.version,
    billingSchedules: sub.billingSchedules?.map(billingScheduleDto),
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: SubscriptionListQuery): Promise<SubscriptionDto[]> {
    const subs = await this.db.subscription.findMany({
      where: {
        status: query.status,
        customerId: query.customerId,
        quotationId: query.quotationId,
      },
      include: subscriptionInclude,
      orderBy: { createdAt: "desc" },
    });
    return subs.map(subscriptionDto);
  }

  async get(id: string): Promise<SubscriptionDto | null> {
    const sub = await this.db.subscription.findUnique({
      where: { id },
      include: subscriptionInclude,
    });
    return sub ? subscriptionDto(sub) : null;
  }

  async getBillingSchedules(subscriptionId: string): Promise<BillingScheduleDto[]> {
    const schedules = await this.db.billingSchedule.findMany({
      where: { subscriptionId },
      orderBy: { cycleStart: "asc" },
    });
    return schedules.map(billingScheduleDto);
  }

  async getBillingDetail(subscriptionId: string): Promise<BillingDetailDto | null> {
    const sub = await this.db.subscription.findUnique({
      where: { id: subscriptionId },
      include: subscriptionInclude,
    });
    if (!sub) return null;

    let oneTimeLines: BillingDetailDto["originatingOrder"]["oneTimeLines"] = [];
    let recurringLines: BillingDetailDto["recurringLines"] = [];

    if (sub.quotationId) {
      const quotation = await this.db.quotation.findUnique({
        where: { id: sub.quotationId },
        include: {
          lines: {
            include: {
              product: true,
            },
          },
        },
      });

      if (quotation) {
        oneTimeLines = quotation.lines
          .filter((l) => l.billingType === "ONE_TIME" || !l.product.isSubscription)
          .map((line) => {
            const unitPrice = Number(line.unitPrice);
            const discountPct = Number(line.lineDiscountPct);
            const effectiveUnitPrice = unitPrice * (1 - discountPct);
            const lineAmount = effectiveUnitPrice * line.quantity;
            return {
              id: line.id,
              description: line.product.name,
              quantity: line.quantity,
              unitPrice: effectiveUnitPrice.toFixed(2),
              amount: lineAmount.toFixed(2),
            };
          });
      }
    }

    // List all subscriptions for this customer/quotation as recurring lines
    const relatedSubs = await this.db.subscription.findMany({
      where: { customerId: sub.customerId },
      include: {
        plan: true,
        billingSchedules: { orderBy: { cycleStart: "desc" }, take: 1 },
      },
    });

    recurringLines = relatedSubs.map((s) => ({
      id: s.id,
      planName: s.plan.name,
      cycle: s.cycle,
      nextBillDate: s.nextBillDate.toISOString(),
      amount: s.billingSchedules[0]?.amount.toString() ?? "0.00",
    }));

    const dto = subscriptionDto(sub);
    return {
      subscription: dto,
      customerName: sub.customer.name,
      planName: sub.plan.name,
      cycle: sub.cycle,
      nextBillDate: sub.nextBillDate.toISOString(),
      originatingOrder: {
        quotationId: sub.quotationId,
        oneTimeLines,
      },
      recurringLines,
      billingSchedules: dto.billingSchedules ?? [],
    };
  }

  async create(input: CreateSubscriptionInput, actor: Actor): Promise<SubscriptionDto> {
    return this.db.$transaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({
        where: { id: input.planId },
        include: { product: true },
      });
      if (!plan) throw new ServiceError("NOT_FOUND", "Subscription plan not found", { id: input.planId });

      const startDate = input.startDate ? new Date(input.startDate) : new Date();
      const nextBillDate = calculateCycleEndDate(startDate, input.cycle);

      const amount =
        input.amount !== undefined
          ? input.amount
          : plan.product?.price
            ? Number(plan.product.price)
            : 0;

      const created = await tx.subscription.create({
        data: {
          customerId: input.customerId,
          planId: input.planId,
          quotationId: input.quotationId ?? null,
          cycle: input.cycle,
          status: "ACTIVE",
          startDate,
          nextBillDate,
          billingSchedules: {
            create: {
              cycleStart: startDate,
              cycleEnd: nextBillDate,
              amount,
              status: "SCHEDULED",
            },
          },
        },
        include: subscriptionInclude,
      });

      // Generate initial invoice for subscription billing cycle
      const placeholderCode = `INV-PENDING-${randomUUID()}`;
      const draftInvoice = await tx.invoice.create({
        data: {
          invoiceCode: placeholderCode,
          customerId: input.customerId,
          subscriptionId: created.id,
          quotationId: input.quotationId ?? null,
          status: "ISSUED",
          totalAmount: amount,
          currency: input.currency ?? "USD",
          dueDate: nextBillDate,
          lines: {
            create: {
              sourceType: "SUBSCRIPTION",
              sourceLineId: created.id,
              description: `${plan.name} (${input.cycle}) subscription`,
              quantity: 1,
              unitPrice: amount,
              amount,
            },
          },
        },
      });

      await tx.invoice.update({
        where: { id: draftInvoice.id },
        data: { invoiceCode: `INV-${draftInvoice.seqNo.toString().padStart(6, "0")}` },
      });

      const dto = subscriptionDto(created);
      await recordAudit(tx, {
        actor,
        entityType: "Subscription",
        entityId: created.id,
        action: "CREATE",
        before: null,
        after: dto,
      });

      return dto;
    });
  }

  async createFromQuotation(
    quotationId: string,
    actor: Actor,
  ): Promise<BillingPlanCreationResultDto> {
    return this.db.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: {
          customer: true,
          lines: {
            include: {
              product: {
                include: {
                  subscriptionPlans: true,
                },
              },
            },
          },
        },
      });

      if (!quotation) {
        throw new ServiceError("NOT_FOUND", "Quotation not found", { id: quotationId });
      }

      // Check idempotency: if subscriptions or invoices already exist for this quotation, return them
      const existingSubs = await tx.subscription.findMany({
        where: { quotationId },
        include: subscriptionInclude,
      });
      const existingInvoice = await tx.invoice.findFirst({
        where: { quotationId, subscriptionId: null },
        include: { lines: true },
      });

      if (existingSubs.length > 0 || existingInvoice) {
        return {
          quotationId,
          invoice: existingInvoice
            ? {
                id: existingInvoice.id,
                invoiceCode: existingInvoice.invoiceCode,
                totalAmount: existingInvoice.totalAmount.toString(),
                lineCount: existingInvoice.lines.length,
              }
            : null,
          subscriptions: existingSubs.map(subscriptionDto),
        };
      }

      // Classify lines: ONE_TIME vs RECURRING (FR-BILL-001, WF30-WF32)
      const oneTimeLines = quotation.lines.filter(
        (l) => l.billingType === "ONE_TIME" && !l.product.isSubscription,
      );
      const recurringLines = quotation.lines.filter(
        (l) => l.billingType === "RECURRING" || l.product.isSubscription,
      );

      // 1. One-time lines -> Invoice
      let createdInvoiceSummary: BillingPlanCreationResultDto["invoice"] = null;
      if (oneTimeLines.length > 0) {
        const invoiceLinesData = oneTimeLines.map((line) => {
          const unitPrice = Number(line.unitPrice);
          const discountPct = Number(line.lineDiscountPct);
          const effectiveUnitPrice = unitPrice * (1 - discountPct);
          const amount = effectiveUnitPrice * line.quantity;
          return {
            sourceType: "QUOTATION",
            sourceLineId: line.id,
            description: line.product.name,
            quantity: line.quantity,
            unitPrice: effectiveUnitPrice,
            amount,
          };
        });

        const invoiceTotal = invoiceLinesData.reduce((sum, l) => sum + l.amount, 0);
        const placeholderCode = `INV-PENDING-${randomUUID()}`;

        const draftInvoice = await tx.invoice.create({
          data: {
            invoiceCode: placeholderCode,
            customerId: quotation.customerId,
            quotationId: quotation.id,
            status: "ISSUED",
            totalAmount: invoiceTotal,
            currency: "USD",
            lines: {
              create: invoiceLinesData,
            },
          },
          include: { lines: true },
        });

        const invoice = await tx.invoice.update({
          where: { id: draftInvoice.id },
          data: { invoiceCode: `INV-${draftInvoice.seqNo.toString().padStart(6, "0")}` },
          include: { lines: true },
        });

        createdInvoiceSummary = {
          id: invoice.id,
          invoiceCode: invoice.invoiceCode,
          totalAmount: invoice.totalAmount.toString(),
          lineCount: invoice.lines.length,
        };

        await recordAudit(tx, {
          actor,
          entityType: "Invoice",
          entityId: invoice.id,
          action: "CREATE_FROM_QUOTATION",
          before: null,
          after: createdInvoiceSummary,
        });
      }

      // 2. Recurring lines -> Subscription + BillingSchedule
      const createdSubscriptions: SubscriptionDto[] = [];
      const now = new Date();

      for (const line of recurringLines) {
        const cadence = line.product.recurringCycle ?? "MONTHLY";
        let plan = line.product.subscriptionPlans[0];

        if (!plan) {
          plan = (await tx.subscriptionPlan.findFirst({
            where: { cadence, isActive: true },
            include: { product: true },
          }))!;
        }

        if (!plan) {
          // Create fallback plan if none configured
          plan = await tx.subscriptionPlan.create({
            data: {
              name: `${line.product.name} ${cadence} Plan`,
              cadence,
              productId: line.productId,
              prorationRule: {
                strategy: "DAY_BASED",
                description: "Pro-rata billing based on elapsed days in the billing cycle",
                allowMidCycle: true,
                precision: "DAY",
              },
              cancellationRule: {
                policy: "END_OF_CYCLE",
                allowImmediate: true,
                refundEligible: true,
                description: "Subscription can cancel immediately with refund or at end of current billing cycle",
              },
              partialRefundRule: {
                strategy: "PRO_RATA_REFUND",
                creditNoteOnCancel: true,
                minimumDaysForRefund: 1,
                description: "Pro-rata credit note or refund calculated on unused subscription cycle duration",
              },
            },
            include: { product: true },
          });
        }

        const cycleEnd = calculateCycleEndDate(now, cadence);
        const unitPrice = Number(line.unitPrice);
        const discountPct = Number(line.lineDiscountPct);
        const effectiveUnitPrice = unitPrice * (1 - discountPct);
        const recurringAmount = effectiveUnitPrice * line.quantity;

        const sub = await tx.subscription.create({
          data: {
            customerId: quotation.customerId,
            quotationId: quotation.id,
            planId: plan.id,
            cycle: cadence,
            status: "ACTIVE",
            startDate: now,
            nextBillDate: cycleEnd,
            billingSchedules: {
              create: {
                cycleStart: now,
                cycleEnd,
                amount: recurringAmount,
                status: "SCHEDULED",
              },
            },
          },
          include: subscriptionInclude,
        });

        // Create subscription recurring invoice
        const placeholderCode = `INV-PENDING-${randomUUID()}`;
        const draftSubInvoice = await tx.invoice.create({
          data: {
            invoiceCode: placeholderCode,
            customerId: quotation.customerId,
            subscriptionId: sub.id,
            quotationId: quotation.id,
            status: "ISSUED",
            totalAmount: recurringAmount,
            currency: "USD",
            dueDate: cycleEnd,
            lines: {
              create: {
                sourceType: "SUBSCRIPTION",
                sourceLineId: line.id,
                description: `${line.product.name} (${cadence})`,
                quantity: line.quantity,
                unitPrice: effectiveUnitPrice,
                amount: recurringAmount,
              },
            },
          },
        });

        await tx.invoice.update({
          where: { id: draftSubInvoice.id },
          data: { invoiceCode: `INV-${draftSubInvoice.seqNo.toString().padStart(6, "0")}` },
        });

        const subDto = subscriptionDto(sub);
        createdSubscriptions.push(subDto);

        await recordAudit(tx, {
          actor,
          entityType: "Subscription",
          entityId: sub.id,
          action: "CREATE_FROM_QUOTATION",
          before: null,
          after: subDto,
        });
      }

      return {
        quotationId,
        invoice: createdInvoiceSummary,
        subscriptions: createdSubscriptions,
      };
    });
  }

  async modify(
    id: string,
    input: ModifySubscriptionInput,
    prorationResult: ProrationResult,
    actor: Actor,
  ): Promise<SubscriptionModificationDto> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({
        where: { id },
        include: subscriptionInclude,
      });
      if (!current) throw new ServiceError("NOT_FOUND", "Subscription not found", { id });

      const newCycle = input.cycle ?? current.cycle;
      const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
      const updatedNextBillDate = calculateCycleEndDate(effectiveDate, newCycle);

      // Enforce optimistic locking (T0.4 / TAD §26)
      await withOptimisticVersion(tx.subscription, id, input.expectedVersion, {
        planId: input.planId ?? current.planId,
        cycle: newCycle,
        nextBillDate: updatedNextBillDate,
      });

      // Update active schedule status or create new prorated schedule
      const newSchedule = await tx.billingSchedule.create({
        data: {
          subscriptionId: id,
          cycleStart: effectiveDate,
          cycleEnd: updatedNextBillDate,
          amount: prorationResult.newAmount,
          status: prorationResult.isUpgrade ? "PRORATED_UPGRADE" : "PRORATED_DOWNGRADE",
        },
      });

      const updated = await tx.subscription.findUnique({
        where: { id },
        include: subscriptionInclude,
      });

      const updatedDto = subscriptionDto(updated!);
      const result: SubscriptionModificationDto = {
        subscription: updatedDto,
        proration: prorationResult,
        schedule: billingScheduleDto(newSchedule),
      };

      await recordAudit(tx, {
        actor,
        entityType: "Subscription",
        entityId: id,
        action: "PRORATION_MODIFIED",
        before: subscriptionDto(current),
        after: result,
        reason: prorationResult.explanation,
      });

      return result;
    });
  }

  async cancel(
    id: string,
    input: CancelSubscriptionInput,
    cancellationResult: CancellationResult,
    actor: Actor,
  ): Promise<SubscriptionCancellationDto> {
    return this.db.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({
        where: { id },
        include: subscriptionInclude,
      });
      if (!current) throw new ServiceError("NOT_FOUND", "Subscription not found", { id });

      // Optimistic concurrency check (T0.4)
      await withOptimisticVersion(tx.subscription, id, input.expectedVersion, {
        status: "CANCELLED",
      });

      // Handle pro-rata refund & credit note trigger (T10.3 / TAD §25)
      let creditNoteDto: SubscriptionCancellationDto["creditNote"] = null;

      if (cancellationResult.creditNoteRequired && cancellationResult.refundAmount > 0) {
        // Find existing invoice for this subscription or customer
        let invoice = await tx.invoice.findFirst({
          where: { subscriptionId: id },
          orderBy: { createdAt: "desc" },
        });

        if (!invoice && current.quotationId) {
          invoice = await tx.invoice.findFirst({
            where: { quotationId: current.quotationId },
            orderBy: { createdAt: "desc" },
          });
        }

        if (!invoice) {
          // If no invoice existed, create a reference invoice to record the credit note against
          const placeholderCode = `INV-PENDING-${randomUUID()}`;
          const draftInv = await tx.invoice.create({
            data: {
              invoiceCode: placeholderCode,
              customerId: current.customerId,
              subscriptionId: current.id,
              status: "CREDITED",
              totalAmount: cancellationResult.refundAmount,
              currency: "USD",
            },
          });
          invoice = await tx.invoice.update({
            where: { id: draftInv.id },
            data: { invoiceCode: `INV-${draftInv.seqNo.toString().padStart(6, "0")}` },
          });
        }

        const creditNote = await tx.creditNote.create({
          data: {
            invoiceId: invoice.id,
            amount: cancellationResult.refundAmount,
            reason: input.reason ?? cancellationResult.explanation,
          },
        });

        creditNoteDto = {
          id: creditNote.id,
          invoiceId: creditNote.invoiceId,
          amount: creditNote.amount.toString(),
          reason: creditNote.reason,
          createdAt: creditNote.createdAt.toISOString(),
        };
      }

      const updated = await tx.subscription.findUnique({
        where: { id },
        include: subscriptionInclude,
      });

      const updatedDto = subscriptionDto(updated!);
      const result: SubscriptionCancellationDto = {
        subscription: updatedDto,
        cancellation: {
          effectiveCancellationDate: cancellationResult.effectiveCancellationDate.toISOString(),
          immediate: cancellationResult.immediate,
          policy: cancellationResult.policy,
          refundEligible: cancellationResult.refundEligible,
          creditNoteRequired: cancellationResult.creditNoteRequired,
          refundAmount: cancellationResult.refundAmount,
          explanation: cancellationResult.explanation,
        },
        creditNote: creditNoteDto,
      };

      await recordAudit(tx, {
        actor,
        entityType: "Subscription",
        entityId: id,
        action: "CANCELLED",
        before: subscriptionDto(current),
        after: result,
        reason: input.reason ?? cancellationResult.explanation,
      });

      return result;
    });
  }
}
