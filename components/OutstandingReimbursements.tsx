import type { OutstandingReimbursement } from "@/lib/transactions";
import { formatCurrency } from "@/lib/format";

/**
 * 还没收回的垫付。
 *
 * 这张卡不是装饰：垫付的钱已经从支出统计里扣掉了，如果没有地方盯着，
 * 那笔钱就等于被账本藏起来——既不算你花掉的，也没人提醒你去要。
 * 所以有未收清的垫付时它必须显眼；全部收清了就整张消失，不占版面。
 */
export default function OutstandingReimbursements({
  items,
}: {
  items: OutstandingReimbursement[];
}) {
  if (items.length === 0) return null;

  // 币种可能不同（垫付 MYR 与垫付 USD 各自成立），分开加总，不硬凑成一个数字
  const byCurrency = new Map<string, number>();
  for (const r of items) {
    byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + r.outstanding);
  }

  return (
    <div className="card animate-in p-6">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-sm font-medium text-ink">待收回的垫付</div>
        <div className="text-lg font-medium font-mono tabular-nums text-ink">
          {Array.from(byCurrency.entries())
            .map(([currency, total]) => formatCurrency(total, currency))
            .join(" + ")}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
        {items.map((r) => {
          const pct = r.reimbursable > 0 ? r.settled / r.reimbursable : 0;
          return (
            <div key={r.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm text-ink">{r.description || "（无备注）"}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {r.date.toISOString().slice(0, 10)}
                    {r.categoryName && ` · ${r.categoryName}`}
                  </span>
                </div>
                <div className="shrink-0 text-sm font-medium font-mono tabular-nums text-ink">
                  {formatCurrency(r.outstanding, r.currency)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-page">
                  <div
                    className="h-full rounded-full bg-ai-accent"
                    style={{ width: `${Math.min(pct * 100, 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs text-ink-muted font-mono tabular-nums">
                  已收 {formatCurrency(r.settled, r.currency)} / {formatCurrency(r.reimbursable, r.currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
        这些钱已经不算在支出里了。收到还款时记一笔收入并选「冲销哪笔垫付」，这里就会跟着减少。
      </p>
    </div>
  );
}
