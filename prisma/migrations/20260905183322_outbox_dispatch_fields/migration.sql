-- AlterTable
ALTER TABLE "notification_outbox" ADD COLUMN     "dispatched_at" TIMESTAMPTZ(6),
ADD COLUMN     "last_error" TEXT;
