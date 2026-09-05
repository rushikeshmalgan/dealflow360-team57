export type InvoiceLineDto = {
  id: string;
  sourceType: string;
  sourceLineId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
};

export type PaymentDto = {
  id: string;
  amount: string;
  method: string | null;
  reference: string | null;
  status: "RECORDED" | "VOIDED";
  recordedByUserId: string;
  createdAt: string;
};

export type InvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "VOID"
  | "CREDITED";

export type InvoiceDto = {
  id: string;
  seqNo: number;
  invoiceCode: string;
  customer: { id: string; name: string };
  quotationId: string | null;
  status: InvoiceStatus;
  totalAmount: string;
  /** Sum of RECORDED payments — derived on every read, never stored (TAD SS8: "Invoices: Status
   * derives from issued amount, payments and credits; direct arbitrary status writes are forbidden"). */
  paidAmount: string;
  currency: string;
  dueDate: string | null;
  version: number;
  lines: InvoiceLineDto[];
  payments: PaymentDto[];
  createdAt: string;
  updatedAt: string;
};
