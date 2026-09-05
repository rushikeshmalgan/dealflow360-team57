import type { Actor } from "@/modules/shared/domain/actor";

import type { CreateInvoiceInput, InvoiceListQuery, RecordPaymentInput } from "../schemas/invoice";
import type { InvoiceDto } from "./types";

export interface InvoiceRepository {
  list(query: InvoiceListQuery): Promise<InvoiceDto[]>;
  get(id: string): Promise<InvoiceDto | null>;
  create(input: CreateInvoiceInput, actor: Actor): Promise<InvoiceDto>;
  recordPayment(id: string, input: RecordPaymentInput, actor: Actor): Promise<InvoiceDto>;
}
