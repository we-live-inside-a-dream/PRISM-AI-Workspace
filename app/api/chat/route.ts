// Load-bearing route for the whole app: streams the assistant's reply to the
// client token-by-token AND persists both turns to SQLite so the conversation
// survives page reloads.
//
// Key shape notes (AI SDK v6):
//   - Client sends UIMessage[] (parts-based). We convertToModelMessages() before
//     passing to streamText — never pass raw UIMessages to a model.
//   - Persistence uses toUIMessageStreamResponse({ onFinish }) — this callback
//     fires SERVER-SIDE after the stream drains, so the assistant message is
//     saved even if the client disconnects mid-stream. DO NOT use useChat's
//     client-side onFinish for persistence; a tab close would drop the turn.
//   - We save the user's trailing message BEFORE streaming begins, for the
//     same survive-disconnect reason.
//   - `x-conversation-id` header lets the client swap a freshly-created id
//     into its URL without a reload.
//
// Runtime: Node (Prisma + better-sqlite3 cannot run on Edge).

import { NextRequest } from "next/server";
import { streamText, convertToModelMessages, type UIMessage, type IdGenerator } from "ai";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMode, MODES, type Mode } from "@/lib/modes";
import { textFromParts } from "@/lib/rehydrate";
import { getModel, getProviderInfo } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  messages: UIMessage[];
  mode: Mode;
  conversationId?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages, conversationId } = body;
  const mode: Mode = isMode(body.mode) ? body.mode : "general";

  console.log(`[chat] POST received: ${messages.length} messages, conversationId=${conversationId ?? "null"}, mode=${mode}`);
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    console.log(`[chat] last message: role=${lastMsg.role}, hasParts=${Array.isArray(lastMsg.parts)}, partsLen=${Array.isArray(lastMsg.parts) ? lastMsg.parts.length : "N/A"}`);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages[] required", { status: 400 });
  }

  // Normalize: ensure every message has a parts array. AI SDK v6 UIMessages
  // use parts[] as the canonical shape. If any message lacks parts (e.g. a
  // raw { role, content } object from an older client or a bug), synthesize a
  // text part so convertToModelMessages never sees malformed input.
  const normalizedMessages: UIMessage[] = messages.map((m, i) => {
    const hasValidParts = Array.isArray(m.parts) && m.parts.length > 0;
    if (!m.role || !hasValidParts) {
      const msgAny = m as unknown as { content?: string };
      const text = typeof msgAny.content === "string" ? msgAny.content : "";
      console.log(`[chat] normalizing message[${i}]: role=${m.role ?? "missing"}, id=${m.id ?? "missing"}, text="${text.slice(0, 100)}"`);
      return {
        id: m.id ?? crypto.randomUUID(),
        role: (m.role ?? "user") as UIMessage["role"],
        parts: [{ type: "text", text }] as UIMessage["parts"],
      };
    }
    return m;
  });

  // ------------------------------------------------------------------
  // 1) Resolve (or create) the conversation, scoped to the signed-in user.
  //    If the client sent a conversationId that doesn't belong to them,
  //    we silently start a fresh conversation instead of erroring — keeps
  //    the UX forgiving against a stale URL.
  // ------------------------------------------------------------------
  let convo =
    conversationId != null
      ? await prisma.conversation.findFirst({
          where: { id: conversationId, userId },
        })
      : null;

  if (!convo) {
    // Seed the title from the first user message's text parts. We trim and
    // cap it so long prompts don't bloat the sidebar.
    const firstUser = normalizedMessages.find((m) => m.role === "user");
    const seedTitle = firstUser ? textFromParts(firstUser.parts).trim() : "";
    const title =
      seedTitle.length > 0 ? seedTitle.slice(0, 80) : MODES[mode].label;

    // If the client supplied a conversationId we couldn't find above, honor
    // it as the new row's id. This is how Option A (client-minted UUID) keeps
    // useChat's `id` stable across the first send: the URL we ack via the
    // x-conversation-id header is the same id the client already knows about,
    // so no mid-stream identity flip occurs.
    //
    // Safety: findFirst above is scoped to {id, userId}, so a missing row
    // here means either (a) a brand-new client-minted id, or (b) an id that
    // belongs to another user. In case (b), prisma.create will throw on the
    // unique-id constraint; we fall back to a server-generated id so the
    // request still succeeds rather than 500ing.
    try {
      convo = await prisma.conversation.create({
        data: {
          ...(conversationId ? { id: conversationId } : {}),
          userId,
          mode,
          title,
        },
      });
    } catch {
      convo = await prisma.conversation.create({
        data: { userId, mode, title },
      });
    }
  }

  // ------------------------------------------------------------------
  // 2) Persist the trailing user message BEFORE streaming starts, so it
  //    isn't lost if the client disconnects before the stream finishes.
  //    We only save it if it's actually new (i.e. it doesn't already have
  //    a DB row with the same id).
  // ------------------------------------------------------------------
  const trailing = normalizedMessages[normalizedMessages.length - 1];
  if (trailing.role === "user") {
    const already = await prisma.message.findUnique({
      where: { id: trailing.id },
    });
    if (!already) {
      await prisma.message.create({
        data: {
          id: trailing.id,
          conversationId: convo.id,
          role: "user",
          content: textFromParts(trailing.parts),
          parts: trailing.parts as never,
        },
      });
    }
  }

  // ------------------------------------------------------------------
  // 3) Stream the assistant's reply using the configured LLM provider.
  // ------------------------------------------------------------------
  const model = getModel();
  const providerInfo = getProviderInfo();
  console.log(
    `[chat] Using provider: ${providerInfo.provider}, model: ${providerInfo.modelId}`
  );

