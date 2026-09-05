import { PortalQuotationDetailClient } from "./portal-quotation-detail-client";

export default async function PortalQuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PortalQuotationDetailClient quotationId={id} />;
}
