DROP INDEX "idempotency_keys_idempotentableType_idempotentableId_idx";

ALTER TABLE "idempotency_keys"
DROP COLUMN "idempotentableId",
DROP COLUMN "idempotentableType",
DROP COLUMN "deletedAt";

DROP TYPE "IdempotentableType";
