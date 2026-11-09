-- AlterEnum
ALTER TYPE "ImageableType" ADD VALUE 'COMMENT';

-- AlterEnum
ALTER TYPE "VideoableType" ADD VALUE 'COMMENT';

-- CreateEnum
CREATE TYPE "CommentableType" AS ENUM ('COMMENT', 'POST', 'PRODUCT', 'REVIEW');

-- AlterTable: convert commentableType TEXT -> CommentableType enum
ALTER TABLE "comments"
    ALTER COLUMN "commentableType" TYPE "CommentableType"
    USING "commentableType"::"CommentableType";
