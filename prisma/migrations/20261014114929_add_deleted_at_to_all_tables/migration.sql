-- AlterTable
ALTER TABLE "Cart" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "images" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "likes" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deletedAt" DATETIME;
