import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse } from "ai";
import { RequestContext, MASTRA_RESOURCE_ID_KEY, MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import { auth } from "@/auth";
import { mastra } from "@/lib/mastra";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session!.user.id;
  const body = await req.json();

  // 只挑 messages/trigger/resumeData/runId 这几个安全字段转发给 agent，
  // 不把整个 client body 原样透传——避免恶意 client 在 body 里塞 requestContext/resourceId
  // 之类的栏位，冒充别的 user 去读/写别人的对话记忆
  const requestContext = new RequestContext();
  requestContext.set(MASTRA_RESOURCE_ID_KEY, userId);
  requestContext.set(MASTRA_THREAD_ID_KEY, `wealth-advisor-${userId}`);
  requestContext.set("userId", userId);

  const stream = await handleChatStream({
    mastra,
    agentId: "wealth-advisor",
    params: {
      messages: body.messages,
      trigger: body.trigger,
      resumeData: body.resumeData,
      runId: body.runId,
    },
    defaultOptions: { requestContext },
    version: "v6",
  });

  return createUIMessageStreamResponse({ stream });
}
