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
  counterCashHoldingId: string | null;
  counterAmount: number | null;
  reimbursable: number | null;
  settlesTransactionId: string | null;
};

/** 待收回的垫付，给「这笔还款在冲销哪一笔」的下拉用 */
export type OutstandingOption = {
  id: string;
  date: Date;
  description: string;
  currency: string;
  outstanding: number;
};

export type CategoryOption = { id: string; name: string; type: string; usageCount?: number };
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

/**
 * 户口下拉的文案。以前这里叫「现金池」——那是内部资料模型的名字，
 * 使用者脑子里想的是「我用哪张卡/哪个钱包付的」，两者对不上，
 * 结果就是大家一路用预设的「不指定」，记了一整个月余额纹丝不动。
 *
 * 所以：改叫户口、给每种类型各自的问法，并且预设会带上次用过的那个。
 */
const CASH_POOL_META = {
  INCOME: {
    label: "钱进了哪个户口",
    none: "收现金（没进任何户口）",
    hint: "选了这个户口的余额才会增加。金额币种跟着所选户口走。",
  },
  EXPENSE: {
    label: "用哪个户口付的",
    none: "付现金（不从户口扣）",
    hint: "选了这个户口的余额才会减少。金额币种跟着所选户口走。",
  },
  INVEST: {
    label: "从哪个户口扣款",
    none: "不从户口扣款（外部资金）",
    hint: "扣款户口必须与目标持仓同币种。",
  },
  TRANSFER: {
    label: "从哪个户口转出",
    none: "转出侧不在系统里",
    hint: "转出与转入都选好，这笔就只是钱换个地方放，不会被算成收入或支出。",
  },
} as const;

/** 记住上次用的户口，下次记账直接预选 —— 日常记账九成都是同一张卡 */
const LAST_POOL_KEY = "wa-last-cash-pool";

/** 分类药丸先只露出这么多个，其余收进「更多」 */
const CATEGORY_PREVIEW_COUNT = 8;

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
  /** TRANSFER：钱转进哪个户口 */
  counterCashHoldingId: string;
  /** TRANSFER：转入侧金额。跨币种时两边不相等，必须分开填 */
  counterAmount: string;
  /** EXPENSE：这笔里垫付给别人的金额 */
  reimbursable: string;
  /** 均分人数。只存在于表单，算完写进 reimbursable 就没它的事了 */
  splitCount: string;
  /** INCOME：这笔还款在冲销哪一笔垫付 */
  settlesTransactionId: string;
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
    counterCashHoldingId: "",
    counterAmount: "",
    reimbursable: "",
    splitCount: "",
    settlesTransactionId: "",
  };
}

/**
 * 空表单 + 预先选好的户口：优先上次用过的那个，只有一个户口时直接用它。
 *
 * 「不指定户口」以前是预设值，代价是记的帐完全不影响余额，而且没有任何提示。
 * localStorage 在服务端读不到，所以有 window 判断；这不会造成 hydration 不一致 ——
 * 弹窗本身被 mounted 挡着，SSR 阶段根本不输出。
 */
function newFormWithPool(
  type: FormState["type"],
  cashHoldings: HoldingOption[],
  defaultCashHoldingId: string | null
): FormState {
  const base = emptyForm(type);
  if (type === "INVEST" || cashHoldings.length === 0) return base;

  let remembered: string | null = null;
  if (typeof window !== "undefined") {
    try {
      remembered = window.localStorage.getItem(LAST_POOL_KEY);
    } catch {
      // 隐私模式之类读不到 storage，退回「没有预设」就好
      remembered = null;
    }
  }
  const preset =
    cashHoldings.find((h) => h.id === remembered) ??
    (cashHoldings.length === 1 ? cashHoldings[0] : null) ??
    // 全新使用者还没有 localStorage 记忆，而户口有好几个 —— 以前这里落到「不指定」，
    // 记出来的帐不影响余额推导。改成服务端算好的主力户口（余额最大的那个）。
    cashHoldings.find((h) => h.id === defaultCashHoldingId) ??
    null;
  return preset ? { ...base, cashHoldingId: preset.id } : base;
}

