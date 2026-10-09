/*
  Warnings:

  - You are about to alter the column `size` on the `images` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "imageableId" TEXT NOT NULL,
    "imageableType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_images" ("createdAt", "id", "imageableId", "imageableType", "size", "url") SELECT "createdAt", "id", "imageableId", "imageableType", "size", "url" FROM "images";
DROP TABLE "images";
ALTER TABLE "new_images" RENAME TO "images";
CREATE INDEX "images_imageableType_imageableId_idx" ON "images"("imageableType", "imageableId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
