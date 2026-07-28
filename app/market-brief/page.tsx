import { auth } from "@/auth";
import { getMarketBrief } from "@/lib/marketBrief";
import { getPortfolioSummary } from "@/lib/portfolio";
import { matchNewsRelevance } from "@/lib/newsRelevance";
import NewsCard from "@/components/NewsCard";

export default async function MarketBriefPage() {
  const session = await auth();
  const [rawNews, summary] = await Promise.all([getMarketBrief(10), getPortfolioSummary(session!.user.id)]);
  const news = matchNewsRelevance(rawNews, summary.holdings);

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in">
        <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">
          Market Intelligence
        </div>
        <h1 className="mt-1 text-3xl font-semibold text-ink">市场简报</h1>
        <p className="mt-1 text-sm text-ink-muted">
          来自 AI Knowledge Hub 的标普 500 重仓股新闻（每日自动更新）
        </p>
      </div>

      {news.length === 0 ? (
        <div className="card p-6 text-sm text-ink-muted">
          目前抓不到简报资料，可能是 AI Knowledge Hub 那边还没跑当天的排程，或连线设定有问题。
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {news.map((item) => (
            <NewsCard key={item.id} item={item} variant="full" />
          ))}
        </div>
      )}
    </div>
  );
}
