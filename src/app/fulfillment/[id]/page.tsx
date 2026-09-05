import { FulfillmentOrderDetailClient } from "./fulfillment-order-detail-client";

export default async function FulfillmentOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FulfillmentOrderDetailClient orderId={id} />;
}
