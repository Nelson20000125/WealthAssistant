// 每日记账提醒（P1-07），由 Windows 排程工作「WealthAssistant-DailyReminder」每天 21:30 执行：
//   node node_modules/tsx/dist/cli.mjs scripts/send-daily-reminder.ts
// 今天已经记过账的人不发；推播服务说订阅失效（404/410）的顺手清掉。
// 电脑在 21:30 关机或睡眠 → 当天就不会发（排程工作不补跑，补发一条「你昨晚没记」没意义）。

async function main() {
  // lib/prisma 在 import 当下就读 DATABASE_URL，所以 env 要先载入、模块用动态 import
  for (const f of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(f);
    } catch {
      // 档案不存在就跳过
    }
  }
  const { sendDailyReminders } = await import("@/lib/push");
  const { webPushSend } = await import("@/lib/webPushSender");
  const result = await sendDailyReminders({ send: webPushSend() });
  console.log(new Date().toISOString(), JSON.stringify(result));
}

main().catch((e) => {
  console.error(new Date().toISOString(), e);
  process.exit(1);
});
