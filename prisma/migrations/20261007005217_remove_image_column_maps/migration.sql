/*
  Warnings:

  - You are about to drop the column `created_at` on the `images` table. All the data in the column will be lost.
  - You are about to drop the column `imageable_id` on the `images` table. All the data in the column will be lost.
  - You are about to drop the column `imageable_type` on the `images` table. All the data in the column will be lost.
  - Added the required column `imageableId` to the `images` table without a default value. This is not possible if the table is not empty.
  - Added the required column `imageableType` to the `images` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "imageableId" TEXT NOT NULL,
    "imageableType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_images" ("id", "url") SELECT "id", "url" FROM "images";
DROP TABLE "images";
ALTER TABLE "new_images" RENAME TO "images";
CREATE INDEX "images_imageableType_imageableId_idx" ON "images"("imageableType", "imageableId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
