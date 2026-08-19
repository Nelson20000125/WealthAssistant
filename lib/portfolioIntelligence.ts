import type { getPortfolioSummary } from "@/lib/portfolio";
import { formatShare } from "@/lib/format";

type PortfolioSummary = Awaited<ReturnType<typeof getPortfolioSummary>>;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 健康区间取 10%–30% 现金占比，偏离中枢 20% 越远扣分越多。
 * 纯规则打分，不经过 LLM，保证同样的持仓永远算出同样的分数。
 */
export function cashAllocationScore(cashPct: number): number {
  return clamp(100 - Math.min(100, Math.abs(cashPct * 100 - 20) * 2));
}

/**
 * 用 Herfindahl 指数（各资产类别占比平方和）衡量集中度，
 * HHI 越接近 1（单一类别独大）分数越低，越接近 1/n（平均分散）分数越高。
 */
export function diversificationScore(allocation: { pct: number }[]): number {
  const hhi = allocation.reduce((sum, a) => sum + a.pct * a.pct, 0);
  return clamp(100 - hhi * 100);
}

/**
 * 风险分从 100 起扣：任何非现金持仓占净资产超过 40%，视为集中度风险，扣 30 分。
 * 阈值和扣分幅度是可调的经验值，不是精确模型。
 */
export function riskScore(
  holdings: { valueMYR: number | null; assetType: string }[],
  netWorthMYR: number
): number {
  if (netWorthMYR <= 0) return 100;
  let score = 100;
  for (const h of holdings) {
    if (h.assetType === "CASH" || h.valueMYR === null) continue;
    const pctOfNetWorth = h.valueMYR / netWorthMYR;
    if (pctOfNetWorth > 0.4) score -= 30;
  }
  return clamp(score);
}

export type MarketExposureLabel = "偏美股" | "偏本地" | "均衡";

/**
 * 按非现金持仓的币种分布判断整体市场曝险：某一币种占非现金部位 60% 以上视为「偏」，否则「均衡」。
 */
export function marketExposureLabel(
  holdings: { valueMYR: number | null; assetType: string; currency: string }[]
): MarketExposureLabel {
  let nonCashTotal = 0;
  let usdTotal = 0;
  let myrTotal = 0;
  for (const h of holdings) {
    if (h.assetType === "CASH" || h.valueMYR === null) continue;
    nonCashTotal += h.valueMYR;
    if (h.currency === "USD") usdTotal += h.valueMYR;
    if (h.currency === "MYR") myrTotal += h.valueMYR;
  }
  if (nonCashTotal === 0) return "均衡";
  if (usdTotal / nonCashTotal > 0.6) return "偏美股";
  if (myrTotal / nonCashTotal > 0.6) return "偏本地";
  return "均衡";
}

export type PortfolioHealth = {
  overallScore: number;
  cashAllocationScore: number;
  diversificationScore: number;
  riskScore: number;
  marketExposureLabel: MarketExposureLabel;
  cashPct: number;
};

/**
 * 综合分权重：现金配置 40% + 分散度 35% + 风险 25%。
 * 权重是经验值，重点是可解释、可复现，不是精确金融模型。
 */
export function computePortfolioHealth(summary: PortfolioSummary): PortfolioHealth {
  const cashPct = summary.allocation.find((a) => a.assetType === "CASH")?.pct ?? 0;
  const cash = cashAllocationScore(cashPct);
  const diversification = diversificationScore(summary.allocation);
  const risk = riskScore(summary.holdings, summary.netWorthMYR);
  const overall = 0.4 * cash + 0.35 * diversification + 0.25 * risk;

  return {
    overallScore: Math.round(clamp(overall)),
    cashAllocationScore: Math.round(cash),
    diversificationScore: Math.round(diversification),
    riskScore: Math.round(risk),
    marketExposureLabel: marketExposureLabel(summary.holdings),
    cashPct,
  };
}

