"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatMYR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import PdfImportModal from "@/components/PdfImportModal";

// 收支记录页的客户端交互：流水列表（编辑/删除）+ 快速记账弹窗。
// INVEST 的持仓联动全部发生在服务端事务里，这里只负责表单。

export type TxItem = {
  id: string;
  date: string; // ISO
  amount: number;
  currency: string;
  amountMYR: number | null;
  type: "INCOME" | "EXPENSE" | "INVEST" | "TRANSFER";
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  holdingId: string | null;
  holdingLabel: string | null;
  units: number | null;
  unitPrice: number | null;
  cashHoldingId: string | null;
};

export type CategoryOption = { id: string; name: string; type: string };
export type HoldingOption = {
  id: string;
  name: string;
  symbol: string | null;
  assetType: string;
  currency: string;
  lastPrice: number | null;
  costBasis: number;
};

const TYPE_META = {
  EXPENSE: { label: "支出", sign: "−", cls: "text-ink" },
  INCOME: { label: "收入", sign: "+", cls: "text-good" },
  INVEST: { label: "投资", sign: "→", cls: "text-portfolio-accent-deep" },
  TRANSFER: { label: "转帐", sign: "⇄", cls: "text-ai-accent" },
} as const;

type SortBy = "date" | "category" | "amount";
type SortDir = "asc" | "desc";

type FormState = {
  id: string | null; // 编辑时非空
  type: "INCOME" | "EXPENSE" | "INVEST" | "TRANSFER";
  amount: string;
  date: string; // YYYY-MM-DD
  categoryId: string | null;
  description: string;
  holdingId: string;
  unitPrice: string;
  cashHoldingId: string;
};

function todayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

function emptyForm(type: FormState["type"] = "EXPENSE"): FormState {
  return {
    id: null,
    type,
    amount: "",
    date: todayStr(),
    categoryId: null,
    description: "",
    holdingId: "",
    unitPrice: "",
    cashHoldingId: "",
  };
}

