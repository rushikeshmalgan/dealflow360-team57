import { InvoiceService } from "./application/invoice-service";
import { PrismaInvoiceRepository } from "./infrastructure/prisma-invoice-repository";

export const invoiceService = new InvoiceService(new PrismaInvoiceRepository());

export { InvoiceService } from "./application/invoice-service";
export type { InvoiceDto, InvoiceLineDto, PaymentDto, InvoiceStatus } from "./application/types";
