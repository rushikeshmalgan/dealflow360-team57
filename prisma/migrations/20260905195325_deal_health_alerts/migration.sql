-- CreateEnum
CREATE TYPE "DealHealthAlertType" AS ENUM ('STALLED_QUOTATION', 'DISCOUNT_ANOMALY', 'DELIVERY_SLIPPAGE', 'HIGH_RISK_DEAL');

-- CreateEnum
CREATE TYPE "DealHealthSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DealHealthAlertStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "deal_health_alerts" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "type" "DealHealthAlertType" NOT NULL,
    "status" "DealHealthAlertStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "DealHealthSeverity" NOT NULL,
    "priority_score" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "detected_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deal_health_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_health_alerts_status_priority_score_idx" ON "deal_health_alerts"("status", "priority_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "deal_health_alerts_quotation_id_type_key" ON "deal_health_alerts"("quotation_id", "type");

-- AddForeignKey
ALTER TABLE "deal_health_alerts" ADD CONSTRAINT "deal_health_alerts_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_health_alerts" ADD CONSTRAINT "deal_health_alerts_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
