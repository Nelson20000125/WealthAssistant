"use client";

import { useCountUp } from "@/hooks/useCountUp";
import { formatMYR } from "@/lib/format";

export type CountUpFormat = "myr" | "myr-compact" | "int";

// Server Component 不能把函式当 prop 传给 Client Component（不可序列化），
// 所以这里只收字符串标记，实际的格式化函式在 client 这边自己解析。
const FORMATTERS: Record<CountUpFormat, (n: number) => string> = {
  myr: (n) => formatMYR(n),
  "myr-compact": (n) => formatMYR(n, true),
  int: (n) => String(Math.round(n)),
};

export default function CountUpValue({
  value,
  format,
  durationMs,
  className,
}: {
  value: number;
  format: CountUpFormat;
  durationMs?: number;
  className?: string;
}) {
  const animated = useCountUp(value, durationMs);
  return <span className={className}>{FORMATTERS[format](animated)}</span>;
}
