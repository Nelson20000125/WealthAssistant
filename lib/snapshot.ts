import { prisma } from "@/lib/prisma";
import { getPortfolioSummary } from "@/lib/portfolio";

/**
 * 吉隆坡时区的"今天"，存成该日历日的 UTC 零点。
 * 不直接用 new Date() 的 UTC 日期：马来西亚是 UTC+8，早上 8 点前刷新行情
 * 会被记到"昨天"，用 Intl 按时区取日历日就没这个问题。
 */
export function todaySnapshotDate(): Date {
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * 把当前组合状态写进当日快照（一天一条，重复调用只覆盖不重复）。
 * 挂在 refresh-prices 成功之后调用；手动补录用 scripts/backfill-snapshot.ts。
 */
export async function upsertTodaySnapshot(userId: string) {
  const summary = await getPortfolioSummary(userId);
  const cashMYR =
    summary.allocation.find((a) => a.assetType === "CASH")?.valueMYR ?? 0;

  const data = {
    netWorthMYR: summary.netWorthMYR,
    investedMYR: summary.netWorthMYR - cashMYR,
    cashMYR,
    costMYR: summary.costMYR,
    byAssetType: JSON.stringify(
      summary.allocation.map(({ assetType, valueMYR }) => ({ assetType, valueMYR }))
    ),
  };

  const date = todaySnapshotDate();
  return prisma.portfolioSnapshot.upsert({
    where: { userId_date: { userId, date } },
    update: data,
    create: { userId, date, ...data },
  });
}
