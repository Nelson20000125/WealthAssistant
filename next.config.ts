import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse 底层用 pdfjs-dist，会在运行时动态 import 自己的 worker 脚本；
  // 让 Turbopack 打包这个动态 import 会解析失败（bundler 猜不出 worker 文件该摆哪），
  // 排除成 external 后改用原生 Node require/import，交给 pdfjs-dist 自己去找 worker 文件
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
