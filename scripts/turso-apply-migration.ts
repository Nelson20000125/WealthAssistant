/**
 * 把 prisma/migrations 底下的 migration.sql 套用到 Turso。
 *
 * 为什么需要这支脚本：Prisma Migrate 不能对 Turso 跑（libSQL 走 HTTP），
 * 官方建议用 Turso CLI 套用，但 CLI 在 Windows 上不好装，所以直接用 @libsql/client。
 *
 * 用法：
 *   npx tsx scripts/turso-apply-migration.ts --all          套用全部未套用的
 *   npx tsx scripts/turso-apply-migration.ts 20260716074444_init   只套用指定那一个
 *   npx tsx scripts/turso-apply-migration.ts --all --dry-run       只列出要做什么
 *
 * 目标由 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 决定，刻意不用 DATABASE_URL，
 * 避免不小心对本地 dev.db 或正式站执行。
 */
import dotenv from "dotenv";
// 先读 .env.local（密钥放这），再读 .env。dotenv 预设不覆盖已存在的值，
// 所以 .env.local 优先。注意：单纯 `import "dotenv/config"` 只会读 .env。
dotenv.config({ path: ".env.local" });
dotenv.config();
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const TRACKING_TABLE = "_turso_applied_migrations";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all");
  const only = args.find((a) => !a.startsWith("--"));

  if (!all && !only) {
    console.error("要指定 --all 或一个 migration 资料夹名称");
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("缺少 TURSO_DATABASE_URL");
  if (!url.startsWith("libsql://") && !url.startsWith("https://")) {
    throw new Error(`TURSO_DATABASE_URL 看起来不是远端位址：${url}`);
  }

  const client = createClient({ url, authToken });
  console.log(`目标：${url}`);

  await client.execute(
    `CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  );

  const applied = new Set(
    (await client.execute(`SELECT name FROM ${TRACKING_TABLE}`)).rows.map(
      (r) => String(r.name)
    )
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
    if (dryRun) {
      console.log(`  [dry-run] 会套用 ${name}（${sql.length} 字元）`);
      continue;
    }

    const stmts = splitStatements(sql);
    console.log(`  套用 ${name}（${stmts.length} 条语句）...`);
    // 用 migrate() 而不是 executeMultiple()：Prisma 的 RedefineTables 会用
    // PRAGMA foreign_keys=OFF 来搬表，但 Turso 走 HTTP 不吃那个 PRAGMA。
    // migrate() 是 libSQL 专为 schema 迁移设计的模式，内建外键延迟。
    await client.migrate(stmts);
    await client.execute({
      sql: `INSERT INTO ${TRACKING_TABLE} (name) VALUES (?)`,
      args: [name],
    });
    done++;
  }

  console.log(dryRun ? "dry-run 结束" : `完成，套用了 ${done} 个 migration`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** 把 migration.sql 拆成单条语句：去 BOM、去注解、跳过 PRAGMA（migrate() 会处理外键）。 */
function splitStatements(sql: string): string[] {
  const clean = sql.replace(/^\uFEFF/, "");
  const out: string[] = [];
  let buf = "";
  let inStr = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === "'") {
      if (inStr && clean[i + 1] === "'") { buf += "''"; i++; continue; }
      inStr = !inStr;
    }
    if (ch === ";" && !inStr) { out.push(buf); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);

  return out
    .map((s) =>
      s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim()
    )
    .filter((s) => s.length > 0)
    .filter((s) => !/^PRAGMA\s/i.test(s));
}