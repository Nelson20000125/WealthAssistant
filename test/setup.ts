/**
 * 每个测试档跑在自己的临时 SQLite 库上。
 *
 * 为什么用真实资料库而不是 mock prisma：这些模组的重点是「查出来的资料怎么算钱」，
 * 而查询本身就是逻辑的一部分 —— 例如取最新手动价用的是
 * `orderBy: date desc` + `distinct: holdingId`。mock 掉 prisma 等於自己写死
 * 「我以为它会回什么」，那种测试只会描述实现，不会描述需求。
 *
 * DATABASE_URL 必须在任何 import "@/lib/prisma" 之前设好：那个模组在载入时就
 * 用 env 建好 libSQL adapter，晚了就连到真实的 dev.db 了。vitest 的 setupFiles
 * 保证在测试档载入前执行，所以这里设是安全的。
 */
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";

const dbPath = path.join(os.tmpdir(), `wa-test-${randomUUID()}.db`);
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.DATABASE_AUTH_TOKEN = "";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

/** 与 scripts/apply-migration-local.mjs 同一套拆解：去注解、跳过 PRAGMA */
function splitStatements(sql: string): string[] {
  const clean = sql.replace(/^﻿/, "");
  const out: string[] = [];
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

const client = createClient({ url: `file:${dbPath}` });

// 按档名排序跑完所有 migration，跟正式环境同一套 SQL —— schema 变了测试自动跟上，
// 不需要另外维护一份建表脚本。
const dirs = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const name of dirs) {
  const file = path.join(MIGRATIONS_DIR, name, "migration.sql");
  if (!fs.existsSync(file)) continue;
  await client.migrate(splitStatements(fs.readFileSync(file, "utf8")));
}

// 依外键相依顺序清空，让每个 test 从乾净状态开始
const TABLES = [
  "HoldingPrice",
  "Transaction",
  "ImportBatch",
  "CategoryRule",
  "Category",
  "Holding",
  "Account",
  "PortfolioSnapshot",
  "Goal",
  "AiUsage",
  "FxRate",
  "PriceCache",
  "User",
];

beforeEach(async () => {
  for (const t of TABLES) await client.execute(`DELETE FROM "${t}"`);
});

afterAll(() => {
  client.close();
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // 档案不存在或被占用都无所谓，反正在系统暂存目录
    }
  }
});
