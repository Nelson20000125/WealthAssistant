import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse 底层用 pdfjs-dist，会在运行时动态 import 自己的 worker 脚本；
  // 让 Turbopack 打包这个动态 import 会解析失败（bundler 猜不出 worker 文件该摆哪），
  // 排除成 external 后改用原生 Node require/import，交给 pdfjs-dist 自己去找 worker 文件
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // 手机经 Tailscale（https://msi.taile52f35.ts.net）连 dev server。不放行的话 HMR websocket
  // 被挡（502），dev client 连不上就整页重载 → 手机上「一直刷新、⊕ 打不开」。
  // Next 的 `*` 只配一层，`*.ts.net` 配不到 msi.taile52f35.ts.net（2026-09-29 踩过）
  allowedDevOrigins: ["*.taile52f35.ts.net"],
};

export default nextConfig;
