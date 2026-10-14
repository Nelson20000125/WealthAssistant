import Link from "next/link";
import Value from "@/components/Value";
import { merchantName } from "@/lib/merchant";

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

const TYPE_LABEL = {
  INCOME: "收入",
  EXPENSE: "支出",
  INVEST: "投资",
  TRANSFER: "转账",
} as const;

function dayLabel(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function RecentTransactions({ items }: { items: Item[] }) {
  // 收支页默认隐藏转账，首页也必须隐藏（P0-04）。两边口径不同时，
  // 使用者看到的是「首页有这笔、列表里找不到」，会以为资料掉了。
  const visible = items.filter((t) => t.type !== "TRANSFER");

  if (visible.length === 0) {
    return (
      <p className="text-sm text-ink-secondary">
        这个月还没有记录。
        <Link href="/?add=1" className="ml-1 text-portfolio-accent-deep">
          记第一笔 →
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {visible.map((t) => {
        // 标题用解析出来的商户名，不用银行原始描述 —— 那是
        // 「VISA4848100072413731」被印在首页上的那条路径（P0-01）。
        const title =
          merchantName(t.description) || t.holdingLabel || t.categoryName || TYPE_LABEL[t.type];
        // 一级类型 + 子分类一起显示，两个页面才不会一个写「公积金」
        // 另一个写「投资」，看起来像两套资料（P0-04）。
        const sub = t.categoryName ? `${TYPE_LABEL[t.type]} · ${t.categoryName}` : TYPE_LABEL[t.type];
        return (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <div className="flex min-w-0 items-baseline gap-2.5">
              <span className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
                {dayLabel(t.date)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{title}</div>
                <div className="truncate text-xs text-ink-muted">{sub}</div>
              </div>
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
        );
      })}
    </div>
  );
}
