-- AlterTable：估值方式。预设 AUTO，回填脚本会依 assetType/symbol 改成正确值。
ALTER TABLE "Holding" ADD COLUMN "valuation" TEXT NOT NULL DEFAULT 'AUTO';

-- CreateTable：手动估值的价格历史
CREATE TABLE "HoldingPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holdingId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "price" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HoldingPrice_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HoldingPrice_holdingId_date_key" ON "HoldingPrice"("holdingId", "date");

-- CreateIndex
CREATE INDEX "HoldingPrice_holdingId_date_idx" ON "HoldingPrice"("holdingId", "date");
