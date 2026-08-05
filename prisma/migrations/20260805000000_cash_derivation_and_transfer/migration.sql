-- AlterTable
ALTER TABLE "Holding" ADD COLUMN "openingBalance" REAL;
ALTER TABLE "Holding" ADD COLUMN "openingBalanceDate" DATETIME;
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "counterCashHoldingId" TEXT,
    "counterAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_cashHoldingId_fkey" FOREIGN KEY ("cashHoldingId") REFERENCES "Holding" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_counterCashHoldingId_fkey" FOREIGN KEY ("counterCashHoldingId") REFERENCES "Holding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "cashHoldingId", "categoryId", "createdAt", "currency", "date", "description", "holdingId", "id", "importBatchId", "source", "type", "unitPrice", "units", "userId") SELECT "amount", "cashHoldingId", "categoryId", "createdAt", "currency", "date", "description", "holdingId", "id", "importBatchId", "source", "type", "unitPrice", "units", "userId" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
