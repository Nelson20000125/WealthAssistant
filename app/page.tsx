import { auth } from "@/auth";
import { getPortfolioSummary, getNetWorthHistory } from "@/lib/portfolio";
import { getMonthCashflow, hasTransactionToday } from "@/lib/transactions";
import { computePortfolioHealth } from "@/lib/portfolioIntelligence";
import { formatMYR, formatPct } from "@/lib/format";
import CountUpValue from "@/components/CountUpValue";
import DonutChart from "@/components/DonutChart";
import AllocationBar from "@/components/AllocationBar";
import AccountBreakdown from "@/components/AccountBreakdown";
import HoldingsGrid from "@/components/HoldingsGrid";
import Leaderboard from "@/components/Leaderboard";
import Link from "next/link";
import { WalletIcon, TrophyIcon, SparkleIcon } from "@/components/icons";
import Value from "@/components/Value";
import NetWorthChart, { type History } from "@/components/NetWorthChart";
import PortfolioSummaryCard from "@/components/PortfolioSummaryCard";
import RefreshPricesButton from "@/components/RefreshPricesButton";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ETF: "股票/ETF",
  STOCK: "股票/ETF",
  FUND: "基金",
  CASH: "现金",
  CRYPTO: "加密货币",
};

const ASSET_TYPE_COLOR: Record<string, string> = {
  ETF: "var(--series-1)",
  STOCK: "var(--series-1)",
  FUND: "var(--series-2)",
  CASH: "var(--series-3)",
  CRYPTO: "var(--series-4)",
};

