import { prisma } from "@/lib/prisma";

function rateFor(currency: string, fxRates: { base: string; quote: string; rate: number }[]) {
  if (currency === "MYR") return 1;
  return fxRates.find((r) => r.base === currency && r.quote === "MYR")?.rate ?? null;
}

export async function getPortfolioSummary(userId: string) {
  const [accounts, fxRates] = await Promise.all([
    prisma.account.findMany({ where: { userId }, include: { holdings: true } }),
    prisma.fxRate.findMany(),
  ]);

  let netWorthMYR = 0;
  let costMYR = 0;
  const allocationByAssetType = new Map<string, number>();
  const allocationByAccount = new Map<string, number>();
  const holdings = [];

  for (const account of accounts) {
    for (const h of account.holdings) {
      const rate = rateFor(h.currency, fxRates);
      const unitPrice = h.lastPrice ?? h.costBasis;
      const valueMYR = rate !== null ? h.quantity * unitPrice * rate : null;
      const costValueMYR = rate !== null ? h.quantity * h.costBasis * rate : null;

      if (valueMYR !== null) {
        netWorthMYR += valueMYR;
        allocationByAssetType.set(
          h.assetType,
          (allocationByAssetType.get(h.assetType) ?? 0) + valueMYR
        );
        allocationByAccount.set(
          account.name,
          (allocationByAccount.get(account.name) ?? 0) + valueMYR
        );
      }
      if (costValueMYR !== null) costMYR += costValueMYR;

      holdings.push({
        id: h.id,
        accountId: h.accountId,
        accountName: account.name,
        assetType: h.assetType,
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        costBasis: h.costBasis,
        currency: h.currency,
        unitPrice,
        priceAsOf: h.priceAsOf,
        valueMYR,
        costValueMYR,
        fxMissing: rate === null,
      });
    }
  }

  return {
    netWorthMYR,
    costMYR,
    unrealizedPLMYR: netWorthMYR - costMYR,
    unrealizedPLPct: costMYR > 0 ? (netWorthMYR - costMYR) / costMYR : 0,
    allocation: Array.from(allocationByAssetType.entries()).map(([assetType, valueMYR]) => ({
      assetType,
      valueMYR,
      pct: netWorthMYR > 0 ? valueMYR / netWorthMYR : 0,
    })),
    allocationByAccount: Array.from(allocationByAccount.entries()).map(([accountName, valueMYR]) => ({
      accountName,
      valueMYR,
      pct: netWorthMYR > 0 ? valueMYR / netWorthMYR : 0,
    })),
    holdings,
  };
}

// ---- 净值历史（PortfolioSnapshot）----

export type HistoryRange = "1M" | "3M" | "YTD" | "1Y" | "MAX";

function rangeStart(range: HistoryRange): Date | undefined {
  const now = new Date();
  switch (range) {
    case "1M":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate()));
    case "3M":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()));
    case "1Y":
      return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
    case "YTD":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case "MAX":
      return undefined;
  }
}

/**
 * 按区间取净值历史序列（升序），给首页折线图用。
 * 每个点附带相对区间首点的收益，方便 Ghostfolio 式「区间涨跌」展示。
 */
export async function getNetWorthHistory(userId: string, range: HistoryRange = "MAX") {
  const gte = rangeStart(range);
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: gte ? { userId, date: { gte } } : { userId },
    orderBy: { date: "asc" },
  });

  const points = snapshots.map((s) => ({
    date: s.date,
    netWorthMYR: s.netWorthMYR,
    investedMYR: s.investedMYR,
    cashMYR: s.cashMYR,
    // 未实现损益（对总投入成本），跟 getPortfolioSummary 的口径一致
    plMYR: s.netWorthMYR - s.costMYR,
    plPct: s.costMYR > 0 ? (s.netWorthMYR - s.costMYR) / s.costMYR : 0,
  }));

  const first = points[0];
  return {
    range,
    points,
    // 区间变化：现值 vs 区间首点（快照少于 2 条时为 null，前端显示空状态）
    changeMYR: points.length >= 2 ? points[points.length - 1].netWorthMYR - first.netWorthMYR : null,
    changePct:
      points.length >= 2 && first.netWorthMYR > 0
        ? (points[points.length - 1].netWorthMYR - first.netWorthMYR) / first.netWorthMYR
        : null,
  };
}
