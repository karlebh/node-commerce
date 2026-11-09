-- AlterEnum
ALTER TYPE "ImageableType" ADD VALUE 'REVIEW';

-- AlterEnum
ALTER TYPE "VideoableType" ADD VALUE 'REVIEW';

-- CreateTable
CREATE TABLE "review_comments" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_comments_reviewId_createdAt_idx" ON "review_comments"("reviewId", "createdAt");

-- CreateIndex
CREATE INDEX "review_comments_parentId_idx" ON "review_comments"("parentId");

-- CreateIndex
CREATE INDEX "review_comments_userId_idx" ON "review_comments"("userId");

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "review_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
