"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatMYR } from "@/lib/format";
import { merchantName } from "@/lib/merchant";
import { deferred } from "@/lib/deferred";
import { Button } from "@/components/ui/button";
import PdfImportModal from "@/components/PdfImportModal";
import TransactionSheet from "@/components/TransactionSheet";
import type {
  CategoryOption,
  HoldingOption,
  OutstandingOption,
  TxItem,
} from "@/components/cashflowTypes";

// 收支记录页的客户端交互：流水列表（整行点开编辑/删除）+ 汇入。
// 记账表单本身住在 TransactionSheet —— ⊕ 要能在任何页面拉起它，不能绑在这一页里。

const TYPE_META = {
  EXPENSE: { label: "支出", sign: "−", cls: "text-ink" },
  INCOME: { label: "收入", sign: "+", cls: "text-good" },
  INVEST: { label: "投资", sign: "→", cls: "text-portfolio-accent-deep" },
  TRANSFER: { label: "转账", sign: "⇄", cls: "text-ai-accent" },
} as const;

type SortBy = "date" | "category" | "amount";
type SortDir = "asc" | "desc";

export default function CashflowManager({
  items,
  searching = false,
  autoImport = false,
  dayTotals = [],
  categories,
  holdings,
  accounts,
  outstanding = [],
  defaultCashHoldingId = null,
}: {
  items: TxItem[];
  /** 搜索结果模式：空状态文案不同；转账默认显示（搜「转账」却看不到结果会以为坏了） */
  searching?: boolean;
  /** 首页「对账单还没导入 [导入]」进来时（?import=1）直接打开导入视窗 */
  autoImport?: boolean;
  /** 服务端按汇总口径算好的当天小计（垫付已扣、不计入的分类不算） */
  dayTotals?: { date: string; income: number; expense: number }[];
  categories: CategoryOption[];
  holdings: HoldingOption[];
  accounts: { id: string; name: string; currency: string }[];
  outstanding?: OutstandingOption[];
  /** 还没有 localStorage 记忆时预选哪个户口（服务端按余额算好的主力户口） */
  defaultCashHoldingId?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TxItem | null>(null);
  // 「已删除 · 撤销」：行先藏起来，DELETE 等 snackbar 过期才真的发。
  // 不能「删了再重建」来撤销 —— 重建换 id，还款笔的 settlesTransactionId 已被 SetNull 接不回去
  const [pendingDelete, setPendingDelete] = useState<TxItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingRef = useRef<ReturnType<typeof deferred> | null>(null);
  const [showImport, setShowImport] = useState(autoImport);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showTransfers, setShowTransfers] = useState(searching);

  function remove(t: TxItem) {
    setEditing(null);
    setDeleteError(null);
    pendingRef.current?.flush(); // 上一笔还在等的先送出去，一次只留一个撤销
    setPendingDelete(t);
    pendingRef.current = deferred(() => {
      pendingRef.current = null;
      // keepalive：离开页面时 flush 的这一发不会被浏览器中途砍掉
      fetch(`/api/transactions/${t.id}`, { method: "DELETE", keepalive: true })
        .then((r) => {
          if (!r.ok) setDeleteError("删除失败，记录还在");
        })
        .catch(() => setDeleteError("删除失败，记录还在"))
        .finally(() => {
          setPendingDelete(null);
          router.refresh();
        });
    }, 5000);
  }

  function undoDelete() {
    if (pendingRef.current?.cancel()) {
      pendingRef.current = null;
      setPendingDelete(null);
    }
  }

  // 关页面 / 切到别的路由时，还在等的删除立刻送出，不然使用者以为删了、其实没删
  useEffect(() => {
    const flush = () => pendingRef.current?.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // 转账是自己户口之间的搬运，两侧各记一笔（PBE 转出 + TNG 转入），
  // 混在流水里看起来像同一笔重复出现。它们对收支净额本来就是零，所以预设隐藏。
  // 不是直接砍掉：误分类成转账的记录（例如基金赎回）如果看不见就永远改不回来。
  const dayTotalMap = useMemo(() => new Map(dayTotals.map((d) => [d.date, d])), [dayTotals]);

  const transferCount = useMemo(() => items.filter((t) => t.type === "TRANSFER").length, [items]);

  const sortedItems = useMemo(() => {
    const arr = items.filter(
      (t) => (showTransfers || t.type !== "TRANSFER") && t.id !== pendingDelete?.id
    );
    arr.sort((a, b) => {
      const cmp =
        sortBy === "date"
          ? a.date.localeCompare(b.date)
          : sortBy === "category"
            ? (a.categoryName ?? "未分类").localeCompare(b.categoryName ?? "未分类")
            : a.amount - b.amount;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortBy, sortDir, showTransfers, pendingDelete]);

  // 按日期排序时才按日分组显示（原本的呈现方式）；按分类/金额排序时分组没意义，改平铺列表
  const grouped = useMemo(() => {
    const map = new Map<string, TxItem[]>();
    for (const t of sortedItems) {
      const key = t.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [sortedItems]);

  function renderRow(t: TxItem) {
    const meta = TYPE_META[t.type];
    return (
      // 整行就是按钮（P1-04）：点开详情 sheet，编辑/删除都在里面。
      // 手机排成两行（描述一行、金额一行），桌面用 sm:contents 摊平成一行
      <button
        key={t.id}
        type="button"
        onClick={() => setEditing(t)}
        className="flex min-h-11 w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-page sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="flex min-w-0 items-center gap-2 sm:contents">
          {sortBy !== "date" && (
            <span className="w-12 shrink-0 text-xs text-ink-muted font-mono tabular-nums">{t.date.slice(5, 10)}</span>
          )}
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-secondary">
            {t.type === "INVEST" ? (t.holdingLabel ?? "投资") : (t.categoryName ?? "未分类")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {/* 显示解析出来的商户名。原始的银行描述（含卡号／参考号）留在
                编辑表单的「说明」栏里，不印在列表上（P0-01） */}
            {merchantName(t.description) || (t.type === "INVEST" ? `买入 ${t.holdingLabel}` : meta.label)}
            {t.type === "INVEST" && t.units && (
              <span className="ml-2 hidden text-xs text-ink-muted font-mono tabular-nums sm:inline">
                {t.units.toFixed(4)} 份 @ {t.unitPrice}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-3 sm:contents">
          {/* 份数在手机挤不进描述那行，挪来第二行；桌面隐藏，由上面那个负责 */}
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted font-mono tabular-nums sm:hidden">
            {t.type === "INVEST" && t.units ? `${t.units.toFixed(4)} 份 @ ${t.unitPrice}` : ""}
          </span>
          <span className={`shrink-0 text-sm font-medium font-mono tabular-nums ${meta.cls}`}>
            {meta.sign}
            {t.currency === "MYR"
              ? formatMYR(t.amount)
              : `${t.currency} ${t.amount.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
          排序
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="date">日期</option>
            <option value="category">分类</option>
            <option value="amount">金额</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-secondary hover:text-ink"
            title={sortDir === "asc" ? "由小到大 / 由旧到新" : "由大到小 / 由新到旧"}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
          {transferCount > 0 && (
            <button
              type="button"
              onClick={() => setShowTransfers((v) => !v)}
              className={`rounded-md border border-line px-2 py-1 text-xs transition ${
                showTransfers ? "text-ink" : "text-ink-muted hover:text-ink-secondary"
              }`}
              title="转账是自己户口之间的搬运，两侧各一笔，对收支净额是零"
            >
              {showTransfers ? "隐藏" : "显示"}转账（{transferCount}）
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>导入对账单</Button>
        </div>
      </div>

      {/* 流水列表：按日期排序时按日分组显示，按分类/金额排序时改平铺列表（每行自带日期） */}
      {sortedItems.length === 0 && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted">
          {searching ? "没有符合条件的记录" : "本月还没有记录，点底部的 ⊕ 开始"}
        </div>
      )}
      {sortBy === "date"
        ? grouped.map(([day, dayItems]) => (
            <div key={day}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs font-medium text-ink-muted">
                <span>{day}</span>
                <span className="font-mono tabular-nums">
                  {dayTotalMap.get(day)?.income ? (
                    <span className="mr-2 text-good">+{formatMYR(dayTotalMap.get(day)!.income)}</span>
                  ) : null}
                  {dayTotalMap.get(day)?.expense ? `−${formatMYR(dayTotalMap.get(day)!.expense)}` : null}
                </span>
              </div>
              <div className="card divide-y divide-line">{dayItems.map(renderRow)}</div>
            </div>
          ))
        : sortedItems.length > 0 && (
            <div className="card divide-y divide-line">{sortedItems.map(renderRow)}</div>
          )}

      {editing && (
        <TransactionSheet
          edit={editing}
          categories={categories}
          holdings={holdings}
          accounts={accounts}
          outstanding={outstanding}
          defaultCashHoldingId={defaultCashHoldingId}
          onClose={() => setEditing(null)}
          onDelete={() => remove(editing)}
        />
      )}

      {(pendingDelete || deleteError) &&
        createPortal(
          // 跟「已保存 · 撤销」同一个位置：手机要让开底部 tab bar
          <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-4">
            <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-xl bg-ink px-4 py-2 text-surface shadow-lg">
              <span className="flex-1 text-sm">{deleteError ?? "已删除"}</span>
              {pendingDelete ? (
                <button
                  type="button"
                  onClick={undoDelete}
                  className="min-h-11 px-2 text-sm font-medium underline underline-offset-4"
                >
                  撤销
                </button>
              ) : (
                <button type="button" aria-label="关闭" onClick={() => setDeleteError(null)} className="min-h-11 px-1 text-sm opacity-70">
                  ✕
                </button>
              )}
            </div>
          </div>,
          document.body
        )}

      {showImport && (
        <PdfImportModal
          onClose={() => {
            setShowImport(false);
            // 清掉 ?import=1，不然一刷新视窗又弹出来
            if (autoImport) router.replace("/cashflow", { scroll: false });
          }}
        />
      )}
    </div>
  );
}