export default function CashflowManager({
  items,
  categories: initialCategories,
  holdings,
  accounts,
  outstanding = [],
  autoOpen = false,
  defaultCashHoldingId = null,
}: {
  items: TxItem[];
  categories: CategoryOption[];
  holdings: HoldingOption[];
  accounts: { id: string; name: string; currency: string }[];
  outstanding?: OutstandingOption[];
  autoOpen?: boolean;
  /** 还没有 localStorage 记忆时预选哪个户口（服务端按余额算好的主力户口） */
  defaultCashHoldingId?: string | null;
}) {
  const router = useRouter();
  // 首页「+ 记一笔」带 ?add=1 进来时直接开好表单，且走跟手动开表单同一套户口预设
  const [form, setForm] = useState<FormState | null>(() =>
    autoOpen
      ? newFormWithPool("EXPENSE", holdings.filter((h) => h.assetType === "CASH"), defaultCashHoldingId)
      : null
  );
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

  function openNew(type: FormState["type"] = "EXPENSE") {
    setError(null);
    setForm(newFormWithPool(type, cashHoldings, defaultCashHoldingId));
  }

  const targetHolding = nonCashHoldings.find((h) => h.id === form?.holdingId) ?? null;
  // 扣款现金必须与目标持仓同币种（服务端也会校验，这里先过滤掉选不了的）
  const eligibleCash = targetHolding
    ? cashHoldings.filter((h) => h.currency === targetHolding.currency)
    : cashHoldings;

  // 按用过的次数排，常用的排前面。以前按名字排，结果最高频的「餐饮」在 21 个药丸的最末位，
  // 记一顿午餐得先扫完整面墙。次数相同的仍按名字排，顺序才稳定（不会每次开表单跳动）。
  const typeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.type === form?.type)
        .slice()
        .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0) || a.name.localeCompare(b.name, "en")),
    [categories, form?.type]
  );

  // 只先露出常用的那几个，其余收起来 —— 展开是一次点击，扫描 21 个药丸是每次都要付的成本
  const [showAllCategories, setShowAllCategories] = useState(false);
  const visibleCategories = showAllCategories
    ? typeCategories
    : typeCategories.slice(0, CATEGORY_PREVIEW_COUNT);
  const hiddenCategoryCount = typeCategories.length - visibleCategories.length;

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
      counterCashHoldingId: t.counterCashHoldingId ?? "",
      counterAmount: t.counterAmount ? String(t.counterAmount) : "",
      reimbursable: t.reimbursable ? String(t.reimbursable) : "",
      // 人数只是算垫付额的输入法，算完就没意义了，编辑时不回推
      splitCount: "",
      settlesTransactionId: t.settlesTransactionId ?? "",
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
        cashHoldingId: form.cashHoldingId || null,
        counterCashHoldingId:
          form.type === "TRANSFER" ? form.counterCashHoldingId || null : null,
        counterAmount:
          form.type === "TRANSFER" ? Number(form.counterAmount) || null : null,
        reimbursable: form.type === "EXPENSE" ? Number(form.reimbursable) || null : null,
        settlesTransactionId:
          form.type === "INCOME" ? form.settlesTransactionId || null : null,
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
      // 记住这次用的户口，下一笔直接预选
      if (form.cashHoldingId) {
        try {
          window.localStorage.setItem(LAST_POOL_KEY, form.cashHoldingId);
        } catch {
          // 隐私模式之类读不到 storage，预选没了而已，不该挡住记账
        }
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

  // 填了垫付额之后，「所以我自己到底花了多少」要当场看得见 —— 那才是会进支出统计的数
  const myShare =
    form && form.type === "EXPENSE" && Number(form.amount) > 0 && Number(form.reimbursable) > 0
      ? Number(form.amount) - Number(form.reimbursable)
      : null;

  // 金额栏的币种跟着所选户口走（服务端 resolveCashPool 就是这么定的）。
  // 以前这里写死「金额（MYR）」，选了澳币户口填 50 会被存成 50 澳币，没有任何提示。
  const selectedPool = cashHoldings.find((h) => h.id === form?.cashHoldingId) ?? null;
  const amountCurrency = selectedPool?.currency ?? "MYR";
  const counterPool = cashHoldings.find((h) => h.id === form?.counterCashHoldingId) ?? null;
  // 跨币种转帐两侧金额本来就不相等，转入金额必填，否则余额会被原样加错币种
  const crossCurrencyTransfer =
    form?.type === "TRANSFER" && counterPool !== null && counterPool.currency !== amountCurrency;
  const missingCounterAmount = crossCurrencyTransfer && !(Number(form?.counterAmount) > 0);

  function renderRow(t: TxItem) {
    const meta = TYPE_META[t.type];
    return (
      // 手机排成两行（描述一行、金额与操作一行），桌面用 sm:contents 把包裹层摊平，
      // 版面跟改动前完全一样
      <div key={t.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:contents">
          {sortBy !== "date" && (
            <span className="w-12 shrink-0 text-xs text-ink-muted font-mono tabular-nums">{t.date.slice(5, 10)}</span>
          )}
          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-secondary">
            {t.type === "INVEST" ? (t.holdingLabel ?? "投资") : (t.categoryName ?? "未分类")}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {t.description || (t.type === "INVEST" ? `买入 ${t.holdingLabel}` : meta.label)}
            {t.type === "INVEST" && t.units && (
              <span className="ml-2 hidden text-xs text-ink-muted font-mono tabular-nums sm:inline">
                {t.units.toFixed(4)} 份 @ {t.unitPrice}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:contents">
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
          <Button onClick={() => openNew()}>+ 记一笔</Button>
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
                  placeholder={
                    form.type === "INVEST"
                      ? "金额（持仓币种）"
                      : form.type === "TRANSFER"
                        ? `转出金额（${amountCurrency}）`
                        : `金额（${amountCurrency}）`
                  }
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
                    {visibleCategories.map((c) => (
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
                    {hiddenCategoryCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllCategories(true)}
                        className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-muted hover:text-ink"
                      >
                        更多 {hiddenCategoryCount} 个
                      </button>
                    )}
                    {showAllCategories && typeCategories.length > CATEGORY_PREVIEW_COUNT && (
                      <button
                        type="button"
                        onClick={() => setShowAllCategories(false)}
                        className="rounded-full px-3 py-1 text-xs text-ink-muted hover:text-ink"
                      >
                        收起
                      </button>
                    )}
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
                      <span className="text-xs text-ink-muted font-mono tabular-nums">≈ {units.toFixed(4)} 份</span>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted">
                    填成交当天的<strong>单位净值 NAV</strong>，份额会自己算。
                    单位信托的 NAV 通常在 RM 0.2–1.5 之间，去 Public Mutual 网站/App 的交易确认书查。
                    填错单价，份额和之后的报酬率就跟着错。
                  </p>
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-ink">
                  {CASH_POOL_META[form.type].label}
                </label>
                <select
                  value={form.cashHoldingId}
                  onChange={(e) => setForm({ ...form, cashHoldingId: e.target.value })}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                >
                  <option value="">{CASH_POOL_META[form.type].none}</option>
                  {eligibleCash.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}（{h.currency}）
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-muted">{CASH_POOL_META[form.type].hint}</p>
                {/* 没选户口 = 这笔不影响任何余额。以前这是预设值且毫无提示，
                    使用者记满一个月才发现余额没动过 */}
                {!form.cashHoldingId && form.type !== "INVEST" && cashHoldings.length > 0 && (
                  <p className="text-xs text-warning">
                    没选户口的话，这笔只进收支统计，任何余额都不会变动。
                  </p>
                )}
                {cashHoldings.length === 0 && (
                  <p className="text-xs text-warning">
                    还没有任何户口余额 —— 到本页上方的「现金余额」建一个，记账才能带动余额。
                  </p>
                )}
              </div>

              {form.type === "TRANSFER" && (
                <div className="flex flex-col gap-2 rounded-md border border-line p-3">
                  <label className="text-xs font-medium text-ink">钱转进哪个户口</label>
                  <select
                    value={form.counterCashHoldingId}
                    onChange={(e) =>
                      setForm({ ...form, counterCashHoldingId: e.target.value, counterAmount: "" })
                    }
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">转入侧不在系统里（余额只扣不加）</option>
                    {cashHoldings
                      .filter((h) => h.id !== form.cashHoldingId)
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}（{h.currency}）
                        </option>
                      ))}
                  </select>

                  {counterPool && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder={`转入金额（${counterPool.currency}）${crossCurrencyTransfer ? "" : "，同币种可留空"}`}
                        value={form.counterAmount}
                        onChange={(e) => setForm({ ...form, counterAmount: e.target.value })}
                        className="w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </div>
                  )}
                  {crossCurrencyTransfer && (
                    <p className="text-xs text-warning">
                      转出 {amountCurrency}、转入 {counterPool!.currency} —— 两边金额不相等，
                      转入侧实际到帐多少要照实填（系统不会替你换算）。
                    </p>
                  )}
                  <p className="text-xs text-ink-muted">
                    两侧都选好，这笔钱只是换个地方放：转出户口扣、转入户口加，
                    收入和支出统计都不会动到。
                  </p>
                </div>
              )}

              {/* 垫付是进阶用法，日常记账九成用不到，但它以前一直摊开着占掉表单三分之一。
                  收进 details，编辑一笔已经填了垫付的记录时自动展开，否则找不到它在哪。 */}
              {form.type === "EXPENSE" && (
                <details
                  open={Number(form.reimbursable) > 0}
                  className="flex flex-col gap-2 rounded-md border border-line p-3"
                >
                  <summary className="cursor-pointer list-none text-xs font-medium text-ink-secondary hover:text-ink">
                    垫付了别人的钱？（选填）
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="其中垫付"
                      value={form.reimbursable}
                      onChange={(e) =>
                        setForm({ ...form, reimbursable: e.target.value, splitCount: "" })
                      }
                      className="w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                    />
                    <span className="shrink-0 text-xs text-ink-muted">或均分</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="人数"
                      value={form.splitCount}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        const total = Number(form.amount);
                        // 均分只是「帮你算出垫付额」的输入法：n 个人分总额，
                        // 自己那份留下，其余都是垫出去的
                        const share = n > 1 && total > 0 ? (total * (n - 1)) / n : null;
                        setForm({
                          ...form,
                          splitCount: e.target.value,
                          reimbursable: share !== null ? share.toFixed(2) : form.reimbursable,
                        });
                      }}
                      className="w-16 shrink-0 rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink"
                    />
                    <span className="shrink-0 text-xs text-ink-muted">人</span>
                  </div>
                  {myShare !== null && (
                    <p className="text-xs text-ink-muted font-mono tabular-nums">
                      我自己那份 <strong className="text-ink">{myShare.toFixed(2)}</strong>
                      　待收回 {Number(form.reimbursable).toFixed(2)}
                    </p>
                  )}
                  <p className="text-xs text-ink-muted">
                    垫出去的钱不算你的支出（它只是变成了别人欠你的），但现金余额照样扣全额。
                  </p>
                  </div>
                </details>
              )}

              {form.type === "INCOME" && outstanding.length > 0 && (
                <div className="flex flex-col gap-1">
                  <select
                    value={form.settlesTransactionId}
                    onChange={(e) => setForm({ ...form, settlesTransactionId: e.target.value })}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">不是还款（这是真的收入）</option>
                    {outstanding.map((o) => (
                      <option key={o.id} value={o.id}>
                        {new Date(o.date).toISOString().slice(0, 10)}　{o.description || "（无备注）"}
                        　还差 {o.outstanding.toFixed(2)} {o.currency}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-ink-muted">
                    选了的话这笔不算收入 —— 它只是把之前垫出去的钱收回来。现金余额照常增加。
                  </p>
                </div>
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
                <Button disabled={busy || !form.amount || missingCounterAmount} onClick={submit}>
                  {busy ? "保存中…" : missingCounterAmount ? "请填转入金额" : "保存"}
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
