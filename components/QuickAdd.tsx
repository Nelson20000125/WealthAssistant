"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import TransactionSheet from "@/components/TransactionSheet";
import type { CategoryOption, HoldingOption, OutstandingOption } from "@/components/cashflowTypes";

/**
 * 全域「记一笔」（P1-02）。挂在 layout，任何页面按 ⊕ 都能就地拉起表单，
 * 不再先跳去 /cashflow —— 为了记一笔要换页，是这个 App 最该消灭的摩擦。
 *
 * 开关状态放在 URL 的 ?add=1 而不是 context：⊕ 本来就是个 <Link>，
 * 不必为了传一个布林值架一层 provider，返回键也顺便能关掉面板。
 */
export default function QuickAdd(props: {
  categories: CategoryOption[];
  holdings: HoldingOption[];
  accounts: { id: string; name: string; currency: string }[];
  outstanding: OutstandingOption[];
  defaultCashHoldingId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (params.get("add") !== "1") return null;

  return (
    <TransactionSheet
      {...props}
      onClose={() => {
        // 保留其余 query（收支页的 ?m=2026-09 之类），只摘掉 add
        const rest = new URLSearchParams(params);
        rest.delete("add");
        const qs = rest.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }}
    />
  );
}
