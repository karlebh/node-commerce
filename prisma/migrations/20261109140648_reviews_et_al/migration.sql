-- AlterTable
ALTER TABLE "users" ALTER COLUMN "unsubscribeToken" SET DEFAULT gen_random_uuid()::text;
