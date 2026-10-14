// SEC EDGAR 的 XBRL 接口，不需要 API key，但**强制**要求 User-Agent 带联络方式，
// 否则回 403。反直觉的是带浏览器 UA 反而会被挡，格式必须像「组织名 email」。
//
// 只涵盖个股：ETF（VOO 等）不申报 10-K，在 EDGAR 查不到基本面。
const SEC_DATA_BASE = "https://data.sec.gov";
const SEC_FILES_BASE = "https://www.sec.gov/files";

// 留白 email 也能跑，但 SEC 明文要求申报联络方式，不给比较容易被限流。
// 设 SEC_USER_AGENT="WealthAssistant your@email.com" 即可。
const USER_AGENT = process.env.SEC_USER_AGENT ?? "WealthAssistant (no contact configured)";

export interface XbrlPoint {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyConcept {
  cik: number;
  taxonomy: string;
  tag: string;
  label: string;
  entityName: string;
  units: Record<string, XbrlPoint[]>;
}

export interface AnnualFact {
  periodStart: string;
  periodEnd: string;
  value: number;
  unit: string;
  form: string;
  filed: string;
  accession: string;
}

/**
 * 把 companyconcept 回应整理成一年一笔的序列。
 *
 * EDGAR 的原始 units 阵列不能直接用，有两个陷阱：
 *
 * 1. fy / fp 描述的是「这笔数字出现在哪份申报里」，不是数字本身的年度。
 *    2024 财年的净利会因为被写进 FY2025 的 10-K 当比较期而多出一笔 fy=2025。
 *    所以年度一律以 start/end 判定。
 * 2. 同一期间会被多份申报重复上报（AAPL 净利 139 笔只对应 67 个期间）。
 *    去重时留 filed 最新的那笔 —— 遇到 10-K/A 财报重编才不会显示已被更正的旧值。
 */
export function parseAnnualFacts(concept: CompanyConcept): AnnualFact[] {
  const byPeriod = new Map<string, AnnualFact>();

  for (const [unit, points] of Object.entries(concept.units)) {
    for (const p of points) {
      // 10-K/A（重编）也要收，季报与其他表格排除
      if (!p.form.startsWith("10-K")) continue;
      // 年度数字必有起讫日；资产负债表类的时点数只有 end，不属于这里的范围
      if (!p.start) continue;

      const key = `${p.start}~${p.end}`;
      const existing = byPeriod.get(key);
      if (existing && existing.filed >= p.filed) continue;

      byPeriod.set(key, {
        periodStart: p.start,
        periodEnd: p.end,
        value: p.val,
        unit,
        form: p.form,
        filed: p.filed,
        accession: p.accn,
      });
    }
  }

  return [...byPeriod.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

/** 最近一个已申报完成的财年，没有资料时回 null。 */
export function latestAnnual(concept: CompanyConcept): AnnualFact | null {
  const facts = parseAnnualFacts(concept);
  return facts.length > 0 ? facts[facts.length - 1] : null;
}

export interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * company_tickers.json 的形状是 { "0": { cik_str, ticker, title }, ... }。
 * cik_str 是数字，但 data.sec.gov 的路径要补零到 10 位字串，直接塞数字会 404。
 */
export function parseTickerMap(raw: Record<string, TickerRow>): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of Object.values(raw)) {
    map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  return map;
}

export function tickerToCik(map: Map<string, string>, ticker: string): string | undefined {
  return map.get(ticker.trim().toUpperCase());
}

async function secFetch(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    throw new Error(
      `SEC EDGAR 请求失败（${res.status}）：${url}` +
        (res.status === 403 ? "。403 多半是 User-Agent 没带联络方式，设 SEC_USER_AGENT" : ""),
    );
  }

  return res.json();
}

/** 抓单一财务指标的完整历史，tag 例如 NetIncomeLoss、Revenues、Assets。 */
export async function fetchCompanyConcept(
  cik: string,
  tag: string,
  taxonomy = "us-gaap",
): Promise<CompanyConcept> {
  return secFetch(`${SEC_DATA_BASE}/api/xbrl/companyconcept/CIK${cik}/${taxonomy}/${tag}.json`);
}

/** 全市场 ticker → CIK 对照表，约 1MB、上万笔，呼叫端自己快取。 */
export async function fetchTickerMap(): Promise<Map<string, string>> {
  return parseTickerMap(await secFetch(`${SEC_FILES_BASE}/company_tickers.json`));
}
