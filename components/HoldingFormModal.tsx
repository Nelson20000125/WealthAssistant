"use client";

import { useState } from "react";
import { DEFAULT_VALUATION } from "@/lib/holdingValidation";

type Account = { id: string; name: string; type: string; institution: string; currency: string };

export type HoldingFormValues = {
  id?: string;
  accountId: string;
  assetType: string;
  valuation: string;
  name: string;
  symbol: string;
  quantity: string;
  costBasis: string;
  currency: string;
  /** 建仓日，只在新增时用：非现金会用它当那笔 INVEST 记录的日期 */
  openedAt?: string;
  // 现金专用：余额由流水推导，能改的只有起点
  openingBalance?: string;
  openingBalanceDate?: string;
  derivedBalance?: number | null;
};

const ASSET_TYPE_OPTIONS = [
  { value: "STOCK", label: "股票" },
  { value: "ETF", label: "ETF" },
  { value: "FUND", label: "基金" },
  { value: "CASH", label: "现金" },
  { value: "CRYPTO", label: "加密货币" },
  { value: "PROPERTY", label: "房产" },
  { value: "COMMODITY", label: "商品（黄金等）" },
  { value: "DEPOSIT", label: "定存 / 公积金" },
  { value: "OTHER", label: "其他" },
];

const VALUATION_OPTIONS = [
  { value: "AUTO", label: "自动抓价", hint: "有交易所代号，系统每次刷新自动更新" },
  { value: "MANUAL_UNIT_PRICE", label: "手动填单价", hint: "有份额概念，你定期填每单位净值（如 Public Mutual 基金）" },
  { value: "MANUAL_VALUE", label: "手动填市值", hint: "没有份额概念，直接填现在总共值多少（如房产、定存）" },
  { value: "DERIVED", label: "由流水推导", hint: "现金专用：余额 = 期初 + 之后每一笔收支" },
];

// 选了资产类型就给一个合理的估值方式，使用者不需要先懂这两个轴的差别。
// 仍然可以自己改 —— 例如有些人的黄金是有报价代号的 ETF。
// 映射与後端共用同一份（lib/holdingValidation.ts），避免两边漂移。

const ACCOUNT_TYPE_OPTIONS = [
  { value: "BROKERAGE", label: "证券户" },
  { value: "FUND", label: "基金户" },
  { value: "BANK", label: "银行户" },
  { value: "CRYPTO", label: "加密货币户" },
];

const EMPTY_NEW_ACCOUNT = { name: "", type: "BROKERAGE", institution: "", currency: "" };

