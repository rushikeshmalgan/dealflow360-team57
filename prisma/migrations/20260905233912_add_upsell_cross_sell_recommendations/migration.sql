-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('UPSELL', 'CROSS_SELL');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ADDED', 'DISMISSED');

-- CreateTable
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(6,5) NOT NULL,
    "reason_codes" JSONB NOT NULL,
    "promotion_discount_rule_id" UUID,
    "projected_margin_delta_amount" DECIMAL(14,2) NOT NULL,
    "projected_margin_delta_pct" DECIMAL(7,4) NOT NULL,
    "projected_resulting_margin_pct" DECIMAL(7,4),
    "config_version" INTEGER NOT NULL,
    "added_quotation_line_id" UUID,
    "dismissed_by_user_id" UUID,
    "dismissed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendations_quotation_id_status_rank_idx" ON "recommendations"("quotation_id", "status", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_quotation_id_product_id_key" ON "recommendations"("quotation_id", "product_id");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_promotion_discount_rule_id_fkey" FOREIGN KEY ("promotion_discount_rule_id") REFERENCES "discount_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_added_quotation_line_id_fkey" FOREIGN KEY ("added_quotation_line_id") REFERENCES "quotation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_dismissed_by_user_id_fkey" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
