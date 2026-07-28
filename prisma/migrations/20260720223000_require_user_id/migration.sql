-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("createdAt", "currency", "id", "institution", "name", "type", "updatedAt", "userId") SELECT "createdAt", "currency", "id", "institution", "name", "type", "updatedAt", "userId" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("id", "name", "type", "userId") SELECT "id", "name", "type", "userId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_userId_name_type_key" ON "Category"("userId", "name", "type");
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "targetDate" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("createdAt", "currency", "id", "name", "notes", "targetAmount", "targetDate", "userId") SELECT "createdAt", "currency", "id", "name", "notes", "targetAmount", "targetDate", "userId" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE TABLE "new_ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImportBatch" ("fileName", "id", "importedAt", "userId") SELECT "fileName", "id", "importedAt", "userId" FROM "ImportBatch";
DROP TABLE "ImportBatch";
ALTER TABLE "new_ImportBatch" RENAME TO "ImportBatch";
CREATE TABLE "new_PortfolioSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "netWorthMYR" REAL NOT NULL,
    "investedMYR" REAL NOT NULL,
    "cashMYR" REAL NOT NULL,
    "costMYR" REAL NOT NULL,
    "byAssetType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortfolioSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PortfolioSnapshot" ("byAssetType", "cashMYR", "costMYR", "createdAt", "date", "id", "investedMYR", "netWorthMYR", "userId") SELECT "byAssetType", "cashMYR", "costMYR", "createdAt", "date", "id", "investedMYR", "netWorthMYR", "userId" FROM "PortfolioSnapshot";
DROP TABLE "PortfolioSnapshot";
ALTER TABLE "new_PortfolioSnapshot" RENAME TO "PortfolioSnapshot";
CREATE UNIQUE INDEX "PortfolioSnapshot_userId_date_key" ON "PortfolioSnapshot"("userId", "date");
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT,
    "source" TEXT NOT NULL,
    "importBatchId" TEXT,
    "holdingId" TEXT,
    "units" REAL,
    "unitPrice" REAL,
    "cashHoldingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_cashHoldingId_fkey" FOREIGN KEY ("cashHoldingId") REFERENCES "Holding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "cashHoldingId", "categoryId", "createdAt", "currency", "date", "description", "holdingId", "id", "importBatchId", "source", "type", "unitPrice", "units", "userId") SELECT "amount", "cashHoldingId", "categoryId", "createdAt", "currency", "date", "description", "holdingId", "id", "importBatchId", "source", "type", "unitPrice", "units", "userId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

