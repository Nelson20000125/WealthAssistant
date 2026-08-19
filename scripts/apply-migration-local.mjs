/**
 * 把 prisma/migrations 底下的 migration.sql 套用到本地 dev.db。
 *
 * 为什么需要这支脚本：这台机器的 Prisma CLI 只印完 header 就静默退出（exit 0，
 * 不做事也不报错），`prisma migrate dev` / `migrate status` / 甚至 `--version`
 * 都一样。在 CLI 修好之前，本地 migration 只能绕过它直接执行 SQL。
 * （`_prisma_migrations` 里 20260805 那两笔的 finished_at 是手写格式，
 *   显示这问题之前就撞过一次。）
 *
 * 刻意写成 .mjs 用 node 直接跑，不走 tsx —— tsx 要经 npx，而 npx 在这台机器上
 * 同样不可靠（CLAUDE.md 有记：npm 是 npm.ps1，某些调用方式会静默失败）。
 *
 * 用法（在专案根目录）：
 *   node scripts/apply-migration-local.mjs --dry-run    只列出会做什么
 *   node scripts/apply-migration-local.mjs --all        套用全部未套用的
 *   node scripts/apply-migration-local.mjs 20260806000000_add_valuation_and_holding_price
 *
 * 安全：
 * - 目标写死本地 file: URL，非 file: 一律拒绝，避免误打 Turso 或正式站。
 *   远端一律走 scripts/turso-apply-migration.ts。
 * - 已套用与否读 Prisma 官方的 `_prisma_migrations`，不自建追踪表。用自建表的话
 *   它初始是空的，会把「全部历史 migration 都没套用」当真 —— 而其中
 *   bookkeeping_v1 / user_multitenancy 含 DROP TABLE，重放会清掉真实资料。
 */
import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const TRACKING_TABLE = "_prisma_migrations";
const DB_URL = "file:./dev.db";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all");
  const only = args.find((a) => !a.startsWith("--"));

  if (!all && !only && !dryRun) {
    console.error("要指定 --all、一个 migration 资料夹名称，或 --dry-run");
    process.exit(1);
  }
  if (!DB_URL.startsWith("file:")) {
    throw new Error(`只允许本地 file: 目标，拿到的是 ${DB_URL}`);
  }

  const client = createClient({ url: DB_URL });
  console.log(`目标：${DB_URL}\n`);

  // 追踪表必须已存在。不存在代表这个 DB 不是 Prisma Migrate 管理的，
  // 贸然执行等于对来历不明的资料库跑 DDL，直接停。
  const hasTable = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='${TRACKING_TABLE}'`
  );
  if (hasTable.rows.length === 0) {
    throw new Error(
      `找不到 ${TRACKING_TABLE}，这个 DB 不像是 Prisma Migrate 管理的，拒绝执行`
    );
  }

  const applied = new Set(
    (
      await client.execute(
        `SELECT migration_name FROM ${TRACKING_TABLE} WHERE finished_at IS NOT NULL`
      )
    ).rows.map((r) => String(r.migration_name))
  );

  const candidates = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .filter((name) => (only ? name === only : true));

  if (only && candidates.length === 0) {
    throw new Error(`找不到 migration 资料夹：${only}`);
  }

  let done = 0;
  for (const name of candidates) {
    if (applied.has(name)) {
      console.log(`  跳过 ${name}（已套用）`);
      continue;
    }
    const sqlPath = path.join(MIGRATIONS_DIR, name, "migration.sql");
    if (!fs.existsSync(sqlPath)) {
      console.log(`  跳过 ${name}（没有 migration.sql）`);
      continue;
    }

    const sql = fs.readFileSync(sqlPath, "utf8");
    const stmts = splitStatements(sql);

    if (dryRun) {
      console.log(`  [dry-run] 会套用 ${name}（${stmts.length} 条语句）：`);
      for (const s of stmts) console.log(`      ${s.split("\n")[0].slice(0, 90)}`);
      continue;
    }

    console.log(`  套用 ${name}（${stmts.length} 条语句）...`);
    // 同 turso 版：用 migrate() 而不是 executeMultiple()，它内建外键延迟，
    // 适合 schema 变更（Prisma 的 RedefineTables 会搬表）。
    await client.migrate(stmts);

    const now = new Date().toISOString();
    await client.execute({
      sql: `INSERT INTO ${TRACKING_TABLE}
              (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), sha256(sql), name, now, now, 1],
    });
    done++;
  }

  console.log(dryRun ? "\ndry-run 结束（什么都没改）" : `\n完成，套用了 ${done} 个 migration`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** Prisma 的 migration checksum：migration.sql 内容的 sha256 hex。 */
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

/** 把 migration.sql 拆成单条语句：去 BOM、去注解、跳过 PRAGMA。 */
function splitStatements(sql) {
  const clean = sql.replace(/^﻿/, "");
  const out = [];
  let buf = "";
  let inStr = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "'") {
      if (inStr && clean[i + 1] === "'") {
        buf += "''";
        i++;
        continue;
      }
      inStr = !inStr;
    }
    if (ch === ";" && !inStr) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);

  return out
    .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/^PRAGMA\s/i.test(s));
}
