-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "netWorthMYR" REAL NOT NULL,
    "investedMYR" REAL NOT NULL,
    "cashMYR" REAL NOT NULL,
    "costMYR" REAL NOT NULL,
    "byAssetType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_date_key" ON "PortfolioSnapshot"("date");