export default function HoldingFormModal({
  mode,
  initial,
  accounts,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: HoldingFormValues;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<HoldingFormValues>(initial);
  const [accountList, setAccountList] = useState<Account[]>(accounts);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_NEW_ACCOUNT);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);

  const update = (patch: Partial<HoldingFormValues>) => setValues((v) => ({ ...v, ...patch }));

  // 推导型现金：余额 = 期初 + 期初日之后的流水。今天的余额是算出来的结果，
  // 不是可以填的东西 —— 让人改它只会得到「改了没反应」，比不给改更糟。
  const isDerivedCash =
    mode === "edit" && values.assetType === "CASH" && values.openingBalance !== undefined;

  // 只有总市值、没有份额的持仓（房产、定存）：份额固定 1，成本填总额
  const isTotalValue = values.valuation === "MANUAL_VALUE";

  const handleCreateAccount = async () => {
    setCreatingAccount(true);
    setAccountError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      const data = await res.json();
      if (!res.ok) {
        setAccountError(data.error ?? "建立户口失败");
        setCreatingAccount(false);
        return;
      }
      setAccountList((list) => [...list, data.account]);
      update({ accountId: data.account.id });
      setShowNewAccount(false);
      setNewAccount(EMPTY_NEW_ACCOUNT);
    } catch {
      setAccountError("网络错误，建立户口失败");
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      accountId: values.accountId,
      assetType: values.assetType,
      valuation: values.valuation,
      name: values.name,
      symbol: values.symbol || null,
      // MANUAL_VALUE 没有份额概念：份额固定 1，总市值放在价格上（沿用现金的约定）
      quantity: values.valuation === "MANUAL_VALUE" ? 1 : Number(values.quantity),
      costBasis: Number(values.costBasis),
      currency: values.currency,
      ...(mode === "create" && values.openedAt ? { openedAt: values.openedAt } : {}),
      ...(isDerivedCash
        ? {
            openingBalance: Number(values.openingBalance),
            openingBalanceDate: values.openingBalanceDate
              ? new Date(values.openingBalanceDate).toISOString()
              : undefined,
          }
        : {}),
    };

    const url = mode === "create" ? "/api/holdings" : `/api/holdings/${values.id}`;
    const method = mode === "create" ? "POST" : "PUT";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "保存失败");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("网络错误，保存失败");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 text-base font-semibold text-ink">
          {mode === "create" ? "新增持仓" : "编辑持仓"}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">户口</span>
            <select
              required
              value={values.accountId}
              onChange={(e) => update({ accountId: e.target.value })}
              className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
            >
              <option value="" disabled>
                选择户口
              </option>
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {showNewAccount ? (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="text-xs font-medium text-ink-muted">新户口</div>
              <input
                value={newAccount.name}
                onChange={(e) => setNewAccount((v) => ({ ...v, name: e.target.value }))}
                placeholder="户口名称，例如 Rakuten Trade"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
              <select
                value={newAccount.type}
                onChange={(e) => setNewAccount((v) => ({ ...v, type: e.target.value }))}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              >
                {ACCOUNT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input
                value={newAccount.institution}
                onChange={(e) => setNewAccount((v) => ({ ...v, institution: e.target.value }))}
                placeholder="所属机构，例如 Rakuten Trade Sdn Bhd"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink"
              />
              <input
                value={newAccount.currency}
                onChange={(e) => setNewAccount((v) => ({ ...v, currency: e.target.value.toUpperCase() }))}
                placeholder="户口货币，例如 MYR"
                maxLength={3}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm uppercase text-ink outline-none focus:border-ink"
              />
              {accountError && (
                <div className="text-xs" style={{ color: "var(--critical)" }}>
                  {accountError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewAccount(false);
                    setAccountError(null);
                  }}
                  className="text-xs text-ink-secondary hover:text-ink"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={creatingAccount}
                  onClick={handleCreateAccount}
                  className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-50"
                >
                  {creatingAccount ? "建立中…" : "建立户口"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewAccount(true)}
              className="self-start text-xs font-medium text-ai-accent hover:opacity-80"
            >
              + 新增户口
            </button>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">资产类型</span>
            <select
              required
              value={values.assetType}
              onChange={(e) =>
                update({
                  assetType: e.target.value,
                  valuation: DEFAULT_VALUATION[e.target.value] ?? values.valuation,
                })
              }
              className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
            >
              {ASSET_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {values.assetType === "CASH" && (
              <p className="text-xs text-ink-muted">
                现金持仓<strong>不能</strong>当投资记录的目标 —— 投资的目标持仓下拉会把现金过滤掉。
              </p>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">估值方式</span>
            <select
              required
              value={values.valuation}
              onChange={(e) => update({ valuation: e.target.value })}
              className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
            >
              {VALUATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-muted">
              {VALUATION_OPTIONS.find((o) => o.value === values.valuation)?.hint}
            </p>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">名称</span>
            <input
              required
              value={values.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="例如 Vanguard S&P 500 ETF"
              className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
            />
          </label>

          {values.valuation === "AUTO" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">代号</span>
              <input
                required
                value={values.symbol}
                onChange={(e) => update({ symbol: e.target.value })}
                placeholder="例如 VOO"
                className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
              />
              <p className="text-xs text-ink-muted">
                自动抓价靠这个代号。抓不到价的标的请改选手动估值，否则盈亏会一直是 0。
              </p>
            </label>
          )}

          {isDerivedCash ? (
            <div className="flex flex-col gap-3 rounded-md border border-line p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-ink-muted">目前余额</span>
                <span className="font-mono tabular-nums text-base font-medium text-ink">
                  {values.derivedBalance != null
                    ? values.derivedBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "—"}{" "}
                  {values.currency}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                这个数字是<strong>算出来的</strong>：期初余额 + 期初日之后的每一笔流水。
                要改它，请改期初余额，或到「收支记录」补上缺的交易。
              </p>

              <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">期初余额</span>
                  <input
                    required
                    type="number"
                    step="any"
                    value={values.openingBalance ?? ""}
                    onChange={(e) => update({ openingBalance: e.target.value })}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">期初日</span>
                  <input
                    type="date"
                    value={values.openingBalanceDate ?? ""}
                    onChange={(e) => update({ openingBalanceDate: e.target.value })}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
                  />
                </label>
              </div>
              <p className="text-xs text-ink-muted">
                期初日<strong>当天及之前</strong>的交易不计入 —— 它们已经在期初余额里了。
              </p>
            </div>
          ) : (
            mode === "edit" ? (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">份额</span>
                  <span className="font-mono tabular-nums text-ink">{values.quantity}</span>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">
                    {isTotalValue ? "投入成本（总额）" : "每单位成本"}
                  </span>
                  <span className="font-mono tabular-nums text-ink">{values.costBasis}</span>
                </div>
              </div>
              <p className="text-xs text-ink-muted">
                这两个数字是<strong>算出来的</strong>：每一笔投资记录的加权平均。
                要更正请去「收支记录」改对应的投资记录，在这里改不会生效。
              </p>
            </div>
            ) : (
            <div className={isTotalValue ? "" : "grid grid-cols-2 gap-3"}>
              {/* MANUAL_VALUE 没有份额概念，份额固定 1、市值放在价格上，
                  所以不给填数量 —— 给了只会让人以为它有意义。 */}
              {!isTotalValue && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-muted">数量</span>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0"
                    value={values.quantity}
                    onChange={(e) => update({ quantity: e.target.value })}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
                  />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-muted">
                  {isTotalValue ? "投入成本（总额）" : "每单位成本"}
                </span>
                <input
                  required
                  type="number"
                  step="any"
                  min="0"
                  value={values.costBasis}
                  onChange={(e) => update({ costBasis: e.target.value })}
                  className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
                />
              </label>
            </div>
            )
          )}

          {mode === "create" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">建仓日期</span>
              <input
                type="date"
                value={values.openedAt ?? ""}
                onChange={(e) => update({ openedAt: e.target.value })}
                className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
              />
              <p className="text-xs text-ink-muted">
                {values.assetType === "CASH"
                  ? "余额的起算日。这天之後的流水才会计入。"
                  : "会用这个日期建立一笔投资记录。留空就用今天 —— 但历史持仓填对日期，收益率才算得准。"}
              </p>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">计价货币</span>
            <input
              required
              value={values.currency}
              onChange={(e) => update({ currency: e.target.value.toUpperCase() })}
              placeholder="MYR / USD"
              maxLength={3}
              className="rounded-md border border-line bg-surface px-3 py-2 text-ink uppercase outline-none focus:border-ink"
            />
          </label>

          {error && <div className="text-sm" style={{ color: "var(--critical)" }}>{error}</div>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-line px-4 py-2 text-sm text-ink-secondary transition-colors hover:text-ink"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
