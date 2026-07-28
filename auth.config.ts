import type { NextAuthConfig } from "next-auth";

// Edge Runtime 安全的设定：给 middleware.ts 用，不能 import 任何碰 Prisma/libSQL
// 的东西（Edge Runtime 不支援 Node.js 的 fs/path 等模组）。真正的 Credentials provider
// （里面会查 Prisma）只在 auth.ts（跑在 Node runtime）里配置。
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
} satisfies NextAuthConfig;
