import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStockPrice, getFxRate } from "@/lib/marketData";
import { upsertTodaySnapshot } from "@/lib/snapshot";

export async function POST() {
  const session = await auth();
  const userId = session!.user.id;

  // 依 valuation 而不是 symbol 判断。原本的 `symbol != null` 会把无代号的
  // 手动估值持仓（Public Mutual 基金、定存、房产）一起纳入判断范围之外，
  // 但那些持仓的价格本来就不该由行情 API 决定 —— 现在语义直接写在栏位上。
  const holdings = await prisma.holding.findMany({
    where: { valuation: "AUTO", symbol: { not: null }, account: { userId } },
  });

  const prices = [];
  for (const holding of holdings) {
    try {
      const { price, cached } = await getStockPrice(holding.symbol!);
      await prisma.holding.update({
        where: { id: holding.id },
        data: { lastPrice: price, priceAsOf: new Date() },
      });
      prices.push({ symbol: holding.symbol, price, cached });
    } catch (error) {
      prices.push({ symbol: holding.symbol, error: (error as Error).message });
    }
  }

  // 汇率：抓「持仓里实际出现过的每一个非 MYR 币种」，不写死 USD。
  // 写死 USD 的后果是任何其他币种永远拿不到汇率，而缺汇率的持仓会被
  // getPortfolioSummary 静默排除在净资产之外——数字会安静地少一截。
  const currencyRows = await prisma.holding.findMany({
    where: { account: { userId } },
    select: { currency: true },
    distinct: ["currency"],
  });
  const currencies = currencyRows.map((r) => r.currency).filter((c) => c !== "MYR");

  const fx = [];
  for (const base of currencies) {
    try {
      const { rate, cached } = await getFxRate(base, "MYR");
      fx.push({ pair: `${base}/MYR`, rate, cached });
    } catch (error) {
      fx.push({ pair: `${base}/MYR`, error: (error as Error).message });
    }
  }

  // 价格/汇率刷新后顺手记一笔当日净值快照（净值折线图的数据来源）。
  // 快照失败不该让整个刷新报错，单独 catch。
  let snapshot;
  try {
    const s = await upsertTodaySnapshot(userId);
    snapshot = { date: s.date, netWorthMYR: s.netWorthMYR };
  } catch (error) {
    snapshot = { error: (error as Error).message };
  }

  return NextResponse.json({ prices, fx, snapshot });
}
