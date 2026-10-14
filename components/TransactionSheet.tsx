"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight, Award, BadgePercent, Briefcase, Car, CircleEllipsis, Dices,
  Dumbbell, Gamepad2, Gift, HandCoins, HeartPulse, Home, PawPrint, Plane,
  Repeat, Scissors, ShieldCheck, ShoppingBasket, Smartphone, Tag, TrendingUp,
  Utensils, Wine, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  POOL_BY_CATEGORY_KEY, dateShortcuts, poolForCategory, readPoolMemory, rememberPool,
} from "@/lib/quickAdd";
import type { CategoryOption, HoldingOption, OutstandingOption, TxItem } from "@/components/cashflowTypes";

// 记一笔的表单。从 CashflowManager 搬出来独立成件，因为 ⊕ 要能在任何页面拉起它（P1-02）。
// 版型是 bottom sheet（P1-01）：拇指在屏幕下半，居中弹窗把金额栏推到够不着的地方。

const TYPE_META = {
  EXPENSE: { label: "支出" },
  INCOME: { label: "收入" },
  INVEST: { label: "投资" },
  TRANSFER: { label: "转账" },
} as const;

/**
 * 户口下拉的文案。以前这里叫「现金池」——那是内部资料模型的名字，
 * 使用者脑子里想的是「我用哪张卡/哪个钱包付的」，两者对不上，
 * 结果就是大家一路用预设的「不指定」，记了一整个月余额纹丝不动。
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
    label: "钱从哪个户口出",
    none: "不从户口扣（只记投资，不动余额）",
    hint: "选了这个户口的余额才会减少，且币种必须跟目标持仓一致。",
  },
  TRANSFER: {
    label: "钱从哪个户口转出",
    none: "转出侧不在系统里（余额只加不扣）",
    hint: "转出与转入都选好，这笔就只是钱换个地方放，不会被算成收入或支出。",
  },
} as const;

/** 记住上次用的户口，下次记账直接预选 —— 日常记账九成都是同一张卡 */
const LAST_POOL_KEY = "wa-last-cash-pool";

/** 分类格子先只露出这么多个（4 栏 × 2 排），其余收进「展开全部」 */
const CATEGORY_PREVIEW_COUNT = 8;

/**
 * 分类图标。分类名是使用者自己打的字，没有固定集合，所以按关键字子串比对、
 * 第一个命中的赢，落不到就给个通用 tag —— 新分类不会因为没图标而变成空格子。
 * 图标全部取自已经装着的 lucide-react，不另外画 SVG。
 */
const CATEGORY_ICONS: [string, typeof Tag][] = [
  ["餐饮", Utensils], ["吃", Utensils], ["酒", Wine],
  ["交通", Car], ["车", Car],
  ["日用", ShoppingBasket], ["购物", ShoppingBasket],
  ["运动", Dumbbell], ["旅游", Plane], ["宠物", PawPrint],
  ["房", Home], ["家用", Home], ["水电", Zap],
  ["险", ShieldCheck], ["订阅", Repeat], ["医疗", HeartPulse],
  ["娱乐", Gamepad2], ["人情", Gift], ["理发", Scissors], ["博弈", Dices],
  ["工资", Briefcase], ["奖金", Award], ["还钱", HandCoins],
  ["返还", BadgePercent], ["利息", TrendingUp], ["股息", TrendingUp], ["投资", TrendingUp],
  ["钱包", Smartphone], ["转", ArrowLeftRight],
  ["其他", CircleEllipsis],
];

function categoryIcon(name: string) {
  return CATEGORY_ICONS.find(([kw]) => name.includes(kw))?.[1] ?? Tag;
}

