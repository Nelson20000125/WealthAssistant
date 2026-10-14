import { prisma } from "@/lib/prisma";
import { getDerivedCashBalances } from "@/lib/cashBalance";

function rateFor(currency: string, fxRates: { base: string; quote: string; rate: number }[]) {
  if (currency === "MYR") return 1;
  return fxRates.find((r) => r.base === currency && r.quote === "MYR")?.rate ?? null;
}

export async function getPortfolioSummary(userId: string) {
  const [accounts, fxRates, derivedCash, manualPrices] = await Promise.all([
    prisma.account.findMany({ where: { userId }, include: { holdings: true } }),
    prisma.fxRate.findMany(),
    getDerivedCashBalances(userId),
    // 手动估值持仓的最新一笔价格。distinct + orderBy desc 取每个持仓的最新日，
    // 补录过去日期不会覆盖更新的价（补录只影响历史快照重算，不影响当前估值）。
    prisma.holdingPrice.findMany({
      where: { holding: { account: { userId } } },
      orderBy: { date: "desc" },
      distinct: ["holdingId"],
    }),
  ]);

  const manualPriceBy = new Map(manualPrices.map((p) => [p.holdingId, p]));

  let netWorthMYR = 0;
  let costMYR = 0;
  const allocationByAssetType = new Map<string, number>();
  const allocationByAccount = new Map<string, number>();
  // 投资表现：按币种原生累计。决策 2026-07-29——汇率变动不算作报酬，
  // 所以这里绝不能乘 rate，也绝不跨币种加总。
  const perfByCurrency = new Map<string, { costNative: number; valueNative: number }>();
  const holdings = [];

  for (const account of accounts) {
    for (const h of account.holdings) {
      const rate = rateFor(h.currency, fxRates);
      // 手动估值优先：MANUAL_UNIT_PRICE 存每单位价，MANUAL_VALUE 存总市值（quantity 恒为 1），
      // 两者算式相同，不需分支。AUTO 型没有 HoldingPrice 纪录，自然落回行情快取。
      // 都没有才退回 costBasis —— 那代表这笔持仓从没估过值，盈亏会显示为 0。
      const manual = manualPriceBy.get(h.id);
      const unitPrice = manual?.price ?? h.lastPrice ?? h.costBasis;

      // 现金：余额来自流水推导，不看 costBasis。推导不出来（没设期初）才退回旧算法。
      const derived = h.assetType === "CASH" ? derivedCash.get(h.id) : undefined;
      const nativeValue = derived ?? h.quantity * unitPrice;
      const nativeCost = derived ?? h.quantity * h.costBasis;

      const valueMYR = rate !== null ? nativeValue * rate : null;
      const costValueMYR = rate !== null ? nativeCost * rate : null;

      // CASH 排除：现金成本恒等于市值，计入只会把报酬率稀释向 0。
      // 注意这段不依赖 rate——汇率抓不到时，投资表现照样算得出来。
      if (h.assetType !== "CASH") {
        const bucket = perfByCurrency.get(h.currency) ?? { costNative: 0, valueNative: 0 };
        bucket.costNative += h.quantity * h.costBasis;
        bucket.valueNative += h.quantity * unitPrice;
        perfByCurrency.set(h.currency, bucket);
      }

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
        valuation: h.valuation,
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        costBasis: h.costBasis,
        currency: h.currency,
        unitPrice,
        // 手动估值的持仓，「几时估的」看的是 HoldingPrice 的日期，不是行情快取时间
        priceAsOf: manual?.date ?? h.priceAsOf,
        // 手动型但一笔价都没填过 —— 现值等于成本，盈亏恒为 0。UI 要能标出来，
        // 否则使用者看到的 0% 会被当成「没涨没跌」而不是「没估过值」。
        needsValuation:
          (h.valuation === "MANUAL_UNIT_PRICE" || h.valuation === "MANUAL_VALUE") &&
          manual === undefined,
        valueMYR,
        costValueMYR,
        fxMissing: rate === null,
        // 现金专用：余额是推导出来的，UI 应显示为唯读
        derivedBalance: derived,
        isDerivedCash: derived !== undefined,
        openingBalance: h.openingBalance,
        openingBalanceDate: h.openingBalanceDate,
      });
    }
  }

  return {
    netWorthMYR,
    costMYR,
    // 「我投资做得好不好」——每个币种一行，各自用原生货币计价。
    // 刻意不提供跨币种加总的 unrealizedPLMYR / unrealizedPLPct：
    // 那个百分比会随汇率浮动，即使所有资产纹丝不动，跟决策 2 冲突。
    performanceByCurrency: Array.from(perfByCurrency.entries())
      .map(([currency, b]) => ({
        currency,
        costNative: b.costNative,
        valueNative: b.valueNative,
        plNative: b.valueNative - b.costNative,
        plPct: b.costNative > 0 ? (b.valueNative - b.costNative) / b.costNative : 0,
      }))
      .sort((a, b) => b.valueNative - a.valueNative),
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

  const split = splitContributionAndReturn(snapshots);
  return {
    range,
    points,
    // 区间净值变化（快照少于 2 条时为 null，前端显示空状态）
    changeMYR: split?.changeMYR ?? null,
    // 净投入与投资收益必须分开报（P0-05）：把自己存进去的钱算成涨幅，
    // 会得出「+19.7%」这种看了就想加码的假报酬率。
    contributionMYR: split?.contributionMYR ?? null,
    returnMYR: split?.returnMYR ?? null,
    returnPct: split?.returnPct ?? null,
  };
}

/**
 * 把区间净值变化拆成「自己存进去的」与「市场给的」。
 *
 * 成本（costMYR）只有在追加投入时才会变，所以它的增量就是净投入；
 * 净值变化减掉净投入，剩下的才是投资收益。这跟 plMYR = netWorth − cost
 * 是同一个口径，两处数字永远对得上。
 */
export function splitContributionAndReturn(
  points: { netWorthMYR: number; costMYR: number }[]
) {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];

  const changeMYR = last.netWorthMYR - first.netWorthMYR;
  const contributionMYR = last.costMYR - first.costMYR;
  const returnMYR = changeMYR - contributionMYR;

  // 分母用期间平均投入成本：期初成本为 0（从零开始投）时用它当分母会除以零，
  // 用期末成本又会低估中途才投进去的钱的报酬率。
  const avgCost = (first.costMYR + last.costMYR) / 2;
  return {
    changeMYR,
    contributionMYR,
    returnMYR,
    returnPct: avgCost > 0 ? returnMYR / avgCost : null,
  };
}
