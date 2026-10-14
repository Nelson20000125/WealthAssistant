import type { MetadataRoute } from "next";

// 手机「加到主画面」用（经 Tailscale 的 HTTPS 网址打开，资料仍只在本机 dev.db）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "我的钱",
    short_name: "我的钱",
    start_url: "/",
    display: "standalone",
    background_color: "#0F1217",
    theme_color: "#0F1217",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