export type FormState = {
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

export function todayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

function emptyForm(type: FormState["type"] = "EXPENSE"): FormState {
  return {
    id: null, type, amount: "", date: todayStr(), categoryId: null, description: "",
    holdingId: "", unitPrice: "", cashHoldingId: "", counterCashHoldingId: "",
    counterAmount: "", reimbursable: "", splitCount: "", settlesTransactionId: "",
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

function formFromTx(t: TxItem): FormState {
  return {
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
  };
}

const INPUT = "rounded-md border border-line bg-surface px-3 py-2 text-base text-ink";

export default function TransactionSheet({
  edit = null,
  categories: initialCategories,
  holdings,
  accounts,
  outstanding = [],
  defaultCashHoldingId = null,
  onClose,
  onDelete,
}: {
  /** 有值就是编辑既有记录，没有就是记新的一笔 */
  edit?: TxItem | null;
  categories: CategoryOption[];
  holdings: HoldingOption[];
  accounts: { id: string; name: string; currency: string }[];
  outstanding?: OutstandingOption[];
  defaultCashHoldingId?: string | null;
  onClose: () => void;
  /** 编辑模式才有：交给列表做「已删除 · 撤销」（真正的 DELETE 延后发） */
  onDelete?: () => void;
}) {
  const router = useRouter();
  const cashHoldings = useMemo(() => holdings.filter((h) => h.assetType === "CASH"), [holdings]);
  const nonCashHoldings = holdings.filter((h) => h.assetType !== "CASH");

  const [form, setForm] = useState<FormState>(() =>
    edit ? formFromTx(edit) : newFormWithPool("EXPENSE", cashHoldings, defaultCashHoldingId)
  );
  const [categories, setCategories] = useState(initialCategories);
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // 存完不直接关掉：留一条「已保存 · 撤销 / 再记一笔」。存完就消失的话，
  // 使用者不知道成功没有，而记错的那笔要重新找出来才能删（改版硬红线两条）。
  const [savedId, setSavedId] = useState<string | null>(null);
  // 就地建目标持仓：以前要跳去持仓页建好再回来，中途表单内容全丢。
  const [newHolding, setNewHolding] = useState<{
    accountId: string; name: string; assetType: string; currency: string;
  } | null>(null);
  const [creatingHolding, setCreatingHolding] = useState(false);
  // 弹窗要 portal 到 document.body，跳出 page.tsx 的 `.animate-in`（transform 动画会让
  // fixed 定位以它为基准而不是 viewport，弹窗会跟着页面滚动跑位）。SSR 阶段没有 document，
  // 用 mounted 挡一帧，避免 hydration mismatch。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 就地建持仓。资产类型刻意不提供 CASH：现金持仓会被投资目标下拉过滤掉，
  // 在这里建一个现金类等于建了一个马上就选不到的东西。
  async function createHolding() {
    if (!newHolding) return;
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

  const targetHolding = nonCashHoldings.find((h) => h.id === form.holdingId) ?? null;
  // 扣款现金必须与目标持仓同币种（服务端也会校验，这里先过滤掉选不了的）
  const eligibleCash = targetHolding
    ? cashHoldings.filter((h) => h.currency === targetHolding.currency)
    : cashHoldings;

  // 按用过的次数排，常用的排前面。以前按名字排，结果最高频的「餐饮」在 21 个药丸的最末位，
  // 记一顿午餐得先扫完整面墙。次数相同的仍按名字排，顺序才稳定（不会每次开表单跳动）。
  const typeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.type === form.type)
        .slice()
        .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0) || a.name.localeCompare(b.name, "en")),
    [categories, form.type]
  );
  const visibleCategories = showAllCategories
    ? typeCategories
    : typeCategories.slice(0, CATEGORY_PREVIEW_COUNT);

  /** 选分类时顺手把这个分类上次用的户口带出来（餐饮 → TNG、日用 → PBE） */
  function pickCategory(categoryId: string) {
    let memory: Record<string, string> = {};
    try {
      memory = readPoolMemory(window.localStorage.getItem(POOL_BY_CATEGORY_KEY));
    } catch {
      // 读不到 storage 就当没有记忆，户口保持现状
    }
    setForm({
      ...form,
      categoryId,
      cashHoldingId:
        form.type === "INVEST"
          ? form.cashHoldingId
          : poolForCategory(categoryId, memory, eligibleCash.map((h) => h.id), form.cashHoldingId),
    });
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: form.type }),
    });
    if (res.ok) {
      const created = await res.json();
      setCategories((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
      setForm((f) => ({ ...f, categoryId: created.id }));
      setNewCategory("");
    }
  }

  async function submit() {
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
        counterCashHoldingId: form.type === "TRANSFER" ? form.counterCashHoldingId || null : null,
        counterAmount: form.type === "TRANSFER" ? Number(form.counterAmount) || null : null,
        reimbursable: form.type === "EXPENSE" ? Number(form.reimbursable) || null : null,
        settlesTransactionId: form.type === "INCOME" ? form.settlesTransactionId || null : null,
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
      const saved = await res.json().catch(() => null);
      // 记住这次用的户口：全域一个、这个分类一个。下一笔两边都能预选。
      if (form.cashHoldingId) {
        try {
          window.localStorage.setItem(LAST_POOL_KEY, form.cashHoldingId);
          const memory = readPoolMemory(window.localStorage.getItem(POOL_BY_CATEGORY_KEY));
          window.localStorage.setItem(
            POOL_BY_CATEGORY_KEY,
            JSON.stringify(rememberPool(memory, form.categoryId, form.cashHoldingId))
          );
        } catch {
          // 隐私模式之类写不进 storage，预选没了而已，不该挡住记账
        }
      }
      router.refresh();
      // 编辑既有记录没有「撤销」可言（原值已经被覆盖），直接关掉
      if (form.id) onClose();
      else setSavedId(saved?.id ?? "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!savedId) return;
    setBusy(true);
    try {
      await fetch(`/api/transactions/${savedId}`, { method: "DELETE" });
      router.refresh();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const units =
    form.type === "INVEST" && Number(form.amount) > 0 && Number(form.unitPrice) > 0
      ? Number(form.amount) / Number(form.unitPrice)
      : null;

  // 填了垫付额之后，「所以我自己到底花了多少」要当场看得见 —— 那才是会进支出统计的数
  const myShare =
    form.type === "EXPENSE" && Number(form.amount) > 0 && Number(form.reimbursable) > 0
      ? Number(form.amount) - Number(form.reimbursable)
      : null;

  // 金额栏的币种跟着所选户口走（服务端 resolveCashPool 就是这么定的）。
  // 以前这里写死「金额（MYR）」，选了澳币户口填 50 会被存成 50 澳币，没有任何提示。
  const selectedPool = cashHoldings.find((h) => h.id === form.cashHoldingId) ?? null;
  const amountCurrency = selectedPool?.currency ?? "MYR";
  const counterPool = cashHoldings.find((h) => h.id === form.counterCashHoldingId) ?? null;
  // 跨币种转账两侧金额本来就不相等，转入金额必填，否则余额会被原样加错币种
  const crossCurrencyTransfer =
    form.type === "TRANSFER" && counterPool !== null && counterPool.currency !== amountCurrency;
  const missingCounterAmount = crossCurrencyTransfer && !(Number(form.counterAmount) > 0);

  if (!mounted) return null;

  // 存完之后整个表单换成一条 snackbar。留在原地而不是弹在角落，
  // 是因为下一个动作（撤销／再记一笔）九成就在这一秒内发生。
  if (savedId !== null) {
    return createPortal(
      <div
        // 手机要让开底部那条 tab bar（min-h-14 ＋ 安全区），压在上面等于把「撤销」
        // 叠在「总览／收支」按钮上，点哪个都赌运气。桌面没有 tab bar，不必让
        className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-4"
      >
        <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-xl bg-ink px-4 py-2 text-surface shadow-lg">
          <span className="flex-1 text-sm">✓ 已保存</span>
          {savedId && (
            <button
              type="button"
              disabled={busy}
              onClick={undo}
              className="min-h-11 px-2 text-sm font-medium underline underline-offset-4 disabled:opacity-50"
            >
              撤销
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSavedId(null);
              setForm(newFormWithPool(form.type, cashHoldings, defaultCashHoldingId));
            }}
            className="min-h-11 rounded-lg bg-surface px-3 text-sm font-medium text-ink"
          >
            再记一笔
          </button>
          <button type="button" aria-label="关闭" onClick={onClose} className="min-h-11 px-1 text-sm opacity-70">
            ✕
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      {/* bottom sheet：手机贴底（拇指够得着），sm 以上恢复成居中卡片 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && form.amount && !missingCounterAmount) submit();
        }}
        className="card flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none rounded-t-2xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="shrink-0 px-5 pt-3 pb-3">
          {/* 抓手：bottom sheet 的惯例，也顺便把内容往下推开一点 */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />

          {/* 类型 tabs */}
          <div className="flex rounded-full border border-line p-0.5">
            {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t, categoryId: null })}
                className={`min-h-11 flex-1 rounded-full px-3 text-sm font-medium transition-colors ${
                  form.type === t
                    ? "bg-portfolio-accent text-primary-foreground"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                {TYPE_META[t].label}
              </button>
            ))}
          </div>

          {/* 金额摆在最上面、字够大。记一笔的第一个动作永远是敲金额，
              它以前跟日期挤在同一行、只有 14px，是整个流程最常点错的地方。
              text-3xl 远大于 16px，iOS 不会自动放大页面。 */}
          <div className="mt-3 flex items-baseline gap-2 border-b border-line pb-2">
            <span className="text-sm text-ink-muted">{amountCurrency}</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              // 藏掉 number input 的上下箭头：金额是敲出来的，一次 0.01 的步进按钮
              // 只是在这么大的字级旁边多两个点得到、点了没用的目标
              className="w-0 flex-1 appearance-none bg-transparent text-3xl font-semibold text-ink tabular-nums outline-none placeholder:text-ink-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              autoFocus
            />
          </div>

          {/* 日期九成是这三天，不必每次开 native picker 点三下 */}
          <div className="mt-2 flex items-center gap-2">
            {dateShortcuts(todayStr()).map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setForm({ ...form, date: d.value })}
                className={`min-h-11 shrink-0 rounded-full px-3 text-sm transition-colors ${
                  form.date === d.value
                    ? "bg-portfolio-accent text-primary-foreground"
                    : "border border-line text-ink-secondary"
                }`}
              >
                {d.label}
              </button>
            ))}
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={`${INPUT} min-h-11 w-0 flex-1 text-sm`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-4">
          {form.type !== "INVEST" ? (
            <>
              {/* 4 栏格子，每格 >= 44px。药丸排版下「餐饮」和「房租水电」宽度差三倍，
                  位置每次都在跳；固定格子才能靠肌肉记忆点。 */}
              <div className="grid grid-cols-4 gap-2">
                {visibleCategories.map((c) => {
                  const Icon = categoryIcon(c.name);
                  const active = form.categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCategory(c.id)}
                      className={`flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs transition-colors ${
                        active
                          ? "bg-portfolio-accent text-primary-foreground"
                          : "border border-line text-ink-secondary"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="w-full truncate text-center">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              {typeCategories.length > CATEGORY_PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllCategories((v) => !v)}
                  className="min-h-11 text-xs text-ink-muted hover:text-ink"
                >
                  {showAllCategories ? "收起" : `展开全部 ${typeCategories.length} 个分类`}
                </button>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="+ 新分类"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    // 这里的 Enter 是「建分类」，不能让它冒泡去提交整张表单
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCategory();
                    }
                  }}
                  className={`${INPUT} w-0 flex-1 py-1.5 text-sm`}
                />
                {newCategory.trim() && (
                  <button type="button" onClick={addCategory} className="text-xs text-portfolio-accent-deep">
                    创建
                  </button>
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
                className={INPUT}
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
                    className={INPUT}
                  />
                  <div className="flex gap-2">
                    <select
                      value={newHolding.accountId}
                      onChange={(e) => {
                        const a = accounts.find((x) => x.id === e.target.value);
                        setNewHolding({
                          ...newHolding,
                          accountId: e.target.value,
                          currency: a?.currency ?? "MYR",
                        });
                      }}
                      className={`${INPUT} min-w-0 flex-1`}
                    >
                      <option value="">选择户口…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                    <select
                      value={newHolding.assetType}
                      onChange={(e) => setNewHolding({ ...newHolding, assetType: e.target.value })}
                      className={INPUT}
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
                    <button
                      type="button"
                      onClick={() => setNewHolding(null)}
                      className="text-xs text-ink-secondary hover:text-ink"
                    >
                      取消
                    </button>
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
                  className={`${INPUT} w-0 flex-1`}
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
            <label className="text-xs font-medium text-ink">{CASH_POOL_META[form.type].label}</label>
            <select
              value={form.cashHoldingId}
              onChange={(e) => setForm({ ...form, cashHoldingId: e.target.value })}
              className={INPUT}
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
                还没有任何户口余额 —— 到收支页上方的「现金余额」建一个，记账才能带动余额。
              </p>
            )}
          </div>

          {form.type === "TRANSFER" && (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <label className="text-xs font-medium text-ink">钱转进哪个户口</label>
              <select
                value={form.counterCashHoldingId}
                onChange={(e) => setForm({ ...form, counterCashHoldingId: e.target.value, counterAmount: "" })}
                className={INPUT}
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
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={`转入金额（${counterPool.currency}）${crossCurrencyTransfer ? "" : "，同币种可留空"}`}
                  value={form.counterAmount}
                  onChange={(e) => setForm({ ...form, counterAmount: e.target.value })}
                  className={INPUT}
                />
              )}
              {crossCurrencyTransfer && (
                <p className="text-xs text-warning">
                  转出 {amountCurrency}、转入 {counterPool!.currency} —— 两边金额不相等，
                  转入侧实际到账多少要照实填（系统不会替你换算）。
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
            <details open={Number(form.reimbursable) > 0} className="rounded-md border border-line p-3">
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
                    onChange={(e) => setForm({ ...form, reimbursable: e.target.value, splitCount: "" })}
                    className={`${INPUT} w-0 flex-1`}
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
                    className={`${INPUT} w-16 shrink-0 px-2`}
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
                className={INPUT}
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
            className={INPUT}
          />
        </div>

        <div className="shrink-0 border-t border-line px-5 py-3">
          {error && <div className="mb-3 text-sm text-critical">{error}</div>}
          <div className="flex justify-end gap-2">
            {edit && onDelete && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => (confirmingDelete ? onDelete() : setConfirmingDelete(true))}
                className="mr-auto text-critical"
              >
                {confirmingDelete ? (edit.type === "INVEST" ? "确定删除并回滚持仓" : "确定删除") : "删除"}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={busy || !form.amount || missingCounterAmount}>
              {busy ? "保存中…" : missingCounterAmount ? "请填转入金额" : "保存"}
            </Button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
