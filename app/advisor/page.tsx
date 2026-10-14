import Link from "next/link";
import { auth } from "@/auth";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getMarketBrief } from "@/lib/marketBrief";
import { computePortfolioHealth, generateInsights, generateSuggestions } from "@/lib/portfolioIntelligence";
import { getFinancialSummary } from "@/lib/financialSummary";
import { matchNewsRelevance } from "@/lib/newsRelevance";
import { peekAiQuota } from "@/lib/aiUsage";
import HealthScoreRing from "@/components/HealthScoreRing";
import PortfolioIntelligencePanel from "@/components/PortfolioIntelligencePanel";
import { NewsIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import NewsCard from "@/components/NewsCard";

const LIVE_RESEARCH_TILE = { label: "组合分析", href: "/" };
// 只留最近要做的两项。原本列了五项「开发中」，配一项能用的，比例 1:5 ——
// 灰掉的比能用的多三倍，整块读起来像半成品，反而削弱了那唯一能用的功能。
const UPCOMING_RESEARCH_TILES = ["个股分析", "股息分析"];

function subScoreColor(score: number) {
  if (score >= 70) return "var(--good)";
  // 跟 HealthScoreRing 用同一套分级：40 分以上算「需要留意」的琥珀色，
  // 只有 <20 才是真的要马上处理的红色
  if (score >= 20) return "var(--warning)";
  return "var(--critical)";
}

// 各大区块的入场错落延迟（ms），跟 fade-rise 动画配合，纯用 CSS animation-delay 实现
const SECTION_DELAY = [0, 60, 120, 180, 240, 300, 360];

export default async function AdvisorPage() {
  const session = await auth();
  const [summary, rawNews, quota, financial] = await Promise.all([
    getPortfolioSummary(session!.user.id),
    getMarketBrief(8),
    peekAiQuota(session!.user.id),
    getFinancialSummary(session!.user.id),
  ]);
  const health = computePortfolioHealth(summary);
  // 现金够不够撑，要拿真实月支出算，不能只看资产比例（P0-06）
  const emergency = { ...financial.emergencyFund, months: financial.emergencyFundMonths };
  const insights = generateInsights(summary, health, emergency);
  const suggestions = generateSuggestions(health, financial.emergencyFund);

  // 抓宽一点（8 条）再比对持仓关联，把相关的排到前面，最后只显示 3 条——
  // 不然真正相关的新闻可能因为不在最新 3 条里而被漏掉。
  const news = matchNewsRelevance(rawNews, summary.holdings)
    .sort((a, b) => Number(!!b.relevantHolding) - Number(!!a.relevantHolding))
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in" style={{ animationDelay: `${SECTION_DELAY[0]}ms` }}>
        <h1 className="text-3xl font-semibold text-ink">我的投资</h1>
        <p className="mt-1 text-sm text-ink-muted">
          先看现金够不够撑，再谈要不要加仓
        </p>
      </div>

      {/* 主栏（组合健康 + AI 洞察 + 对话）+ 侧栏（市场情报 + 研究中心），
          lg 以下收合成单栏——两栏是「关于你的组合」跟「外部参考资讯」的区分，不是随便切的 */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-8 lg:col-span-2">
          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[1]}ms` }}>
            <div className="mb-5 text-sm font-medium text-ink">投资组合健康分</div>
            <div className="flex flex-col items-center gap-8 sm:flex-row">
              <HealthScoreRing score={health.overallScore} />
              <div className="grid flex-1 grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-ink-muted">风险</div>
                  <div
                    className="mt-1 text-xl font-semibold font-mono tabular-nums"
                    style={{ color: subScoreColor(health.riskScore) }}
                  >
                    {health.riskScore}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">分散度</div>
                  <div
                    className="mt-1 text-xl font-semibold font-mono tabular-nums"
                    style={{ color: subScoreColor(health.diversificationScore) }}
                  >
                    {health.diversificationScore}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">现金配置</div>
                  <div
                    className="mt-1 text-xl font-semibold font-mono tabular-nums"
                    style={{ color: subScoreColor(health.cashAllocationScore) }}
                  >
                    {health.cashAllocationScore}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">市场曝险</div>
                  <div className="mt-1 text-xl font-semibold text-ink">{health.marketExposureLabel}</div>
                </div>
              </div>
            </div>
          </div>

          <PortfolioIntelligencePanel
            insights={insights}
            suggestions={suggestions}
            sectionDelays={[SECTION_DELAY[2], SECTION_DELAY[4], SECTION_DELAY[5]]}
            quota={quota}
          />
        </div>

        <div className="flex flex-col gap-8 lg:col-span-1">
          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[3]}ms` }}>
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-ink">
              <NewsIcon className="h-4 w-4 text-ink-muted" />
              市场情报
            </div>
            {news.length === 0 ? (
              <div className="text-sm text-ink-muted">目前抓不到简报资料。</div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-medium text-ink-muted">
                  US Market · 数据来源 AI Knowledge Hub
                </div>
                {news.map((item) => (
                  <NewsCard key={item.id} item={item} variant="compact" />
                ))}
                <div className="text-xs text-ink-muted/60">
                  Malaysia Market · 需要新数据源，暂未接入
                </div>
              </div>
            )}
          </div>

          <div className="card animate-in p-6" style={{ animationDelay: `${SECTION_DELAY[6]}ms` }}>
            <div className="mb-5 text-sm font-medium text-ink">AI 研究中心</div>
            <Link
              href={LIVE_RESEARCH_TILE.href}
              className="card-interactive block rounded-md border border-line p-4 text-sm text-ink transition-colors hover:border-ai-accent"
            >
              {LIVE_RESEARCH_TILE.label}
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
              开发中：
              {UPCOMING_RESEARCH_TILES.map((label) => (
                <Badge key={label} variant="secondary" className="font-normal text-ink-muted">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
