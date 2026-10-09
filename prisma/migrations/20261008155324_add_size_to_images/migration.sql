/*
  Warnings:

  - Added the required column `size` to the `images` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "imageableId" TEXT NOT NULL,
    "imageableType" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_images" ("createdAt", "id", "imageableId", "imageableType", "url") SELECT "createdAt", "id", "imageableId", "imageableType", "url" FROM "images";
DROP TABLE "images";
ALTER TABLE "new_images" RENAME TO "images";
CREATE INDEX "images_imageableType_imageableId_idx" ON "images"("imageableType", "imageableId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