// 各大区块的入场错落延迟（ms），跟 fade-rise 动画配合，纯用 CSS animation-delay 实现
const SECTION_DELAY = [0, 60, 120, 180, 240, 300, 360];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "晚上好";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export default async function OverviewPage() {
  const session = await auth();
  const userId = session!.user.id;
  const summary = await getPortfolioSummary(userId);
  const health = computePortfolioHealth(summary);
  const displayName = session!.user.name ?? session!.user.email?.split("@")[0];

  // 最近一次抓到报价的时间：取所有持仓 priceAsOf 的最大值，给「更新报价」按钮显示
  const priceTimes = summary.holdings
    .map((h) => h.priceAsOf)
    .filter((d): d is Date => d instanceof Date);
  const lastPriceAt =
    priceTimes.length > 0
      ? new Date(Math.max(...priceTimes.map((d) => d.getTime()))).toISOString()
      : null;

  // 净值历史：Prisma client 还没重新生成（缺 PortfolioSnapshot 模型）时会 throw，
  // 降级成 null 让图表区显示空状态，别把整个总览页拖挂
  let history: History | null = null;
  try {
    const h = await getNetWorthHistory(userId, "MAX");
    history = {
      range: h.range,
      changeMYR: h.changeMYR,
      changePct: h.changePct,
      points: h.points.map((p) => ({
        date: p.date.toISOString(),
        netWorthMYR: p.netWorthMYR,
        plMYR: p.plMYR,
        plPct: p.plPct,
      })),
    };
  } catch {
    history = null;
  }

  // 本月现金流 + 今日是否已记账（记账表还没生成 client 时降级隐藏，不拖挂页面）
  const now = new Date();
  let cashflowTotals: { income: number; expense: number; invest: number; net: number } | null = null;
  let recordedToday = true; // 降级时不显示催记账横幅
  try {
    const [cf, recorded] = await Promise.all([
      getMonthCashflow(userId, now.getFullYear(), now.getMonth() + 1),
      hasTransactionToday(userId),
    ]);
    cashflowTotals = cf.totals;
    recordedToday = recorded;
  } catch {
    cashflowTotals = null;
  }

  const donutSegments = summary.allocation.map((a) => ({
    key: a.assetType,
    label: ASSET_TYPE_LABEL[a.assetType] ?? a.assetType,
    valueMYR: a.valueMYR,
    pct: a.pct,
    color: ASSET_TYPE_COLOR[a.assetType] ?? "var(--ink-muted)",
  }));

  const cashValueMYR = summary.allocation.find((a) => a.assetType === "CASH")?.valueMYR ?? 0;
  const portfolioValueMYR = summary.netWorthMYR - cashValueMYR;
  const countCash = summary.holdings.length;

  return (
    <div className="flex flex-col gap-8">
      <div
        className="animate-in flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4"
        style={{ animationDelay: `${SECTION_DELAY[0]}ms` }}
      >
        <div>
          <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">
            Investment OS
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">
            {displayName ? `${greeting()}，${displayName}` : greeting()}
          </h1>
        </div>
        <RefreshPricesButton lastPriceAt={lastPriceAt} />
      </div>

      {/* 今日未记账提醒（与 Cowork 23:00 定时提醒双保险） */}
      {!recordedToday && (
        <Link
          href="/cashflow?add=1"
          className="card card-interactive animate-in flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          style={{ borderColor: "color-mix(in srgb, var(--portfolio-accent) 45%, var(--line))" }}
        >
          <span className="text-sm text-ink">今天还没记账 · 花了什么、进了什么，顺手记一笔</span>
          <span className="shrink-0 text-sm font-medium text-portfolio-accent-deep">+ 记一笔</span>
        </Link>
      )}

      {/* Ghostfolio 式 hero：整块居中的大数字 + 净值曲线 + 区间 chips，
          「我的钱现在有多少、走势如何」一眼看完，其余卡片全部下移 */}
      <div className="card animate-in px-4 py-6 sm:px-6 sm:py-8" style={{ animationDelay: `${SECTION_DELAY[1]}ms` }}>
        <div className="flex items-center justify-center gap-2 text-sm text-ink-muted">
          <WalletIcon className="h-4 w-4" />
          净资产（MYR）
        </div>
        <CountUpValue
          value={summary.netWorthMYR}
          format="myr"
          durationMs={800}
          // 货币格式里的空格是不换行空格，整串没法断行 —— 小屏只能靠缩字级避免横向溢出
          className="mt-2 block text-center text-4xl font-semibold tracking-tight text-ink tabular-nums sm:text-6xl"
        />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-sm font-medium">
          {summary.performanceByCurrency.map((p) => (
            <span key={p.currency}>
              <Value value={p.plNative} currency={p.currency} colorizeSign />{" "}
              (<Value value={p.plPct} kind="percent" colorizeSign />)
              <span className="ml-1 text-ink-muted">{p.currency} 未实现损益</span>
            </span>
          ))}
        </div>

        <NetWorthChart initial={history} />

        <div className="mx-auto mt-8 grid max-w-xl grid-cols-3 gap-4 border-t border-line pt-6 text-center">
          <div>
            <div className="text-xs text-ink-muted">投资部位</div>
            <CountUpValue
              value={portfolioValueMYR}
              format="myr-compact"
              className="mt-1 block text-lg font-medium text-ink tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-ink-muted">现金部位</div>
            <CountUpValue
              value={cashValueMYR}
              format="myr-compact"
              className="mt-1 block text-lg font-medium text-ink tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-ink-muted">总成本</div>
            <CountUpValue
              value={summary.costMYR}
              format="myr-compact"
              className="mt-1 block text-lg font-medium text-ink tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* 主栏（资产配置 + 持仓预览）+ 侧栏（户口分布 + 排行 + AI 顾问入口） */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[2]}ms` }}>
            <div className="mb-5 text-sm font-medium text-ink">资产配置</div>
            <DonutChart
              segments={donutSegments}
              centerLabel="净资产"
              centerValue={formatMYR(summary.netWorthMYR, true)}
            />
            <div className="mt-6 border-t border-line pt-5">
              <AllocationBar segments={summary.allocation} />
            </div>
          </div>

          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[4]}ms` }}>
            <div className="mb-5 flex items-baseline justify-between">
              <div className="text-sm font-medium text-ink">持仓明细</div>
              <div className="text-xs text-ink-muted">共 {countCash} 笔</div>
            </div>
            <HoldingsGrid holdings={summary.holdings} netWorthMYR={summary.netWorthMYR} />
          </div>
        </div>

        <div className="flex flex-col gap-8 lg:col-span-1">
          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[3]}ms` }}>
            <div className="mb-3 text-sm font-medium text-ink">组合摘要</div>
            <PortfolioSummaryCard
              costMYR={summary.costMYR}
              netWorthMYR={summary.netWorthMYR}
              investedMYR={portfolioValueMYR}
              cashMYR={cashValueMYR}
              performanceByCurrency={summary.performanceByCurrency}
              holdingsCount={summary.holdings.length}
              accountsCount={summary.allocationByAccount.length}
            />
          </div>

          {cashflowTotals && (
            <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[3]}ms` }}>
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-sm font-medium text-ink">本月现金流</div>
                <Link href="/cashflow" className="text-xs text-ink-muted hover:text-ink">明细 →</Link>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline justify-between py-1">
                  <span className="text-sm text-ink-secondary">收入</span>
                  <Value value={cashflowTotals.income} className="text-sm text-good" />
                </div>
                <div className="flex items-baseline justify-between py-1">
                  <span className="text-sm text-ink-secondary">支出</span>
                  <Value value={cashflowTotals.expense} className="text-sm text-ink" />
                </div>
                <div className="flex items-baseline justify-between py-1">
                  <span className="text-sm text-ink-secondary">投资</span>
                  <Value value={cashflowTotals.invest} className="text-sm text-portfolio-accent-deep" />
                </div>
                <hr className="my-2 border-line" />
                <div className="flex items-baseline justify-between py-1">
                  <span className="text-sm font-medium text-ink">结余</span>
                  <Value value={cashflowTotals.net} colorizeSign className="text-sm font-medium" />
                </div>
              </div>
            </div>
          )}

          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[4]}ms` }}>
            <div className="mb-5 text-sm font-medium text-ink">按户口分布</div>
            <AccountBreakdown accounts={summary.allocationByAccount} />
          </div>

          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[5]}ms` }}>
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-ink">
              <TrophyIcon className="h-4 w-4 text-ink-muted" />
              表现排行
            </div>
            <Leaderboard holdings={summary.holdings} />
          </div>

          <Link
            href="/advisor"
            className="card card-interactive animate-in flex flex-col gap-2 p-5"
            style={{ animationDelay: `${SECTION_DELAY[6]}ms` }}
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--ai-accent) 14%, transparent)", color: "var(--ai-accent)" }}
              >
                <SparkleIcon className="h-4 w-4" />
              </span>
              <div className="text-xs font-medium tracking-wide text-ai-accent uppercase">
                Portfolio Intelligence
              </div>
            </div>
            <div className="text-sm text-ink">
              健康分 <span className="font-semibold tabular-nums">{health.overallScore}</span> · 现金占比{" "}
              {formatPct(health.cashPct)}，{health.cashAllocationScore < 60 ? "明显偏高，建议关注" : "在合理区间"}
            </div>
            <span className="text-sm text-ai-accent">查看完整分析 →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
