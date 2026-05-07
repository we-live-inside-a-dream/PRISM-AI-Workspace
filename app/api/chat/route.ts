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
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMode, MODES, type Mode } from "@/lib/modes";
import { textFromParts } from "@/lib/rehydrate";

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

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages[] required", { status: 400 });
  }

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
    const firstUser = messages.find((m) => m.role === "user");
    const seedTitle = firstUser ? textFromParts(firstUser.parts).trim() : "";
    const title =
      seedTitle.length > 0 ? seedTitle.slice(0, 80) : MODES[mode].label;

    convo = await prisma.conversation.create({
      data: { userId, mode, title },
    });
  }

  // ------------------------------------------------------------------
  // 2) Persist the trailing user message BEFORE streaming starts, so it
  //    isn't lost if the client disconnects before the stream finishes.
  //    We only save it if it's actually new (i.e. it doesn't already have
  //    a DB row with the same id).
  // ------------------------------------------------------------------
  const trailing = messages[messages.length - 1];
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
  // 3) Stream the assistant's reply.
  // ------------------------------------------------------------------
  const result = streamText({
    model: anthropic("claude-sonnet-4-5"),
    system: MODES[mode].system,
    messages: await convertToModelMessages(messages),
  });

  // Capture id for the closure + response header.
  const conversationIdForResponse = convo.id;

  return result.toUIMessageStreamResponse({
    // Persist the assistant turn + bump the conversation's updatedAt so the
    // sidebar's "recent chats" ordering is correct.
    onFinish: async ({ responseMessage, isAborted }) => {
      // If the user aborted, don't persist a partial assistant row — the
      // next send will include the same conversation and continue cleanly.
      if (isAborted) return;

      try {
        await prisma.message.create({
          data: {
            id: responseMessage.id,
            conversationId: conversationIdForResponse,
            role: "assistant",
            content: textFromParts(responseMessage.parts),
            parts: responseMessage.parts as never,
          },
        });
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
