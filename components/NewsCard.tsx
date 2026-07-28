import { Badge } from "@/components/ui/badge";
import type { NewsWithRelevance } from "@/lib/newsRelevance";

// 市场简报整页 跟 AI 顾问的市场情报侧栏 共用同一张新闻卡，避免两处各写一份、以后改版忘记同步
export default function NewsCard({
  item,
  variant = "full",
}: {
  item: NewsWithRelevance;
  variant?: "full" | "compact";
}) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        variant === "full"
          ? "card block p-5 transition-shadow hover:shadow-sm"
          : "block rounded-md border p-3 transition-colors hover:border-ai-accent"
      }
      style={{ borderColor: item.relevantHolding ? "var(--ai-accent)" : "var(--line)" }}
    >
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {item.ticker && <span className="font-medium text-ink-secondary">{item.ticker}</span>}
        {item.company && <span>{item.company}</span>}
        {variant === "full" && (
          <>
            <span>·</span>
            <span>{item.digest_date}</span>
          </>
        )}
        {item.relevantHolding && (
          <Badge
            variant="outline"
            className="ml-auto shrink-0 border-0"
            style={{
              background: "color-mix(in srgb, var(--ai-accent) 14%, transparent)",
              color: "var(--ai-accent)",
            }}
          >
            跟你的持仓相关{variant === "full" ? ` · ${item.relevantHolding}` : ""}
          </Badge>
        )}
      </div>
      <div className={variant === "full" ? "mt-1.5 text-sm font-medium text-ink" : "mt-1 text-sm text-ink"}>
        {item.title}
      </div>
      {variant === "full" && item.one_liner && (
        <div className="mt-1 text-sm text-ink-secondary">{item.one_liner}</div>
      )}
    </a>
  );
}
