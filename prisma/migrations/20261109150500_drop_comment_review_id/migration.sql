-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_reviewId_fkey";

-- DropIndex
DROP INDEX "comments_reviewId_createdAt_idx";

-- AlterTable
ALTER TABLE "comments" DROP COLUMN "reviewId";

-- CreateIndex
CREATE INDEX "comments_commentableType_commentableId_createdAt_idx" ON "comments"("commentableType", "commentableId", "createdAt");
