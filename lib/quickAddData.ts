import { prisma } from "@/lib/prisma";
import { listCategories, listOutstandingReimbursements } from "@/lib/transactions";
import { getCashPools, pickDefaultCashPool } from "@/lib/cashBalance";

/**
 * 全域「记一笔」面板要的资料。挂在 layout 上，所以每一页都会跑一次 ——
 * 四个查询都只捞选项清单（分类、持仓、户口、待收回），没有流水扫描。
 */
export async function getQuickAddData(userId: string) {
  const [categories, holdings, accounts, cashPools, outstanding] = await Promise.all([
    listCategories(userId),
    prisma.holding.findMany({
      where: { account: { userId } },
      select: {
        id: true,
        name: true,
        symbol: true,
        assetType: true,
        currency: true,
        lastPrice: true,
        costBasis: true,
      },
      orderBy: { name: "asc" },
    }),
    // 投资表单要能就地建目标持仓，不然使用者得跳去持仓页再回来
    prisma.account.findMany({
      where: { userId },
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
    }),
    getCashPools(userId),
    listOutstandingReimbursements(userId),
  ]);

  return {
    categories,
    holdings,
    accounts,
    outstanding,
    defaultCashHoldingId: pickDefaultCashPool(cashPools),
  };
}
