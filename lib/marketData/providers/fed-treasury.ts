// 美国财政部 fiscaldata，不需要 API key、不需要特殊 header。
// 用途是拿无风险利率当组合报酬的对照基准。
const TREASURY_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

export interface AvgRateRow {
  record_date: string;
  security_type_desc: string;
  security_desc: string;
  avg_interest_rate_amt: string;
}

export interface AvgRatePayload {
  data: AvgRateRow[];
}

export interface TreasuryRate {
  date: string;
  securityType: string;
  securityDesc: string;
  /** 小数表示（0.03758 = 3.758%），与专案 formatPct 的输入一致 */
  rate: number;
}

/**
 * fiscaldata 的每个栏位都是字串，数字栏位也是（"avg_interest_rate_amt": "3.758"）。
 * 不转型直接运算会变成字串串接。
 *
 * 另外原始值 3.758 的语义是百分比，而专案里 formatPct 吃的是小数，
 * 原样传下去会显示成 "+375.8%"。在来源这层就除以 100，下游语义才一致。
 */
export function parseAvgRates(payload: AvgRatePayload): TreasuryRate[] {
  return payload.data
    .map((row) => ({
      date: row.record_date,
      securityType: row.security_type_desc,
      securityDesc: row.security_desc,
      rate: Number(row.avg_interest_rate_amt) / 100,
    }))
    .filter((r) => Number.isFinite(r.rate));
}

/** 指定券别（如 "Treasury Bills"）最新一期的平均利率，查无则回 null。 */
export function latestRateFor(payload: AvgRatePayload, securityDesc: string): TreasuryRate | null {
  const matched = parseAvgRates(payload)
    .filter((r) => r.securityDesc === securityDesc)
    .sort((a, b) => b.date.localeCompare(a.date));

  return matched[0] ?? null;
}

/** 抓最近 limit 笔平均利率，预设按记录日期由新到旧。 */
export async function fetchAvgRates(limit = 20): Promise<AvgRatePayload> {
  const url =
    `${TREASURY_BASE}/v2/accounting/od/avg_interest_rates` +
    `?sort=-record_date&page%5Bsize%5D=${limit}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Fed Treasury 请求失败（${res.status}）`);
  }

  return res.json();
}
