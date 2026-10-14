/**
 * 验证用：实打 SEC EDGAR 与美国财政部，把两个来源的资料印出来。
 *   npx tsx scripts/fetch-fundamentals.ts AAPL NVDA
 *
 * 两个来源都免 API key。SEC 要求 User-Agent 带联络方式，建议先设：
 *   SEC_USER_AGENT="WealthAssistant your@email.com"
 *
 * 只读取外部资料并印出，不碰资料库。
 */
import {
  fetchCompanyConcept,
  fetchTickerMap,
  latestAnnual,
  parseAnnualFacts,
  tickerToCik,
} from "@/lib/marketData/providers/sec-edgar";
import { fetchAvgRates, latestRateFor, parseAvgRates } from "@/lib/marketData/providers/fed-treasury";

const TICKERS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["AAPL"];

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" }).format(n);
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;

async function main() {
  console.log("=== 美国公债平均利率（无风险利率基准）===");
  const rates = await fetchAvgRates(12);
  const asOf = parseAvgRates(rates)[0]?.date ?? "?";
  console.log(`资料日期 ${asOf}`);
  for (const desc of ["Treasury Bills", "Treasury Notes", "Treasury Bonds"]) {
    const r = latestRateFor(rates, desc);
    console.log(`  ${desc.padEnd(16)} ${r ? pct(r.rate) : "查无"}`);
  }

  console.log("\n=== 个股基本面（SEC EDGAR / us-gaap:NetIncomeLoss）===");
  const tickerMap = await fetchTickerMap();
  console.log(`ticker 对照表载入 ${tickerMap.size} 笔\n`);

  for (const ticker of TICKERS) {
    const cik = tickerToCik(tickerMap, ticker);
    if (!cik) {
      // ETF 不申报 10-K，这里查不到是正常的
      console.log(`${ticker}：EDGAR 查无此 ticker（ETF 与非申报实体不会有）`);
      continue;
    }

    const concept = await fetchCompanyConcept(cik, "NetIncomeLoss");
    const facts = parseAnnualFacts(concept);
    const latest = latestAnnual(concept);

    console.log(`${ticker}（CIK ${cik}）${concept.entityName}`);
    console.log(`  原始资料点 ${concept.units.USD?.length ?? 0} 笔 → 去重后年报 ${facts.length} 笔`);
    if (latest) {
      console.log(
        `  最近财年 ${latest.periodStart}~${latest.periodEnd}：${usd(latest.value)}` +
          `（${latest.form}，申报于 ${latest.filed}）`,
      );
    }
    for (const f of facts.slice(-3)) {
      console.log(`    ${f.periodEnd}  ${usd(f.value).padStart(9)}`);
    }
    console.log();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
