-- Replace Clerk-backed identity with email/password + session-cookie auth.

-- AlterTable: add password_hash as nullable first so pre-existing (test/dev-seed) rows don't
-- block the migration, backfill an unusable placeholder hash, then enforce NOT NULL.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;

UPDATE "users"
SET "password_hash" = '6f45530d6fe3d7f96a2faacafd9e226e:cac2e85d843d2066deb288e6f246f9584691a004bbf7dc4b4b72e62ef9faf561592eb317a394d99edb31b1fda4ca8454640e3f9cc2692d741b03e0442fc0e8fe'
WHERE "password_hash" IS NULL;

ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

-- DropIndex
DROP INDEX "users_clerk_user_id_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "clerk_user_id",
DROP COLUMN "sync_status";

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
