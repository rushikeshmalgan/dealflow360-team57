-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "seq_no" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_seq_no_key" ON "invoices"("seq_no");