export default function CashflowManager({
  items,
  categories: initialCategories,
  holdings,
  accounts,
  autoOpen = false,
}: {
  items: TxItem[];
  categories: CategoryOption[];
  holdings: HoldingOption[];
  accounts: { id: string; name: string; currency: string }[];
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(autoOpen ? emptyForm() : null);
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 就地建目标持仓：以前要跳去持仓页建好再回来，中途表单内容全丢。
  // 而且现金类持仓不能当投资目标，跑去持仓页很容易建错型别再卡一次。
  const [newHolding, setNewHolding] = useState<{
    accountId: string; name: string; assetType: string; currency: string;
  } | null>(null);
  const [creatingHolding, setCreatingHolding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showTransfers, setShowTransfers] = useState(false);
  // 弹窗要 portal 到 document.body，跳出 page.tsx 的 `.animate-in`（transform 动画会让
  // fixed 定位以它为基准而不是 viewport，弹窗会跟着页面滚动跑位）。SSR 阶段没有 document，
  // 用 mounted 挡一帧，避免 hydration mismatch。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const nonCashHoldings = holdings.filter((h) => h.assetType !== "CASH");

  // 就地建持仓。资产类型刻意不提供 CASH：现金持仓会被投资目标下拉过滤掉，
  // 在这里建一个现金类等于建了一个马上就选不到的东西。
  async function createHolding() {
    if (!newHolding || !form) return;
    setCreatingHolding(true);
    setError(null);
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: newHolding.accountId,
          assetType: newHolding.assetType,
          name: newHolding.name,
          symbol: null,
          // 新持仓还没有任何份额与成本：两者都由第一笔 INVEST 记录经 applyInvest 算出来
          // （newCostBasis = 金额 ÷ 份额 = 买入单价），所以这里给 0 就好。
          quantity: 0,
          costBasis: 0,
          currency: newHolding.currency,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "建立持仓失败");
      const created = data.holding ?? data;
      // 刻意不预填单价：单位信托要用成交当天的真实 NAV，
      // 预填 1 会让人没留意就存下错的份额。
      setForm({ ...form, holdingId: created.id, unitPrice: "", cashHoldingId: "" });
      setNewHolding(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingHolding(false);
    }
  }

  const cashHoldings = holdings.filter((h) => h.assetType === "CASH");
  const targetHolding = nonCashHoldings.find((h) => h.id === form?.holdingId) ?? null;
  // 扣款现金必须与目标持仓同币种（服务端也会校验，这里先过滤掉选不了的）
  const eligibleCash = targetHolding
    ? cashHoldings.filter((h) => h.currency === targetHolding.currency)
    : cashHoldings;

  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === form?.type),
    [categories, form?.type]
  );

  // 转帐是自己户口之间的搬运，两侧各记一笔（PBE 转出 + TNG 转入），
  // 混在流水里看起来像同一笔重复出现。它们对收支净额本来就是零，所以预设隐藏。
  // 不是直接砍掉：误分类成转帐的记录（例如基金赎回）如果看不见就永远改不回来。
  const transferCount = useMemo(() => items.filter((t) => t.type === "TRANSFER").length, [items]);

  const sortedItems = useMemo(() => {
    const arr = items.filter((t) => showTransfers || t.type !== "TRANSFER");
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
  }, [items, sortBy, sortDir, showTransfers]);

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

  function openEdit(t: TxItem) {
    setError(null);
    setForm({
      id: t.id,
      type: t.type,
      amount: String(t.amount),
      date: t.date.slice(0, 10),
      categoryId: t.categoryId,
      description: t.description,
      holdingId: t.holdingId ?? "",
      unitPrice: t.unitPrice ? String(t.unitPrice) : "",
      cashHoldingId: t.cashHoldingId ?? "",
    });
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name || !form) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: form.type }),
    });
    if (res.ok) {
      const created = await res.json();
      setCategories((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created]
      );
      setForm((f) => (f ? { ...f, categoryId: created.id } : f));
      setNewCategory("");
    }
  }

  async function submit() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        categoryId: form.categoryId,
        description: form.description,
        holdingId: form.type === "INVEST" ? form.holdingId || null : null,
        unitPrice: form.type === "INVEST" ? Number(form.unitPrice) || null : null,
        cashHoldingId: form.type === "INVEST" ? form.cashHoldingId || null : null,
      };
      const res = await fetch(form.id ? `/api/transactions/${form.id}` : "/api/transactions", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "保存失败");
      }
      setForm(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      setDeletingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const units =
    form && form.type === "INVEST" && Number(form.amount) > 0 && Number(form.unitPrice) > 0
      ? Number(form.amount) / Number(form.unitPrice)
      : null;

  function renderRow(t: TxItem) {
    const meta = TYPE_META[t.type];
    return (
      // 手机排成两行（描述一行、金额与操作一行），桌面用 sm:contents 把包裹层摊平，
      // 版面跟改动前完全一样
      <div key={t.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:contents">
          {sortBy !== "date" && (
            <span className="w-12 shrink-0 text-xs text-ink-muted tabular-nums">{t.date.slice(5, 10)}</span>
          )}
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-secondary">
            {t.type === "INVEST" ? (t.holdingLabel ?? "投资") : (t.categoryName ?? "未分类")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {t.description || (t.type === "INVEST" ? `买入 ${t.holdingLabel}` : meta.label)}
            {t.type === "INVEST" && t.units && (
              <span className="ml-2 hidden text-xs text-ink-muted tabular-nums sm:inline">
                {t.units.toFixed(4)} 份 @ {t.unitPrice}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:contents">
          {/* 份数在手机挤不进描述那行，挪来第二行；桌面隐藏，由上面那个负责 */}
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted tabular-nums sm:hidden">
            {t.type === "INVEST" && t.units ? `${t.units.toFixed(4)} 份 @ ${t.unitPrice}` : ""}
          </span>
          <span className={`shrink-0 text-sm font-medium tabular-nums ${meta.cls}`}>
            {meta.sign}
            {t.currency === "MYR"
              ? formatMYR(t.amount)
              : `${t.currency} ${t.amount.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`}
          </span>
        {deletingId === t.id ? (
          <span className="flex shrink-0 items-center gap-2 text-xs">
            <button type="button" onClick={() => setDeletingId(null)} className="text-ink-secondary hover:text-ink">取消</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(t.id)}
              className="font-medium text-critical disabled:opacity-50"
            >
              {t.type === "INVEST" ? "删除并回滚持仓" : "确定删除"}
            </button>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-2 text-xs">
            <button type="button" onClick={() => openEdit(t)} className="text-ink-secondary hover:text-ink">编辑</button>
            <button type="button" onClick={() => setDeletingId(t.id)} className="text-ink-secondary hover:text-critical">删除</button>
          </span>
        )}
        </div>
      </div>
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
              title="转帐是自己户口之间的搬运，两侧各一笔，对收支净额是零"
            >
              {showTransfers ? "隐藏" : "显示"}转帐（{transferCount}）
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>汇入对帐单</Button>
          <Button onClick={() => { setError(null); setForm(emptyForm()); }}>+ 记一笔</Button>
        </div>
      </div>

      {/* 流水列表：按日期排序时按日分组显示，按分类/金额排序时改平铺列表（每行自带日期） */}
      {sortedItems.length === 0 && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted">
          本月还没有记录，点「记一笔」开始
        </div>
      )}
      {sortBy === "date"
        ? grouped.map(([day, dayItems]) => (
            <div key={day}>
              <div className="mb-1 text-xs font-medium text-ink-muted">{day}</div>
              <div className="card divide-y divide-line">{dayItems.map(renderRow)}</div>
            </div>
          ))
        : sortedItems.length > 0 && (
            <div className="card divide-y divide-line">{sortedItems.map(renderRow)}</div>
          )}

      {/* 快速记账弹窗：portal 到 body，避开 page.tsx 的 .animate-in transform 容器 */}
      {form && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setForm(null)}>
          <div
            className="card flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-6 pt-6 pb-4">
              <div className="mb-4 text-sm font-medium text-ink">{form.id ? "编辑记录" : "记一笔"}</div>

              {/* 类型 tabs */}
              <div className="flex rounded-full border border-line p-0.5">
                {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t, categoryId: null })}
                    className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.type === t ? "bg-portfolio-accent text-primary-foreground" : "text-ink-secondary hover:text-ink"
                    }`}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto px-6 pb-4">
              <div className="flex gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={form.type === "INVEST" ? "金额（持仓币种）" : "金额（MYR）"}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  autoFocus
                />
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </div>

              {form.type !== "INVEST" ? (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {typeCategories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setForm({ ...form, categoryId: c.id })}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                          form.categoryId === c.id
                            ? "bg-portfolio-accent text-primary-foreground"
                            : "border border-line text-ink-secondary hover:text-ink"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="+ 新分类"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCategory()}
                      className="w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink"
                    />
                    {newCategory.trim() && (
                      <button type="button" onClick={addCategory} className="text-xs text-portfolio-accent-deep">创建</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <select
                    value={form.holdingId}
                    onChange={(e) => {
                      const h = nonCashHoldings.find((x) => x.id === e.target.value);
                      setForm({
                        ...form,
                        holdingId: e.target.value,
                        unitPrice: h ? String(h.lastPrice ?? h.costBasis) : "",
                        cashHoldingId: "",
                      });
                    }}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">选择目标持仓…</option>
                    {nonCashHoldings.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.symbol ?? h.name}（{h.currency}）
                      </option>
                    ))}
                  </select>

                  {newHolding ? (
                    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
                      <div className="text-xs font-medium text-ink-muted">新持仓</div>
                      <input
                        autoFocus
                        placeholder="名称，例如 EPF 公积金"
                        value={newHolding.name}
                        onChange={(e) => setNewHolding({ ...newHolding, name: e.target.value })}
                        className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                      <div className="flex gap-2">
                        <select
                          value={newHolding.accountId}
                          onChange={(e) => {
                            const a = accounts.find((x) => x.id === e.target.value);
                            setNewHolding({ ...newHolding, accountId: e.target.value, currency: a?.currency ?? "MYR" });
                          }}
                          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                        >
                          <option value="">选择户口…</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <select
                          value={newHolding.assetType}
                          onChange={(e) => setNewHolding({ ...newHolding, assetType: e.target.value })}
                          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                        >
                          <option value="FUND">基金 / 定存 / 公积金</option>
                          <option value="STOCK">股票</option>
                          <option value="ETF">ETF</option>
                          <option value="CRYPTO">加密货币</option>
                        </select>
                      </div>
                      <p className="text-xs text-ink-muted">
                        没有「现金」选项 —— 现金持仓不能当投资目标，建了也选不到。
                        定存、公积金这类请选<strong>基金</strong>。
                      </p>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setNewHolding(null)}
                          className="text-xs text-ink-secondary hover:text-ink">取消</button>
                        <button
                          type="button"
                          disabled={creatingHolding || !newHolding.name.trim() || !newHolding.accountId}
                          onClick={createHolding}
                          className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-50"
                        >
                          {creatingHolding ? "建立中…" : "建立并选用"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNewHolding({ accountId: "", name: "", assetType: "FUND", currency: "MYR" })}
                      className="self-start text-xs font-medium text-ai-accent hover:opacity-80"
                    >
                      + 新增持仓
                    </button>
                  )}
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="买入单价（NAV）"
                      value={form.unitPrice}
                      onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                      className="w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                    {units !== null && (
                      <span className="text-xs text-ink-muted tabular-nums">≈ {units.toFixed(4)} 份</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted">
                    填成交当天的<strong>单位净值 NAV</strong>，份额会自己算。
                    单位信托的 NAV 通常在 RM 0.2–1.5 之间，去 Public Mutual 网站/App 的交易确认书查。
                    填错单价，份额和之后的报酬率就跟着错。
                  </p>
                  <select
                    value={form.cashHoldingId}
                    onChange={(e) => setForm({ ...form, cashHoldingId: e.target.value })}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">不从现金持仓扣款（外部资金）</option>
                    {eligibleCash.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}（{formatMYR(h.costBasis)}）
                      </option>
                    ))}
                  </select>
                </>
              )}

              <input
                type="text"
                placeholder="备注（选填）：这笔是给什么的"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>

            <div className="shrink-0 border-t border-line px-6 py-4">
              {error && <div className="mb-3 text-sm text-critical">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={() => setForm(null)}>取消</Button>
                <Button disabled={busy || !form.amount} onClick={submit}>
                  {busy ? "保存中…" : "保存"}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showImport && <PdfImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
