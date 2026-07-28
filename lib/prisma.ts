import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/app/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// libSQL adapter 同时支援本地档案与远端 Turso：
//   本地开发  DATABASE_URL="file:./dev.db"（DATABASE_AUTH_TOKEN 留空）
//   部署环境  DATABASE_URL="libsql://<db>.turso.io" + DATABASE_AUTH_TOKEN
// 注意：Prisma Migrate 不能对 Turso 跑（libSQL 走 HTTP），migration 一律在本地产生後
// 再用 scripts/turso-apply-migration.ts 套到远端。
const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
