import type { NewsItem } from "@/lib/marketBrief";

export type NewsWithRelevance = NewsItem & { relevantHolding: string | null };

/**
 * 纯字符串比对新闻 ticker 跟持仓 symbol，不用 LLM——快、免费、不会瞎猜关联。
 * 只做代号完全匹配（不区分大小写），不做「ETF 间接曝险」这种需要额外知识库的推断，
 * 宁可漏标也不要乱标。
 */
export function matchNewsRelevance(
  news: NewsItem[],
  holdings: { symbol: string | null; name: string }[]
): NewsWithRelevance[] {
  const symbolToName = new Map<string, string>();
  for (const h of holdings) {
    if (h.symbol) symbolToName.set(h.symbol.toUpperCase(), h.name);
  }

  return news.map((item) => {
    const matchedName = item.ticker ? symbolToName.get(item.ticker.toUpperCase()) ?? null : null;
    return { ...item, relevantHolding: matchedName };
  });
}
