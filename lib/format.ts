// compact 数字用自己手写的逻辑，不用 Intl 的 notation:"compact"——
// Node（server）和浏览器（client hydration）内建的 ICU 版本对 compact 数字的四舍五入/去尾零
// 行为不一致（比如 14025.95 一个给 "RM 14.0K" 一个给 "RM 14K"），会触发 hydration mismatch。
// 纯数学换算 + toFixed 在任何 JS 引擎里输出都完全一致。
function formatCompactMYR(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");

  if (abs >= 1_000_000) return `${sign}RM${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}RM${trim(abs / 1_000)}K`;
  return `${sign}RM${Math.round(abs)}`;
}

export function formatMYR(value: number, compact = false) {
  if (compact) return formatCompactMYR(value);
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 2,
  }).format(value);
}

// 任意币种。投资表现按原生货币显示（决策 2026-07-29：汇率变动不算报酬），
// 所以需要一个不假设 MYR 的格式化函数。compact 分支刻意不做——
// 原生金额要看得清小数，而且 formatCompactMYR 的 "RM" 是写死的。
export function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPct(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);
}
