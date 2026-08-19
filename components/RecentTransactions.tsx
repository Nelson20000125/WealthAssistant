import Link from "next/link";
import Value from "@/components/Value";

// 总览页的「最近交易」：记账是每天的动作，但首页以前看不到任何一笔流水。
// 资料直接从 getMonthCashflow 的 items 切前几笔（那边已按日期倒序），不另外查库。

type Item = {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  amountMYR: number | null;
  type: "INCOME" | "EXPENSE" | "INVEST" | "TRANSFER";
  description: string;
  categoryName: string | null;
  holdingLabel: string | null;
};

// 金额前缀。TRANSFER 不带正负号 —— 钱只是换个地方放，两侧相抵，
// 给它一个方向号会让人以为赚了或亏了。
const SIGN = {
  INCOME: "+",
  EXPENSE: "−",
  INVEST: "→",
  TRANSFER: "⇄",
} as const;

function dayLabel(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function RecentTransactions({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-secondary">
        这个月还没有记录。
        <Link href="/cashflow?add=1" className="ml-1 text-portfolio-accent-deep">
          记第一笔 →
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((t) => (
        <div
          key={t.id}
          className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0"
        >
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
              {dayLabel(t.date)}
            </span>
            <span className="truncate text-sm text-ink">
              {/* 汇入的对帐单描述是一长串参考号，分类名比它可读得多 */}
              {t.categoryName ?? t.holdingLabel ?? t.description}
            </span>
          </div>
          <span className="shrink-0 text-sm">
            <span className="text-ink-muted">{SIGN[t.type]}</span>{" "}
            <Value
              value={t.amount}
              currency={t.currency}
              colorizeSign={false}
              className={t.type === "INCOME" ? "text-good" : "text-ink"}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