export type InsightTone = "flag" | "healthy" | "neutral";
export type Insight = { tone: InsightTone; category: string; text: string };

/**
 * 模版化生成 insight 文案——所有措辞都由分数决定，同样的持仓永远生成同样的话，
 * 不经过 LLM，避免顾问页面出现幻觉数字。
 */
export function generateInsights(summary: PortfolioSummary, health: PortfolioHealth): Insight[] {
  const insights: Insight[] = [];

  if (health.cashAllocationScore < 60) {
    insights.push({
      tone: "flag",
      category: "现金配置",
      text: `现金占比 ${formatShare(health.cashPct)}，明显高于稳健型组合的常见区间（10%–30%），资金效率偏低。`,
    });
  } else if (health.cashAllocationScore >= 85) {
    insights.push({
      tone: "healthy",
      category: "现金配置",
      text: `现金占比 ${formatShare(health.cashPct)}，落在稳健区间内，流动性和成长性算是平衡。`,
    });
  } else {
    insights.push({
      tone: "neutral",
      category: "现金配置",
      text: `现金占比 ${formatShare(health.cashPct)}，接近合理区间，可以再观察。`,
    });
  }

  if (health.diversificationScore < 50) {
    insights.push({
      tone: "flag",
      category: "分散度",
      text: `资产配置集中在少数类别（分散度评分 ${health.diversificationScore}），单一类别波动会明显影响整体净值。`,
    });
  } else if (health.diversificationScore >= 75) {
    insights.push({
      tone: "healthy",
      category: "分散度",
      text: `各资产类别分布分散（分散度评分 ${health.diversificationScore}），单一类别波动对整体影响有限。`,
    });
  } else {
    insights.push({
      tone: "neutral",
      category: "分散度",
      text: `资产类别分散度评分 ${health.diversificationScore}，中规中矩，还有优化空间。`,
    });
  }

  if (health.riskScore < 100) {
    insights.push({
      tone: "flag",
      category: "集中度风险",
      text: "有单一持仓占净资产超过 40%，集中度风险偏高，建议评估是否分批调整。",
    });
  } else {
    insights.push({
      tone: "healthy",
      category: "集中度风险",
      text: "目前没有单一持仓过度集中，单一标的风险可控。",
    });
  }

  const exposureNote =
    health.marketExposureLabel === "偏美股"
      ? "汇率波动"
      : health.marketExposureLabel === "偏本地"
        ? "本地市场集中度"
        : "整体市场轮动";
  insights.push({
    tone: "neutral",
    category: "市场曝险",
    text: `非现金持仓目前${health.marketExposureLabel}（按币种计算），需留意${exposureNote}对组合的影响。`,
  });

  return insights;
}

export type SuggestionIcon = "trend" | "layers" | "shield" | "check";
export type Suggestion = { icon: SuggestionIcon; label: string };

/**
 * 建议 chips 同样是规则引擎产物：分数触发对应建议，没有触发任何风险项时给出「维持」类建议，
 * 保底凑到至少 3 条，不留空。
 */
export function generateSuggestions(health: PortfolioHealth): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (health.cashAllocationScore < 60) {
    suggestions.push({ icon: "trend", label: "提高股票/ETF 配置比例" });
  }
  if (health.diversificationScore < 50) {
    suggestions.push({ icon: "layers", label: "增加资产类别以分散风险" });
  }
  if (health.riskScore < 100) {
    suggestions.push({ icon: "shield", label: "留意单一持仓集中度" });
  }
  if (suggestions.length === 0) {
    suggestions.push({ icon: "check", label: "维持现有持仓" });
  }
  if (suggestions.length < 3) {
    suggestions.push({ icon: "layers", label: "定期检视资产配置" });
  }
  if (suggestions.length < 3) {
    suggestions.push({ icon: "check", label: "关注市场简报更新" });
  }

  return suggestions;
}
