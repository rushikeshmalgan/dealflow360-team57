import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";

import type { CreateInvoiceInput, InvoiceListQuery, RecordPaymentInput } from "../schemas/invoice";
import type { InvoiceRepository } from "../application/ports";
import type { InvoiceDto } from "../application/types";

const invoiceInclude = {
  customer: { select: { id: true, name: true } },
  lines: { orderBy: { createdAt: "asc" } },
  payments: { where: { status: "RECORDED" }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.InvoiceInclude;

type InvoiceRecord = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

function invoiceDto(invoice: InvoiceRecord): InvoiceDto {
  const paidAmount = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  return {
    id: invoice.id,
    seqNo: invoice.seqNo,
    invoiceCode: invoice.invoiceCode,
    customer: invoice.customer,
    quotationId: invoice.quotationId,
    status: invoice.status,
    totalAmount: invoice.totalAmount.toString(),
    paidAmount: paidAmount.toFixed(2),
    currency: invoice.currency,
    dueDate: invoice.dueDate?.toISOString() ?? null,
    version: invoice.version,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      sourceType: line.sourceType,
      sourceLineId: line.sourceLineId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toString(),
      amount: line.amount.toString(),
    })),
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: p.amount.toString(),
      method: p.method,
      reference: p.reference,
      status: p.status,
      recordedByUserId: p.recordedByUserId,
      createdAt: p.createdAt.toISOString(),
    })),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}

/** DRAFT/VOID/CREDITED are never reachable by payment recalculation — this only ever moves an
 * ISSUED invoice toward PARTIALLY_PAID/PAID (TAD SS25: "only PAID is required by the demo"). */
function deriveStatusFromPayments(totalAmount: number, paidAmount: number): "ISSUED" | "PARTIALLY_PAID" | "PAID" {
  if (paidAmount >= totalAmount) return "PAID";
  if (paidAmount > 0) return "PARTIALLY_PAID";
  return "ISSUED";
}

export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: InvoiceListQuery) {
    const invoices = await this.db.invoice.findMany({
      where: {
        status: query.status,
        customerId: query.customerId,
      },
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    });
    return invoices.map(invoiceDto);
  }

  async get(id: string) {
    const invoice = await this.db.invoice.findUnique({ where: { id }, include: invoiceInclude });
    return invoice ? invoiceDto(invoice) : null;
  }

  async create(input: CreateInvoiceInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) {
          throw new ServiceError("NOT_FOUND", "Customer not found", { id: input.customerId });
        }
        if (input.quotationId) {
          const quotation = await tx.quotation.findUnique({ where: { id: input.quotationId } });
          if (!quotation) {
            throw new ServiceError("NOT_FOUND", "Quotation not found", { id: input.quotationId });
          }
        }

        const totalAmount = input.lines.reduce(
          (sum, line) => sum + line.quantity * line.unitPrice,
          0,
        );

        // Same two-step pattern as Quotation.code (prisma-quotation-repository.ts): the human
        // code depends on the DB-assigned seqNo, so insert with a placeholder that still
        // satisfies the unique constraint, then rewrite it once seqNo is known.
        const draft = await tx.invoice.create({
          data: {
            invoiceCode: `PENDING-${randomUUID()}`,
            customerId: input.customerId,
            quotationId: input.quotationId ?? null,
            status: "ISSUED",
            totalAmount,
            currency: input.currency,
            dueDate: input.dueDate ?? null,
            lines: {
              create: input.lines.map((line) => ({
                sourceType: "MANUAL",
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                amount: line.quantity * line.unitPrice,
              })),
            },
          },
        });
        const created = await tx.invoice.update({
          where: { id: draft.id },
          data: { invoiceCode: `INV-${draft.seqNo.toString().padStart(6, "0")}` },
          include: invoiceInclude,
        });

        const dto = invoiceDto(created);
        await recordAudit(tx, {
          actor,
          entityType: "Invoice",
          entityId: created.id,
          action: "CREATE",
          before: null,
          after: dto,
        });
        return dto;
      });
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ServiceError("VALIDATION_ERROR", "Referenced customer or quotation does not exist");
      }
      throw error;
    }
  }

  async recordPayment(id: string, input: RecordPaymentInput, actor: Actor) {
    return this.db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, include: invoiceInclude });
      if (!invoice) throw new ServiceError("NOT_FOUND", "Invoice not found", { id });

      // Idempotency guard (TAD SS25/SS26): the same idempotencyKey submitted twice must return
      // the original result, never create a second Payment row. Payment.idempotencyKey is
      // UNIQUE, so we check first rather than racing on the constraint, keeping the "already
      // recorded" path a clean read instead of a caught P2002.
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        return invoiceDto(invoice);
      }

      if (invoice.status === "VOID" || invoice.status === "CREDITED") {
        throw new ServiceError(
          "INVALID_STATE_TRANSITION",
          "Cannot record a payment against a void or credited invoice",
          { id, status: invoice.status },
        );
      }

      await tx.payment.create({
        data: {
          invoiceId: id,
          amount: input.amount,
          method: input.method ?? null,
          reference: input.reference ?? null,
          idempotencyKey: input.idempotencyKey,
          recordedByUserId: actor.id,
        },
      });

      const paidAmount =
        invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0) + input.amount;
      const nextStatus = deriveStatusFromPayments(Number(invoice.totalAmount), paidAmount);

      const updated = await tx.invoice.update({
        where: { id },
        data: { status: nextStatus, version: { increment: 1 } },
        include: invoiceInclude,
      });

      const dto = invoiceDto(updated);
      await recordAudit(tx, {
        actor,
        entityType: "Invoice",
        entityId: id,
        action: "PAYMENT_RECORDED",
        before: invoiceDto(invoice),
        after: dto,
      });
      return dto;
    });
  }
}
