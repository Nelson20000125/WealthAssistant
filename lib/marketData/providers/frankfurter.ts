// Frankfurter 走 ECB 央行汇率，不需要 API key。
// .app 旧网域会 301 转址，改用官方现行的 .dev 网域。
const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";

export async function fxRate(base: string, quote: string) {
  const url = `${FRANKFURTER_BASE}/latest?base=${base}&symbols=${quote}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Frankfurter 请求失败（${res.status}）：${base}/${quote}`);
  }

  const data = await res.json();
  const rate = data.rates?.[quote];

  if (typeof rate !== "number") {
    throw new Error(`Frankfurter 没有回传 ${base}/${quote} 汇率：${JSON.stringify(data)}`);
  }

  return { rate };
}
