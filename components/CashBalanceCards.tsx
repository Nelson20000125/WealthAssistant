"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CashPool } from "@/lib/cashBalance";
import { formatCurrency, formatMYR } from "@/lib/format";
import HoldingFormModal, { type HoldingFormValues } from "@/components/HoldingFormModal";

type Account = { id: string; name: string; type: string; institution: string; currency: string };

/** 现金池编辑表单的初值。余额本身是推导出来的，能改的只有期初那两个栏位 */
function toFormValues(p: CashPool): HoldingFormValues {
  return {
    id: p.id,
    accountId: p.accountId,
    assetType: "CASH",
    valuation: p.valuation,
    name: p.name,
    symbol: p.symbol ?? "",
    quantity: String(p.quantity),
    costBasis: String(p.costBasis),
    currency: p.currency,
    openingBalance: p.openingBalance != null ? String(p.openingBalance) : "",
    openingBalanceDate: p.openingBalanceDate
      ? new Date(p.openingBalanceDate).toISOString().slice(0, 10)
      : "",
    derivedBalance: p.isDerived ? p.balance : null,
  };
}

const EMPTY_CASH_FORM: HoldingFormValues = {
  accountId: "",
  assetType: "CASH",
  valuation: "DERIVED",
  name: "",
  symbol: "",
  quantity: "1",
  costBasis: "0",
  currency: "",
};

/**
 * 收支页顶部的现金余额。放在流水表单同一页，是因为这两件事是一体两面：
 * 记一笔收入下面的余额立刻跟着变，因果当场看得见。
 *
 * 余额只读 —— 它由流水推导而来（决策 2026-07-29），能改的只有期初。
 * 编辑入口在这里而不是持仓页：持仓页只管投资标的，现金归这一页。
 */
export default function CashBalanceCards({
  pools,
  accounts,
}: {
  pools: CashPool[];
  accounts: Account[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; values: HoldingFormValues } | null>(
    null
  );

  const totalMYR = pools.reduce((sum, p) => sum + (p.balanceMYR ?? 0), 0);
  const fxMissing = pools.filter((p) => p.balanceMYR === null).length;
  const noOpening = pools.filter((p) => !p.isDerived).length;

  const handleSaved = () => {
    setModal(null);
    router.refresh();
  };

  return (
    <div className="card animate-in p-6">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-ink">现金余额</div>
        <div className="text-lg font-medium font-mono tabular-nums text-ink">{formatMYR(totalMYR)}</div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-3">
        {pools.map((p) => (
          <div key={p.id} className="rounded-lg border border-line p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate text-sm font-medium text-ink">{p.name}</div>
              <div className="shrink-0 text-xs text-ink-muted">{p.currency}</div>
            </div>
            <div className="mt-1 truncate text-xs text-ink-muted">{p.accountName}</div>
            <div className="mt-3 text-lg font-medium font-mono tabular-nums text-ink">
              {formatCurrency(p.balance, p.currency)}
            </div>
            {p.currency !== "MYR" && (
              <div className="mt-0.5 text-xs text-ink-muted font-mono tabular-nums">
                {p.balanceMYR !== null ? `≈ ${formatMYR(p.balanceMYR)}` : "缺汇率，无法折算"}
              </div>
            )}
            {!p.isDerived && (
              <div className="mt-2 text-xs text-warning">
                未设期初余额，这个数字不会跟着流水变动
              </div>
            )}
            <button
              type="button"
              onClick={() => setModal({ mode: "edit", values: toFormValues(p) })}
              className="mt-3 text-xs text-ink-secondary hover:text-ink"
            >
              {p.isDerived ? "编辑期初" : "设定期初"}
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setModal({ mode: "create", values: EMPTY_CASH_FORM })}
          className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-muted hover:border-ink-muted hover:text-ink-secondary"
        >
          + 新增现金池
        </button>
      </div>

      {(fxMissing > 0 || noOpening > 0) && (
        <div className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
          {noOpening > 0 && (
            <div>
              有 {noOpening} 个现金池还没设期初余额 —— 补上期初与日期，余额才会由流水推导。
            </div>
          )}
          {fxMissing > 0 && <div>有 {fxMissing} 个现金池因缺汇率未计入上方合计。</div>}
        </div>
      )}

      {modal && (
        <HoldingFormModal
          mode={modal.mode}
          initial={modal.values}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
