"use client";

import { useState } from "react";
import HoldingsTable from "@/components/HoldingsTable";
import HoldingsTreemap from "@/components/HoldingsTreemap";

// 跟 HoldingsTable 的 props 形状保持一致（那边是模块内私有类型，不能直接 import）
type Account = { id: string; name: string; type: string; institution: string; currency: string };
type Holding = {
  id: string;
  accountId: string;
  accountName: string;
  assetType: string;
  valuation: string;
  symbol: string | null;
  name: string;
  quantity: number;
  costBasis: number;
  currency: string;
  unitPrice: number;
  valueMYR: number | null;
  costValueMYR: number | null;
  derivedBalance?: number;
  isDerivedCash?: boolean;
  openingBalance?: number | null;
  openingBalanceDate?: Date | string | null;
};

const VIEWS = [
  { key: "TABLE", label: "表格" },
  { key: "TREEMAP", label: "热力图" },
] as const;

type ViewMode = (typeof VIEWS)[number]["key"];

/**
 * 持仓页 Table ↔ Treemap 切换（Ghostfolio 的 Holdings 视图同款交互）。
 * 表格视图保留原有的新增/编辑/删除功能；热力图是只读概览。
 */
export default function HoldingsView({
  holdings,
  totalMYR,
  accounts,
}: {
  holdings: Holding[];
  /** 占比的分母：投资总额（不含现金）。现金归收支页管 */
  totalMYR: number;
  accounts: Account[];
}) {
  const [view, setView] = useState<ViewMode>("TABLE");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <div className="flex rounded-full border border-line p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                view === v.key
                  ? "bg-portfolio-accent text-primary-foreground"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "TREEMAP" ? (
        <HoldingsTreemap holdings={holdings} />
      ) : (
        <HoldingsTable holdings={holdings} totalMYR={totalMYR} accounts={accounts} />
      )}
    </div>
  );
}
