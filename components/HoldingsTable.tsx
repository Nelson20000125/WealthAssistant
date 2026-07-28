"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMYR, formatPct } from "@/lib/format";
import { AssetIcon } from "@/components/icons";
import HoldingFormModal, { type HoldingFormValues } from "@/components/HoldingFormModal";
import { Button } from "@/components/ui/button";
import Value from "@/components/Value";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ETF: "股票/ETF",
  STOCK: "股票/ETF",
  FUND: "基金",
  CASH: "现金",
  CRYPTO: "加密货币",
};

const ASSET_TYPE_COLOR: Record<string, string> = {
  ETF: "var(--series-1)",
  STOCK: "var(--series-1)",
  FUND: "var(--series-2)",
  CASH: "var(--series-3)",
  CRYPTO: "var(--series-4)",
};

type Account = { id: string; name: string; type: string; institution: string; currency: string };

type Holding = {
  id: string;
  accountId: string;
  accountName: string;
  assetType: string;
  symbol: string | null;
  name: string;
  quantity: number;
  costBasis: number;
  currency: string;
  unitPrice: number;
  valueMYR: number | null;
  costValueMYR: number | null;
};

const EMPTY_FORM: HoldingFormValues = {
  accountId: "",
  assetType: "STOCK",
  name: "",
  symbol: "",
  quantity: "",
  costBasis: "",
  currency: "",
};

function toFormValues(h: Holding): HoldingFormValues {
  return {
    id: h.id,
    accountId: h.accountId,
    assetType: h.assetType,
    name: h.name,
    symbol: h.symbol ?? "",
    quantity: String(h.quantity),
    costBasis: String(h.costBasis),
    currency: h.currency,
  };
}

export default function HoldingsTable({
  holdings,
  netWorthMYR,
  accounts,
}: {
  holdings: Holding[];
  netWorthMYR: number;
  accounts: Account[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; values: HoldingFormValues } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);

  const handleSaved = () => {
    setModal(null);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setBusyDeleteId(id);
    await fetch(`/api/holdings/${id}`, { method: "DELETE" });
    setBusyDeleteId(null);
    setDeletingId(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => setModal({ mode: "create", values: EMPTY_FORM })}>
          + 新增持仓
        </Button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="px-4 py-3 font-normal">资产</th>
              <th className="px-4 py-3 font-normal">户口</th>
              <th className="px-4 py-3 font-normal text-right">数量</th>
              <th className="px-4 py-3 font-normal text-right">单价</th>
              <th className="px-4 py-3 font-normal text-right">占比</th>
              <th className="px-4 py-3 font-normal text-right">现值 (MYR)</th>
              <th className="px-4 py-3 font-normal text-right">损益 (MYR)</th>
              <th className="px-4 py-3 font-normal text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const pl = h.valueMYR !== null && h.costValueMYR !== null ? h.valueMYR - h.costValueMYR : null;
              const color = ASSET_TYPE_COLOR[h.assetType] ?? "var(--ink-muted)";
              const pct = h.valueMYR !== null && netWorthMYR > 0 ? h.valueMYR / netWorthMYR : 0;
              return (
                <tr key={h.id} className="border-b border-line last:border-0 hover:bg-page/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                      >
                        <AssetIcon assetType={h.assetType} className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-ink">{h.name}</div>
                        <div className="text-xs text-ink-muted">
                          {ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}
                          {h.symbol ? ` · ${h.symbol}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{h.accountName}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">{h.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                    {h.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })} {h.currency}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-page">
                        <span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
                      </span>
                      <span className="w-10 tabular-nums text-ink-secondary">{formatPct(pct)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {h.valueMYR !== null ? formatMYR(h.valueMYR) : "汇率缺失"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    <Value value={pl} colorizeSign />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deletingId === h.id ? (
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <span className="text-ink-muted">确定删除？</span>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="text-ink-secondary hover:text-ink"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={busyDeleteId === h.id}
                          onClick={() => handleDelete(h.id)}
                          style={{ color: "var(--critical)" }}
                          className="font-medium disabled:opacity-50"
                        >
                          {busyDeleteId === h.id ? "删除中…" : "确定"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => setModal({ mode: "edit", values: toFormValues(h) })}
                          className="text-ink-secondary hover:text-ink"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(h.id)}
                          className="text-ink-secondary hover:text-ink"
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <HoldingFormModal
          mode={modal.mode}
          initial={modal.values}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
