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

/**
 * 应急金月数 = 可动用现金 ÷ 月均支出（P0-06）。
 *
 * 「现金占比 60% 偏高」这句话对一个月支出 RM7,124、手上只有 RM10.4k 的人
 * 是危险的建议 —— 那笔现金其实只够撑一个半月。占比讲的是资产结构，
 * 够不够活下去要拿真实现金流来除。
 */
export function emergencyFundMonths(
  availableCashMYR: number,
  avgMonthlyExpenseMYR: number
): number | null {
  // 月支出为 0 通常代表「那几个月没记账」，不是「没花钱」。
  // 回 Infinity 会让顾问说「现金够用 999 个月」——那是在拿没有的资料撒谎。
  if (avgMonthlyExpenseMYR <= 0) return null;
  return availableCashMYR / avgMonthlyExpenseMYR;
}

export type EmergencyFundLevel = "unknown" | "critical" | "ok" | "excess";
export type EmergencyFundVerdict = {
  level: EmergencyFundLevel;
  /** false = 现金垫还不够，任何「加仓股票」的建议都不该出现 */
  allowsMoreEquity: boolean;
};

/**
 * 门槛用通行的 3／6／12 个月。低于 3 个月就锁住加仓建议 ——
 * 这是记账模块与投资模块真正接起来的那一条线。
 */
export function emergencyFundVerdict(months: number | null): EmergencyFundVerdict {
  if (months === null) return { level: "unknown", allowsMoreEquity: false };
  if (months < 3) return { level: "critical", allowsMoreEquity: false };
  if (months < 6) return { level: "ok", allowsMoreEquity: true };
  if (months <= 12) return { level: "ok", allowsMoreEquity: true };
  return { level: "excess", allowsMoreEquity: true };
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
export function generateInsights(
  summary: PortfolioSummary,
  health: PortfolioHealth,
  emergency: EmergencyFundVerdict & { months: number | null } = {
    ...emergencyFundVerdict(null),
    months: null,
  }
): Insight[] {
  const insights: Insight[] = [];

  // 现金垫不足时，「现金占比偏高」这句话是错的方向 —— 先讲还能撑几个月（P0-06）
  if (emergency.level === "critical" && emergency.months !== null) {
    insights.push({
      tone: "flag",
      category: "现金安全垫",
      text: `以近三个月的真实支出计算，手上的现金只够 ${emergency.months.toFixed(1)} 个月，低于 3 个月的安全线。在补足之前，先别把现金挪去投资。`,
    });
  } else if (emergency.months !== null) {
    insights.push({
      tone: emergency.level === "excess" ? "neutral" : "healthy",
      category: "现金安全垫",
      text:
        emergency.level === "excess"
          ? `现金够撑 ${emergency.months.toFixed(1)} 个月，超过 12 个月的部分放著不动是有机会成本的。`
          : `现金够撑 ${emergency.months.toFixed(1)} 个月，安全垫是足的。`,
    });
  }

  // 现金垫还没补足时，占比这条不发 —— 两条并排会互相打架
  if (emergency.level === "critical") {
    // 跳过占比评语
  } else if (health.cashAllocationScore < 60) {
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
export function generateSuggestions(
  health: PortfolioHealth,
  emergency: EmergencyFundVerdict = emergencyFundVerdict(null)
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (!emergency.allowsMoreEquity && emergency.level === "critical") {
    // 现金不够撑三个月时，第一件事是补现金，不是加仓（P0-06）
    suggestions.push({ icon: "shield", label: "先把现金安全垫补到 3 个月" });
  } else if (health.cashAllocationScore < 60) {
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
