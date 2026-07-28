"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export function useAdvisorChat() {
  return useChat({
    transport: new DefaultChatTransport({
      api: "/api/advisor",
      prepareSendMessagesRequest({ messages }) {
        return {
          body: {
            messages,
            memory: { resource: "kiale", thread: "wealth-advisor-main" },
          },
        };
      },
    }),
  });
}
