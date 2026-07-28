import { Mastra } from "@mastra/core";
import { Observability } from "@mastra/observability";
import { LangfuseExporter } from "@mastra/langfuse";
import { LibSQLStore } from "@mastra/libsql";
import { wealthAdvisorAgent } from "./agents/wealth-advisor";

export const mastra = new Mastra({
  agents: { wealthAdvisorAgent },
  // 对话记忆库。本地用档案，部署时用独立的 Turso DB（跟业务资料分开）
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: process.env.MASTRA_DB_URL ?? "file:./mastra.db",
    authToken: process.env.MASTRA_DB_AUTH_TOKEN,
  }),
  observability: new Observability({
    configs: {
      langfuse: {
        serviceName: "wealth-assistant",
        exporters: [new LangfuseExporter()],
      },
    },
  }),
});
