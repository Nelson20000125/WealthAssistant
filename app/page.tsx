import { auth } from "@/auth";
import { getPortfolioSummary, getNetWorthHistory } from "@/lib/portfolio";
import { getMonthCashflow, getRangeCashflow } from "@/lib/transactions";
import { getRecordingStatus } from "@/lib/recordingStatus";
import { monthComparisonRange } from "@/lib/period";
import { getDisplayName } from "@/lib/profile";
import { computePortfolioHealth } from "@/lib/portfolioIntelligence";
import { formatMYR, formatShare, formatPct } from "@/lib/format";
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
import RecentTransactions from "@/components/RecentTransactions";
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

/** 2026-09-04 → 9/4 */
function shortDate(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

export default async function OverviewPage() {
  const session = await auth();
  const userId = session!.user.id;
  const summary = await getPortfolioSummary(userId);
  const health = computePortfolioHealth(summary);
  // 读资料库而不是 session：JWT 是登入那一刻的快照，改了名字不会立刻生效（P0-07）
  const displayName = await getDisplayName(userId);

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
      contributionMYR: h.contributionMYR,
      returnMYR: h.returnMYR,
      returnPct: h.returnPct,
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
  let recentItems: Awaited<ReturnType<typeof getMonthCashflow>>["items"] = [];
  let expenseDeltaPct: number | null = null;
  let comparisonPartial = false;
  let recording: Awaited<ReturnType<typeof getRecordingStatus>> | null = null; // 降级时不显示催记账横幅
  try {
    // 上月一并取回来算环比。单个绝对值不构成信息 ——「支出 RM 3,833」要配上
    // 「比上月多 12%」才知道该不该在意。
    // 同期比较：本月还没过完时，只能拿 9/1–9/25 去比 8/1–8/25（P0-03）。
    // 从前拿「9 月前 25 天」比「完整的 8 月」，算出「支出 -88.3%」——
    // 那不是省了钱，那是月份还没过完。
    const cmp = monthComparisonRange(now);
    comparisonPartial = cmp.partial;
    const [cf, thisPeriod, lastPeriod, recorded] = await Promise.all([
      getMonthCashflow(userId, now.getFullYear(), now.getMonth() + 1),
      getRangeCashflow(userId, cmp.current.start, cmp.current.end),
      getRangeCashflow(userId, cmp.previous.start, cmp.previous.end),
      getRecordingStatus(userId),
    ]);
    cashflowTotals = cf.totals;
    // 首页「最近交易」与收支页看同一份资料、同一套分类规则（P0-04）
    recentItems = cf.items.slice(0, 5);
    recording = recorded;
    // 上月支出为 0 时不给环比。除以 0 本来就得不到有意义的百分比，更重要的是：
    // 支出 0 的月份几乎都代表「那个月没记账」而不是「那个月没花钱」，
    // 拿它当基准算出来的「+∞%」或任何数字都是在拿没记账的月份跟记了账的月份比。
    // （这台机器上 7 月就是这样：有真实投资回填，但收支从 8 月才开始记。）
    if (lastPeriod.expense > 0) {
      expenseDeltaPct = (thisPeriod.expense - lastPeriod.expense) / lastPeriod.expense;
    }
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
  // 现金户口不是持仓（P0-09）。从前「共 6 笔」里混著 PUBLIC BANK / TNG /
  // moomoo Cash —— 那是三个钱包，不是三个投资标的。
  const investmentHoldings = summary.holdings.filter((h) => h.assetType !== "CASH");
  const cashHoldings = summary.holdings.filter((h) => h.assetType === "CASH");
  // 只有现金、没有投资标的时，组合分析那几块没有东西可分析：
  // 分散度会把「只有一类资产」算成集中度风险，健康分变成对记账使用者的无意义扣分。
  const hasInvestments = summary.holdings.some((h) => h.assetType !== "CASH");

  // 手动估值的持仓，不提醒就不会有人去更新 —— 而不更新的直接后果是净值曲线失真
  //（那条线会走成一条水平的假线，直到某天补录时跳一个台阶）。
  // 门槛跟 ValuationUpdateForm 的 STALE_DAYS 对齐：30 天。
  const STALE_VALUATION_DAYS = 30;
  const staleValuationCount = summary.holdings.filter((h) => {
    if (h.valuation !== "MANUAL_UNIT_PRICE" && h.valuation !== "MANUAL_VALUE") return false;
    if (h.needsValuation) return true; // 从没估过
    if (!(h.priceAsOf instanceof Date)) return false;
    // 复用上面那个 now，不要再调 Date.now() —— render 期间调用不纯函数
    return now.getTime() - h.priceAsOf.getTime() > STALE_VALUATION_DAYS * 86_400_000;
  }).length;

  // 全新帐号：一个持仓都没有。以前这里照样渲染整套投资仪表盘 ——
  // 空圆环、空曲线，外加一句「健康分 84 · 现金占比 0.0%，在合理区间」，
  // 那是拿空阵列算出来的分数（HHI=0 被当成完美分散），对零资产毫无意义。
  if (summary.holdings.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <div className="animate-in">
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
            {displayName ? `${greeting()}，${displayName}` : greeting()}
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            还没有任何资料。照下面三步走一遍，之后每天就只剩「记一笔」这件事。
          </p>
        </div>

        <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[1]}ms` }}>
          <ol className="flex flex-col gap-5">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-ink-muted">1</span>
              <div>
                <div className="text-sm font-medium text-ink">建立户口</div>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  银行、电子钱包、券商各建一个，只是给钱一个名字。
                </p>
                <Link href="/settings" className="mt-1 inline-block text-sm text-ai-accent">
                  去设定页建立 →
                </Link>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-ink-muted">2</span>
              <div>
                <div className="text-sm font-medium text-ink">填上目前余额</div>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  在收支页顶部「新增现金池」，填户口现在有多少钱、从哪天算起。
                  之后余额由流水自己推导，不用再手动改。
                </p>
                <Link href="/cashflow" className="mt-1 inline-block text-sm text-ai-accent">
                  去收支页设定 →
                </Link>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-ink-muted">3</span>
              <div>
                <div className="text-sm font-medium text-ink">开始记账</div>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  手动记一笔，或直接汇入银行对帐单（PDF / CSV）把整个月补齐。
                </p>
                <Link href="/?add=1" className="mt-1 inline-block text-sm text-ai-accent">
                  记第一笔 →
                </Link>
              </div>
            </li>
          </ol>
        </div>

        <p className="text-sm text-ink-muted">
          投资持仓、资产配置和组合分析要等有了持仓才会出现 —— 只想记账的话，前两步就够了。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-14">
      <div
        className="animate-in flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end sm:gap-4"
        style={{ animationDelay: `${SECTION_DELAY[0]}ms` }}
      >
        <div>
          <h1 className="text-2xl font-semibold text-ink sm:text-3xl">
            {displayName ? `${greeting()}，${displayName}` : greeting()}
          </h1>
        </div>
        <RefreshPricesButton lastPriceAt={lastPriceAt} />
      </div>

      {/* 断记提醒（P1-06）：天数从最后一笔交易日期算，不写死（与 Cowork 23:00 定时提醒双保险） */}
      {recording && recording.daysSinceLast !== 0 && (
        <Link
          href="/?add=1"
          className="card card-interactive animate-in flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          style={{ borderColor: "color-mix(in srgb, var(--portfolio-accent) 45%, var(--line))" }}
        >
          <span className="text-sm text-ink">
            {recording.daysSinceLast === null
              ? "还没有任何记录 · 记下第一笔，之后每天回来几秒就好"
              : recording.daysSinceLast === 1
                ? "今天还没记账 · 花了什么、进了什么，顺手记一笔"
                : `已 ${recording.daysSinceLast} 天没记账（上次 ${shortDate(recording.lastTxDate!)}）· 想起哪笔补哪笔`}
          </span>
          <span className="shrink-0 text-sm font-medium text-portfolio-accent-deep">+ 记一笔</span>
        </Link>
      )}

      {recording?.importGapFrom && (
        <Link
          href="/cashflow?import=1"
          className="card card-interactive animate-in flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          style={{ borderColor: "color-mix(in srgb, var(--warning) 45%, var(--line))" }}
        >
          <span className="text-sm text-ink">
            {shortDate(recording.importGapFrom)} 起的对账单还没导入 · 上个月的月结单应该已经出了
          </span>
          <span className="shrink-0 text-sm font-medium text-ink">导入 →</span>
        </Link>
      )}

      {staleValuationCount > 0 && (
        <Link
          href="/holdings#valuations"
          className="card card-interactive animate-in flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          style={{ borderColor: "color-mix(in srgb, var(--warning) 45%, var(--line))" }}
        >
          <span className="text-sm text-ink">
            {staleValuationCount} 笔持仓超过 {STALE_VALUATION_DAYS} 天没更新估值 · 净值曲线会失真
          </span>
          <span className="shrink-0 text-sm font-medium text-warning">去更新 →</span>
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
          className="mt-2 block text-center text-4xl font-semibold tracking-tight text-ink font-mono tabular-nums sm:text-6xl"
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

        {/* 四个统计铺满卡片宽度。原本是 max-w-xl（576px）居中在 1152px 的卡片里，
            左右各空 288px，像没做完；而「组合摘要」那张侧栏卡又把同样的数字再列一遍。
            现在统一收进 hero，组合摘要整张移除。 */}
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-line pt-6 text-center sm:grid-cols-4">
          <div>
            <div className="text-xs text-ink-muted">投资部位</div>
            <CountUpValue
              value={portfolioValueMYR}
              format="myr"
              className="mt-1 block text-lg font-medium text-ink font-mono tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-ink-muted">现金部位</div>
            <CountUpValue
              value={cashValueMYR}
              format="myr"
              className="mt-1 block text-lg font-medium text-ink font-mono tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-ink-muted">投入成本</div>
            <CountUpValue
              value={summary.costMYR}
              format="myr"
              className="mt-1 block text-lg font-medium text-ink font-mono tabular-nums"
            />
          </div>
          <div>
            <div className="text-xs text-ink-muted">持仓 / 现金户口</div>
            <div className="mt-1 text-lg font-medium text-ink font-mono tabular-nums">
              {investmentHoldings.length} · {cashHoldings.length}
            </div>
          </div>
        </div>
      </div>

      {/* ── 第二层 · 每周看 ──
          不再分左右两栏。以前主栏放 2 张卡、侧栏放 5 张，没有 masonry，
          结果左边先结束、右边继续往下，留出约三分之一屏的空白。
          改成按「查看频率」纵向分层，用间距（层间 gap-14 / 层内 gap-6）而不是栏位做分组。 */}
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
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

          <div className="flex flex-col gap-6">
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
                    <span className="flex items-baseline gap-2 text-sm text-ink-secondary">
                      支出
                      {expenseDeltaPct !== null && (
                        <span
                          className={`font-mono text-xs tabular-nums ${
                            expenseDeltaPct > 0 ? "text-critical" : "text-good"
                          }`}
                        >
                          {formatPct(expenseDeltaPct)}
                        </span>
                      )}
                      {expenseDeltaPct !== null && comparisonPartial && (
                        <span className="text-xs text-ink-muted">截至今日</span>
                      )}
                    </span>
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

            <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[3]}ms` }}>
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-sm font-medium text-ink">最近交易</div>
                <Link href="/cashflow" className="text-xs text-ink-muted hover:text-ink">全部 →</Link>
              </div>
              <RecentTransactions items={recentItems} />
            </div>
          </div>
        </div>

        <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[4]}ms` }}>
          <div className="mb-5 flex items-baseline justify-between">
            <div className="text-sm font-medium text-ink">持仓明细</div>
            <div className="text-xs text-ink-muted">
              持仓 {investmentHoldings.length} 笔 · 现金 {cashHoldings.length} 个户口
            </div>
          </div>
          <HoldingsGrid holdings={summary.holdings} netWorthMYR={summary.netWorthMYR} />
        </div>
      </div>

      {/* ── 第三层 · 偶尔看 ──
          与上一层拉开 gap-14（56px），三张等宽卡片。等宽网格不会出现不等高留白。 */}
      <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[4]}ms` }}>
          <div className="mb-5 text-sm font-medium text-ink">按户口分布</div>
          <AccountBreakdown accounts={summary.allocationByAccount} />
        </div>

        {hasInvestments && (
          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[5]}ms` }}>
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-ink">
              <TrophyIcon className="h-4 w-4 text-ink-muted" />
              表现排行
            </div>
            <Leaderboard holdings={summary.holdings} />
          </div>
        )}

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
          {hasInvestments ? (
            <>
              <div className="text-sm text-ink">
                健康分 <span className="font-semibold font-mono tabular-nums">{health.overallScore}</span> · 现金占比{" "}
                {formatShare(health.cashPct)}，{health.cashAllocationScore < 60 ? "明显偏高，建议关注" : "在合理区间"}
              </div>
              <span className="text-sm text-ai-accent">查看完整分析 →</span>
            </>
          ) : (
            // 只有现金时不给分数：那套评分是针对投资组合的，
            // 对只记账的人只会得出「现金占比 100%，明显偏高」这种废话
            <>
              <div className="text-sm text-ink">
                目前只有现金，还没有投资持仓 —— 组合评分要等有了标的才有意义。
              </div>
              <span className="text-sm text-ai-accent">先去问问 AI 顾问 →</span>
            </>
          )}
        </Link>
      </div>
    </div>
  );
}