const modelMessages = await convertToModelMessages(normalizedMessages);
  console.log(`[chat] convertToModelMessages produced ${modelMessages.length} model messages`);
  if (modelMessages.length > 0) {
    const first = modelMessages[0];
    console.log(`[chat] first message role=${first.role}, content type=${typeof first.content}, content len=${typeof first.content === "string" ? first.content.length : Array.isArray(first.content) ? first.content.length : "N/A"}`);
  }

  let result;
  try {
    result = streamText({
      model,
      system: MODES[mode].system,
      messages: modelMessages,
      onChunk: ({ chunk }) => {
        console.log(`[chat] stream chunk type=${chunk.type}, id=${(chunk as { id?: string }).id ?? "n/a"}`);
      },
      onFinish: ({ finishReason, usage }) => {
        console.log(`[chat] streamText onFinish: reason=${finishReason}, usage=${JSON.stringify(usage)}`);
      },
      onError: ({ error }) => {
        console.error("[chat] streamText error:", error);
      },
    });
  } catch (err) {
    console.error("[chat] streamText constructor threw synchronously:", err);
    return new Response(JSON.stringify({ error: "Stream initialization failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const conversationIdForResponse = convo.id;

  return result.toUIMessageStreamResponse({
    // REQUIRED when using generateMessageId. Without originalMessages, the SDK
    // can't thread the new id into the stream's `start`/`text-start` chunks —
    // the client receives deltas tagged with the provider's temp id (e.g.
    // `msg_tmp_…`) that don't match any UI message, so nothing renders during
    // the first turn. The assistant text only appears after a page reload or
    // a follow-up send pulls it from history.
    originalMessages: normalizedMessages,
    generateMessageId: (() => crypto.randomUUID()) as IdGenerator,
    onFinish: async ({ responseMessage, isAborted }) => {
      console.log(`[chat] toUIMessageStreamResponse onFinish: messageId=${responseMessage.id}, isAborted=${isAborted}, parts=${responseMessage.parts.length}`);
      // If the user aborted, don't persist a partial assistant row — the
      // next send will include the same conversation and continue cleanly.
      if (isAborted) return;

      try {
        // Deduplicate: only persist if this message ID hasn't been saved yet.
        // This mirrors the deduplication pattern used for user messages (lines 91-104)
        // and prevents unique constraint errors if onFinish fires multiple times.
        const existing = await prisma.message.findUnique({
          where: { id: responseMessage.id },
        });
        if (!existing) {
          await prisma.message.create({
            data: {
              id: responseMessage.id,
              conversationId: conversationIdForResponse,
              role: "assistant",
              content: textFromParts(responseMessage.parts),
              parts: responseMessage.parts as never,
            },
          });
        }
        await prisma.conversation.update({
          where: { id: conversationIdForResponse },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        // Log loudly but don't throw — the client already received the
        // stream, so failing here would only create a console-side error.
        console.error("[chat] failed to persist assistant turn:", err);
      }
    },
    headers: {
      "x-conversation-id": conversationIdForResponse,
    },
  });
}
