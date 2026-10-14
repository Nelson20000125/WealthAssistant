import Link from "next/link";
import type { SearchFilters } from "@/lib/transactions";

// P1-05 搜索 / 筛选。原生 GET 表单：条件直接进网址（/cashflow?q=shopee&type=EXPENSE），
// 由页面在服务端跨月份查。不需要客户端状态，返回键回到上一个搜索也天然成立。

const FIELD = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink sm:text-sm";

export default function CashflowSearch({
  filters,
  categories,
  pools,
}: {
  filters: SearchFilters | null;
  categories: { id: string; name: string }[];
  pools: { id: string; name: string }[];
}) {
  const f = filters ?? {};
  // 除了关键字之外有设条件 → 筛选面板保持展开，不然使用者看不到自己套了什么
  const hasAdvanced = Object.keys(f).some((k) => k !== "q");

  return (
    <form action="/cashflow" method="get" className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={f.q ?? ""}
          placeholder="搜商户、备注、分类、金额、户口"
          className={FIELD}
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-md bg-ink px-4 text-sm font-medium text-surface">
          搜索
        </button>
      </div>

      <details open={hasAdvanced} className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center gap-3 text-ink-secondary">
          筛选
          {filters && (
            <Link href="/cashflow" className="text-xs text-ink-muted underline underline-offset-4">
              清除全部条件
            </Link>
          )}
        </summary>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <select name="type" defaultValue={f.type ?? ""} className={FIELD} aria-label="交易类型">
            <option value="">全部类型</option>
            <option value="EXPENSE">支出</option>
            <option value="INCOME">收入</option>
            <option value="INVEST">投资</option>
            <option value="TRANSFER">转账</option>
          </select>
          <select name="cat" defaultValue={f.categoryId ?? ""} className={FIELD} aria-label="分类">
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select name="pool" defaultValue={f.poolId ?? ""} className={`${FIELD} col-span-2`} aria-label="户口">
            <option value="">全部户口</option>
            {pools.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input type="number" name="min" step="0.01" min="0" inputMode="decimal" defaultValue={f.min ?? ""} placeholder="最低金额" className={FIELD} />
          <input type="number" name="max" step="0.01" min="0" inputMode="decimal" defaultValue={f.max ?? ""} placeholder="最高金额" className={FIELD} />
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            从
            <input type="date" name="from" defaultValue={f.from ?? ""} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            到
            <input type="date" name="to" defaultValue={f.to ?? ""} className={FIELD} />
          </label>
          <button type="submit" className="col-span-2 min-h-11 rounded-md border border-line text-sm text-ink hover:bg-page">
            套用筛选
          </button>
        </div>
      </details>
    </form>
  );
}
