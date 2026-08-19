import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // 解析 tsconfig 的 @/ 别名。Vite 已原生支援，不需要 vite-tsconfig-paths 外挂
    tsconfigPaths: true,
  },
  test: {
    // 测的是财务计算，纯 Node 逻辑，不需要 DOM
    environment: "node",
    // setup 要在测试档 import lib/prisma 之前把 DATABASE_URL 指到临时库，
    // 否则会连到真实的 dev.db
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // 每个测试档一个 fork，各自持有自己的 prisma 单例与临时库，互不干扰
    pool: "forks",
  },
});
