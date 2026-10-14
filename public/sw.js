// 每日记账提醒（P1-07）的 service worker：只负责收推播、点通知开「记一笔」。
// 不做离线快取 —— 资料在电脑上，离线也记不了。

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "我的钱", {
      body: data.body || "今天还记账吗？",
      icon: "/icon-192.png",
      data: { url: data.url || "/?add=1" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/?add=1";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if (win) return win.navigate(url).then((w) => (w || win).focus());
      return self.clients.openWindow(url);
    })
  );
});
