/**
 * 把旧式现金持仓（余额直接存在 costBasis）迁移到流水推导模式。
 *
 * 背景：决策 2026-07-29 起现金余额一律由流水推导，但迁移前建立的持仓没有
 * openingBalance / openingBalanceDate，余额还躺在 costBasis 里。要删掉
 * costBasis 栏位，得先让这些持仓真的能靠推导算出正确余额。
 *
 * 算法（精确复刻 lib/cashBalance.ts 的推导，反推期初值）：
 *   余额 = openingBalance + Σ(期初日之後的流水)
 *   => openingBalance = 现在的余额 - Σ(期初日之後的流水)
 * 期初日取「最早一笔相关流水的前一天」，让所有历史流水都参与推导。
 *
 * 这个反推一定会让推导结果等于现在的余额 —— 所以它验证不了「流水是否完整」。
 * 真正要看的是算出来的 openingBalance 合不合理：负数、或大到不像话，
 * 都代表流水有缺漏或有重复，那种情况要人工查，不能硬写。
 *
 * 用法：node scripts/migrate-cash-to-derived.mjs [--dry-run]
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const DB_URL = "file:./dev.db";
const OUT = path.join(process.cwd(), ".claude", "cash-migration.md");
const dryRun = process.argv.includes("--dry-run");

const client = createClient({ url: DB_URL });

const cash = await client.execute(`
  SELECT h.id, h.name, h.currency, h.quantity, h.costBasis,
         h.openingBalance, h.openingBalanceDate, a.name AS accountName, a.userId
  FROM Holding h JOIN Account a ON a.id = h.accountId
  WHERE h.assetType = 'CASH' AND (h.openingBalance IS NULL OR h.openingBalanceDate IS NULL)
  ORDER BY a.name, h.name
`);

if (cash.rows.length === 0) {
  console.log("没有需要迁移的现金持仓（都已是推导模式）。");
  client.close();
  process.exit(0);
}

const plans = [];
for (const h of cash.rows) {
  // 旧式现金：余额 = quantity × costBasis（quantity 恒为 1，但照公式算不假设）
  const currentBalance = Number(h.quantity) * Number(h.costBasis);

  const txs = await client.execute({
    sql: `SELECT date, amount, type, cashHoldingId, counterCashHoldingId, counterAmount
          FROM "Transaction"
          WHERE cashHoldingId = ? OR counterCashHoldingId = ?
          ORDER BY date ASC`,
    args: [h.id, h.id],
  });

  let delta = 0;
  for (const t of txs.rows) {
    if (String(t.cashHoldingId) === String(h.id)) {
      delta += String(t.type) === "INCOME" ? Number(t.amount) : -Number(t.amount);
    }
    if (String(t.counterCashHoldingId) === String(h.id)) {
      delta += t.counterAmount != null ? Number(t.counterAmount) : Number(t.amount);
    }
  }

  // 期初日：最早一笔流水的前一天（UTC 零点）。没有流水就用今天，
  // 那种情况期初余额直接等于现在的余额，推导後也不会变。
  let openingDate;
  if (txs.rows.length > 0) {
    const earliest = new Date(String(txs.rows[0].date));
    earliest.setUTCDate(earliest.getUTCDate() - 1);
    openingDate = new Date(
      Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), earliest.getUTCDate())
    );
  } else {
    const now = new Date();
    openingDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  const openingBalance = currentBalance - delta;

  plans.push({
    id: String(h.id),
    name: String(h.name),
    accountName: String(h.accountName),
    currency: String(h.currency),
    currentBalance,
    txCount: txs.rows.length,
    delta,
    openingBalance,
    openingDate,
    suspicious: openingBalance < 0,
  });
}

const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const suspicious = plans.filter((p) => p.suspicious);

const lines = [
  "# 现金持仓迁移到推导模式",
  "",
  "> 本档含真实财务数字，`.claude/` 已 gitignore。",
  "> 由 `node scripts/migrate-cash-to-derived.mjs` 产生。",
  "",
  `共 ${plans.length} 笔待迁移，其中 **${suspicious.length}** 笔期初余额算出来是负数（可疑）。`,
  "",
  "`期初余额 = 现在的余额 − 期初日之後的流水净额`",
  "",
  "| 现金池 | 户口 | 币种 | 现在的余额 | 流水笔数 | 流水净额 | 推算期初余额 | 期初日 | 状态 |",
  "|---|---|---|---:|---:|---:|---:|---|---|",
];
for (const p of plans) {
  lines.push(
    `| ${p.name} | ${p.accountName} | ${p.currency} | ${fmt(p.currentBalance)} | ${p.txCount} | ` +
      `${fmt(p.delta)} | ${fmt(p.openingBalance)} | ${p.openingDate.toISOString().slice(0, 10)} | ` +
      `${p.suspicious ? "**负数，要查**" : "正常"} |`
  );
}
lines.push(
  "",
  "## 怎么判读",
  "",
  "- 迁移後推导出来的余额**一定**等于「现在的余额」——反推就是这么来的，所以余额不变不代表流水是对的。",
  "- 真正要看的是**推算期初余额**这一栏合不合理：",
  "  - 负数 → 流水记多了（重复记帐），或期初日之前还有没记到的入帐",
  "  - 大得不像话 → 流水漏记了（有支出没记，余额被撑高）",
  "  - 接近你当初开户/开始记帐时的余额 → 正常",
  ""
);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join("\n"), "utf8");

console.log(`清单已写入 ${OUT}`);
console.log(`  ${plans.length} 笔待迁移，可疑（期初为负）${suspicious.length} 笔`);

if (dryRun) {
  console.log("\n[dry-run] 未写入资料库。");
  client.close();
  process.exit(0);
}

if (suspicious.length > 0) {
  console.error("\n有期初余额为负的项目，拒绝自动写入。请先人工核对清单。");
  client.close();
  process.exit(1);
}

for (const p of plans) {
  await client.execute({
    sql: `UPDATE Holding SET openingBalance = ?, openingBalanceDate = ? WHERE id = ?`,
    args: [p.openingBalance, p.openingDate.toISOString(), p.id],
  });
  console.log(`  已迁移 ${p.name}`);
}
console.log(`\n完成，迁移 ${plans.length} 笔现金持仓。`);
client.close();
