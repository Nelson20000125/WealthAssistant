/**
 * 建管理员帐号：npx tsx scripts/create-admin-user.ts
 * 读 .env / .env.local 里的 ADMIN_EMAIL / ADMIN_PASSWORD。幂等：同一 email 重跑只更新密码，不会重复建帐号。
 *
 * 2026-07-20 首次执行时曾用这支脚本把 userId 从 nullable 收紧成 required 前的旧资料
 * 回填到这个帐号（Account/Category/Transaction/ImportBatch/Goal/PortfolioSnapshot），
 * 现在 schema 已经收紧、userId 不可能是 null，回填逻辑已移除。
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("请先在 .env.local 设置 ADMIN_EMAIL / ADMIN_PASSWORD");
  }

  // 动态 import：确保上面的 dotenv config() 先跑完、DATABASE_URL 已经在 process.env 里，
  // 静态 import 会被提升到文件最上面，比 config() 先执行，届时 DATABASE_URL 还是空的
  const bcrypt = (await import("bcryptjs")).default;
  const { prisma } = await import("@/lib/prisma");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  console.log(`管理员帐号就绪：${user.email}（${user.id}）`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
