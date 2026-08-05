import { prisma } from "@/lib/prisma";

/**
 * 现金余额由流水推导，不可手改（决策 2026-07-29）。
 *
 *   余额 = openingBalance + Σ(期初日之后、动到这个现金池的流水)
 *
 * 只有设了 openingBalance / openingBalanceDate 的 CASH 持仓才走推导；
 * 没设的回传 undefined，呼叫端沿用 costBasis。
 *
 * 为什么挂在 Holding 而不是 Account：多币种户口（Wise）一个 Account 底下
 * 可以有多个币种余额，只知道「哪个户口」无法确定动的是哪一个池子。
 */
export async function getDerivedCashBalances(userId: string): Promise<Map<string, number>> {
  const cashHoldings = await prisma.holding.findMany({
    where: {
      account: { userId },
      assetType: "CASH",
      openingBalance: { not: null },
      openingBalanceDate: { not: null },
    },
    select: { id: true, openingBalance: true, openingBalanceDate: true },
  });

  const result = new Map<string, number>();
  if (cashHoldings.length === 0) return result;

  const ids = cashHoldings.map((h) => h.id);

  // 一次捞完所有相关流水，避免 N+1。两侧都要看：
  // 本侧 cashHoldingId（钱出去/进来），对手侧 counterCashHoldingId（转帐转进来）。
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      OR: [{ cashHoldingId: { in: ids } }, { counterCashHoldingId: { in: ids } }],
    },
    select: {
      date: true,
      amount: true,
      type: true,
      cashHoldingId: true,
      counterCashHoldingId: true,
      counterAmount: true,
    },
  });

  for (const h of cashHoldings) {
    let balance = h.openingBalance!;
    const since = h.openingBalanceDate!;

    for (const t of txs) {
      // 期初日当天及之前的流水不计——期初余额已经含了它们
      if (t.date <= since) continue;

      if (t.cashHoldingId === h.id) {
        // 本侧：收入进帐；支出/投资/转出都是扣款
        balance += t.type === "INCOME" ? t.amount : -t.amount;
      }
      if (t.counterCashHoldingId === h.id) {
        // 对手侧：转帐/换汇转入。换汇两边金额不等，所以优先用 counterAmount，
        // 没填才退回 amount（同币种转帐）。
        balance += t.counterAmount ?? t.amount;
      }
    }

    result.set(h.id, balance);
  }

  return result;
}
