import { z } from "zod";

const uuid = z.string().uuid();
const percentage = z.coerce.number().finite().min(0).max(100);
const comment = z.string().trim().min(1).max(2000);

export const lineCommentInputSchema = z.object({
  lineId: uuid,
  comment,
});

export const changeRequestInputSchema = z.object({
  lineId: uuid,
  requestType: z.enum(["QUANTITY_CHANGE", "REMOVE_LINE", "OTHER"]),
  note: comment,
});

export const negotiateQuotationSchema = z
  .object({
    counterDiscountPct: percentage.optional(),
    // Matches the <input type="date"> value the portal UI sends: date-only, no time component.
    requestedDeliveryDate: z.string().date().optional(),
    generalComment: comment.optional(),
    lineComments: z.array(lineCommentInputSchema).min(1).optional(),
    changeRequests: z.array(changeRequestInputSchema).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasContent =
      value.counterDiscountPct !== undefined ||
      value.requestedDeliveryDate !== undefined ||
      value.generalComment !== undefined ||
      (value.lineComments?.length ?? 0) > 0 ||
      (value.changeRequests?.length ?? 0) > 0;
    if (!hasContent) {
      ctx.addIssue({
        code: "custom",
        message: "Add a comment, counter-discount, or change request before submitting",
      });
    }
  });

export type LineCommentInput = z.infer<typeof lineCommentInputSchema>;
export type ChangeRequestInput = z.infer<typeof changeRequestInputSchema>;
export type NegotiateQuotationInput = z.infer<typeof negotiateQuotationSchema>;
