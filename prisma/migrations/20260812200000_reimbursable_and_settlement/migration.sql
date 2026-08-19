-- 垫付 / 还款：垫钱请客不是费用而是应收，还款不是收入而是应收回收。
-- 三个栏位全部可空或带预设值，既有资料加上去之后行为不变。
--
-- 用 ADD COLUMN 而不是 Prisma 惯用的 RedefineTables：这里只是加栏位，
-- 不必搬表。搬表会重建 Transaction，那张表现在有 62 笔真实流水与多条外键，
-- 风险跟收益不成比例。

-- AlterTable: 支出里「垫付给别人、预期会收回」的金额
ALTER TABLE "Transaction" ADD COLUMN "reimbursable" REAL;

-- AlterTable: 还款笔指回被冲销的那笔垫付支出（自关联，一笔垫付可被多笔还款冲销）
ALTER TABLE "Transaction" ADD COLUMN "settlesTransactionId" TEXT REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: 查「这笔垫付收到了哪些还款」会走这个方向
CREATE INDEX "Transaction_settlesTransactionId_idx" ON "Transaction"("settlesTransactionId");

-- AlterTable: 分类层级的「不计入汇总」开关，给内部转账性质的分类用
ALTER TABLE "Category" ADD COLUMN "countsInTotals" BOOLEAN NOT NULL DEFAULT true;
