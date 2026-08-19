/**
 * 阶段 2 的对比清单：把「存在 Holding.costBasis 的成本」和「从 INVEST 交易累加
 * 出来的成本」并排列出来，不一致的标出来给人工核对。
 *
 * 为什么要人工核对而不是自动修：不一致有两种可能，只有人能分辨 ——
 *   a) 手动建仓时直接填了 costBasis，从来没有对应的 INVEST 交易（预期内，要补期初交易）
 *   b) applyInvest / reverseInvest 的加权平均在某笔交易上算漂了（真 bug，要查）
 * 自动以任一边为准都会把另一种情况的错误固化下来。
 *
 * 输出写到 .claude/cost-comparison.md（该目录已 gitignore），不印到终端 ——
 * 内容含真实财务数字。
 *
 * 用法：node scripts/cost-comparison.mjs
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const DB_URL = "file:./dev.db";
const OUT = path.join(process.cwd(), ".claude", "cost-comparison.md");
// 浮点误差容忍。applyInvest 的加权平均会累积误差，差个几分钱不算不一致。
const EPSILON = 0.01;

const client = createClient({ url: DB_URL });

// CASH / DERIVED 不比：现金成本恒等于余额，且余额本来就由流水推导，没有「投入成本」概念。
const holdings = await client.execute(`
  SELECT h.id, h.name, h.assetType, h.valuation, h.currency, h.quantity, h.costBasis,
         a.name AS accountName
  FROM Holding h JOIN Account a ON a.id = h.accountId
  WHERE h.assetType <> 'CASH'
  ORDER BY a.name, h.name
`);

const invests = await client.execute(`
  SELECT holdingId,
         SUM(amount) AS investedAmount,
         SUM(COALESCE(units, 0)) AS investedUnits,
         COUNT(*) AS n
  FROM "Transaction"
  WHERE type = 'INVEST' AND holdingId IS NOT NULL
  GROUP BY holdingId
`);
const investBy = new Map(invests.rows.map((r) => [String(r.holdingId), r]));

const rows = [];
for (const h of holdings.rows) {
  const inv = investBy.get(String(h.id));
  const stored = Number(h.quantity) * Number(h.costBasis);
  const derived = inv ? Number(inv.investedAmount) : 0;
  const txCount = inv ? Number(inv.n) : 0;
  const diff = stored - derived;
  const match = Math.abs(diff) < EPSILON;

  let verdict;
  if (match) verdict = "一致";
  else if (txCount === 0) verdict = "**无 INVEST 交易** — 手动建仓，改推导後成本会变 0，需补期初交易";
  else verdict = "**不一致** — 有交易但对不上，要查";

  rows.push({
    name: String(h.name),
    accountName: String(h.accountName),
    assetType: String(h.assetType),
    valuation: String(h.valuation),
    currency: String(h.currency),
    quantity: Number(h.quantity),
    unitCost: Number(h.costBasis),
    stored,
    derived,
    txCount,
    diff,
    match,
  });
}

const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ok = rows.filter((r) => r.match).length;
const noTx = rows.filter((r) => !r.match && r.txCount === 0).length;
const bad = rows.filter((r) => !r.match && r.txCount > 0).length;

const lines = [
  "# 成本对比清单（阶段 2）",
  "",
  "> 本档含真实财务数字，`.claude/` 已 gitignore，不要外流。",
  "> 由 `node scripts/cost-comparison.mjs` 产生，可重复执行覆盖。",
  "",
  `- 一致：**${ok}** 笔`,
  `- 无 INVEST 交易（手动建仓，预期内）：**${noTx}** 笔`,
  `- 有交易但对不上（要查）：**${bad}** 笔`,
  "",
  "「存的成本」= `quantity × costBasis`；「推导成本」= 该持仓所有 INVEST 交易的 `amount` 加总。",
  "",
  "| 持仓 | 户口 | 类型 | 估值方式 | 币种 | 份额 | 单位成本 | 存的成本 | 推导成本 | 差异 | 交易数 | 判定 |",
  "|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---|",
];

for (const r of rows) {
  lines.push(
    `| ${r.name} | ${r.accountName} | ${r.assetType} | ${r.valuation} | ${r.currency} | ` +
      `${fmt(r.quantity)} | ${fmt(r.unitCost)} | ${fmt(r.stored)} | ${fmt(r.derived)} | ` +
      `${fmt(r.diff)} | ${r.txCount} | ${r.match ? "一致" : r.txCount === 0 ? "无 INVEST 交易" : "**不一致**"} |`
  );
}

lines.push("", "## 逐笔说明", "");
for (const r of rows.filter((x) => !x.match)) {
  lines.push(
    `### ${r.name}（${r.accountName}）`,
    "",
    `- 存的成本 ${fmt(r.stored)} ${r.currency}，推导成本 ${fmt(r.derived)} ${r.currency}，差 ${fmt(r.diff)}`,
    `- INVEST 交易数：${r.txCount}`,
    r.txCount === 0
      ? "- 判定：手动建仓、从未记过 INVEST。阶段 3 改成纯推导後成本会归 0，" +
        "迁移时要补一笔期初持仓交易（金额＝存的成本，日期＝建仓日）。"
      : "- 判定：**有交易却对不上**，可能是加权平均算漂或有交易被改过。要逐笔查这个持仓的 INVEST 纪录。",
    ""
  );
}
if (rows.every((r) => r.match)) lines.push("（全部一致，没有需要人工核对的项目。）", "");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n"), "utf8");

// 终端只印统计，不印金额
console.log(`已写入 ${OUT}`);
console.log(`  比对 ${rows.length} 笔非现金持仓：一致 ${ok}、无 INVEST 交易 ${noTx}、不一致 ${bad}`);

client.close();
