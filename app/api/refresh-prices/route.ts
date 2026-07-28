import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStockPrice, getFxRate } from "@/lib/marketData";
import { upsertTodaySnapshot } from "@/lib/snapshot";

export async function POST() {
  const session = await auth();
  const userId = session!.user.id;

  const holdings = await prisma.holding.findMany({
    where: { symbol: { not: null }, assetType: { not: "CASH" }, account: { userId } },
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

  let fx;
  try {
    fx = await getFxRate("USD", "MYR");
  } catch (error) {
    fx = { error: (error as Error).message };
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

  return NextResponse.json({ prices, fx: { pair: "USD/MYR", ...fx }, snapshot });
}
