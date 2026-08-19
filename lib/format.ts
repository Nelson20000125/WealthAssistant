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

// 涨跌幅：带正负号。「+2.2%」代表涨了。
export function formatPct(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);
}

// 持仓份额。券商的碎股成交会给出 1.78529826143312 这种数，直接渲染是 14 位小数，
// 而读者需要的精度远低于此。收敛到 6 位并去掉末尾的零（150 份就显示 150，不是 150.000000）。
export function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-MY", {
    maximumFractionDigits: 6,
  }).format(value);
}

// 占比：绝不带正号。跟 formatPct 分开是因为两者语义相反 ——
// 共用一个函数时，「现金占净资产 59.3%」会渲染成「+59.3%」，读起来像现金涨了 59.3%；
// 持仓卡片里「配置占比 +29.6%」跟它正下方的盈亏「+2.2%」格式一模一样，无法分辨。
// 负值仍保留负号（占比理论上不会是负的，真出现时不该被静默吃掉）。
export function formatShare(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "negative",
  }).format(value);
}
