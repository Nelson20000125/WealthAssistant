import { prisma } from "@/lib/prisma";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getMonthCashflow } from "@/lib/transactions";
import { emergencyFundMonths, emergencyFundVerdict } from "@/lib/portfolioIntelligence";

// 单一财务口径（§36）。Dashboard、报告、AI 顾问都读这一份，
// 谁都不准自己再算一套余额 —— 三个地方各算各的，数字就会开始打架。

export type FinancialSummary = {
  cashMYR: number;
  investmentMYR: number;
  netWorthMYR: number;
  /** 有记录的月份的平均，没记账的月份不计入（0 支出几乎都代表没记，不是没花） */
  avgMonthlyIncomeMYR: number | null;
  avgMonthlyExpenseMYR: number | null;
  savingsRate: number | null;
  emergencyFundMonths: number | null;
  emergencyFund: ReturnType<typeof emergencyFundVerdict>;
  /** 平均取样用到的月份数 */
  monthsSampled: number;
  /** 最后一笔记录的日期（YYYY-MM-DD）；没有任何记录为 null */
  dataAsOf: string | null;
  /** 超过 STALE_DAYS 天没记账：以上数字可能建立在过期资料上 */
  isStale: boolean;
};

const STALE_DAYS = 7;

const LOOKBACK_MONTHS = 3;

export async function getFinancialSummary(
  userId: string,
  today = new Date()
): Promise<FinancialSummary> {
  const portfolio = await getPortfolioSummary(userId);

  // 往回取 LOOKBACK_MONTHS 个完整月（不含当月：当月还没过完，
  // 把半个月的支出当成一整月会让月均凭空缩水，应急金月数随之虚高）
  const months = Array.from({ length: LOOKBACK_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (i + 1), 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  });
  const cashflows = await Promise.all(
    months.map((m) => getMonthCashflow(userId, m.year, m.month))
  );

  const last = await prisma.transaction.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const dataAsOf = last ? last.date.toISOString().slice(0, 10) : null;
  const isStale =
    !last || today.getTime() - last.date.getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;

  // 只取「记账已覆盖到月底」的月份：最后一笔在 9/3 时，9 月只有三天的资料，
  // 拿它跟完整月份一起平均会把月均收入凭空砍半（2026-10 踩过）
  const coveredThroughMonthEnd = (m: { year: number; month: number }) =>
    !!last && last.date.getTime() >= Date.UTC(m.year, m.month, 0);
  const recorded = cashflows.filter(
    (c, i) => coveredThroughMonthEnd(months[i]) && (c.totals.expense > 0 || c.totals.income > 0)
  );
  const monthsSampled = recorded.length;
  const avg = (pick: (c: (typeof cashflows)[number]) => number) =>
    monthsSampled > 0 ? recorded.reduce((sum, c) => sum + pick(c), 0) / monthsSampled : null;

  const avgMonthlyIncomeMYR = avg((c) => c.totals.income);
  const avgMonthlyExpenseMYR = avg((c) => c.totals.expense);

  const cashMYR = portfolio.allocation.find((a) => a.assetType === "CASH")?.valueMYR ?? 0;
  const efMonths =
    avgMonthlyExpenseMYR === null ? null : emergencyFundMonths(cashMYR, avgMonthlyExpenseMYR);

  return {
    cashMYR,
    investmentMYR: portfolio.netWorthMYR - cashMYR,
    netWorthMYR: portfolio.netWorthMYR,
    avgMonthlyIncomeMYR,
    avgMonthlyExpenseMYR,
    savingsRate:
      avgMonthlyIncomeMYR !== null && avgMonthlyIncomeMYR > 0 && avgMonthlyExpenseMYR !== null
        ? (avgMonthlyIncomeMYR - avgMonthlyExpenseMYR) / avgMonthlyIncomeMYR
        : null,
    emergencyFundMonths: efMonths,
    emergencyFund: emergencyFundVerdict(efMonths),
    monthsSampled,
    dataAsOf,
    isStale,
  };
}
