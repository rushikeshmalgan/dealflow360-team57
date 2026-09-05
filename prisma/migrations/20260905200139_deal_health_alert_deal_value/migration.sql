/*
  Warnings:

  - Added the required column `deal_value` to the `deal_health_alerts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "deal_health_alerts" ADD COLUMN     "deal_value" DECIMAL(14,2) NOT NULL;
