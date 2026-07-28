import { formatMYR, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ValueKind = "currency" | "currency-compact" | "percent";

/**
 * 统一的金额/百分比渲染组件（对标 Ghostfolio 的 gf-value）：
 * - tabular-nums 等宽数字，列表/表格里不跳动
 * - colorizeSign：正绿负红零中性，取代散落各处的三元 style
 * - masked：隐私模式打码（Phase 4 会接全局开关，组件先支持）
 * - value 为 null 时渲染占位符（如没有成本价算不出盈亏）
 *
 * Server/Client 组件都能用（无 hooks）。
 */
export default function Value({
  value,
  kind = "currency",
  colorizeSign = false,
  masked = false,
  className,
}: {
  value: number | null;
  kind?: ValueKind;
  colorizeSign?: boolean;
  masked?: boolean;
  className?: string;
}) {
  const colorClass =
    !colorizeSign || value === null
      ? value === null
        ? "text-ink-muted"
        : undefined
      : value > 0
        ? "text-good"
        : value < 0
          ? "text-critical"
          : "text-ink-secondary";

  let text: string;
  if (value === null) {
    text = "—";
  } else if (masked) {
    text = "••••••";
  } else if (kind === "percent") {
    text = formatPct(value);
  } else {
    text = formatMYR(value, kind === "currency-compact");
  }

  return <span className={cn("tabular-nums", colorClass, className)}>{text}</span>;
}
