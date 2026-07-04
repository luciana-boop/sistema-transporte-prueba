-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "access_token_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_access_token_hash_key" ON "usuarios"("access_token_hash");

