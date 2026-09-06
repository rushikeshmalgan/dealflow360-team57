-- DropForeignKey
ALTER TABLE "recommendations" DROP CONSTRAINT "recommendations_product_id_fkey";

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
