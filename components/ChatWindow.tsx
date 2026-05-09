"use client";

/* eslint-disable react-hooks/refs -- the DefaultChatTransport constructor
   captures `urlSyncedRef`, but ref reads happen later inside `body()` and
   `fetch()` callbacks at send time, not during render. The rule lints the
   whole useMemo factory as render-phase, which it effectively isn't here. */

// Orchestrates a single chat session:
// - Owns the useChat() state (messages, sendMessage, status, stop)
// - Sends `mode` + `conversationId` on every request via DefaultChatTransport's
//   `body` option (v6 moved this off the useChat() call)
// - On the very first send of a brand-new chat, reads the `x-conversation-id`
//   response header and updates the URL via router.replace() so refresh works
// - Triggers SWR revalidation of /api/history after every completion so the
//   sidebar reflects the new title / bumped updatedAt
// - Auto-scrolls to the bottom as messages and streamed tokens arrive

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { type UIMessage } from "ai";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ModeHeader } from "@/components/ModeHeader";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { LoadingDots } from "@/components/LoadingDots";
import type { Mode } from "@/lib/modes";
import { StreamingChatTransport } from "@/lib/StreamingChatTransport";

type ChatWindowProps = {
  mode: Mode;
  conversationId?: string;
  initialMessages: UIMessage[];
};

export function ChatWindow({
  mode,
  conversationId,
  initialMessages,
}: ChatWindowProps) {
  const { mutate } = useSWRConfig();

  // Stable chat id for the lifetime of this component instance. For an existing
  // conversation we use its server id; for a brand-new chat we mint a UUID
  // client-side and reuse it as the conversation id. This keeps useChat's `id`
  // constant across the first send — without it, the id would flip from
  // undefined -> server-generated mid-stream and useChat would discard the
  // in-flight assistant message, surfacing it only on the *next* send (the
  // "first message gets no response, second message returns both" bug).
  const [chatId] = useState<string>(() => conversationId ?? crypto.randomUUID());

  // Track whether the URL has been reconciled to the real conversation id.
  // Used so we only router.replace() once, on the first send of a new chat.
  const urlSyncedRef = useRef<string | undefined>(conversationId);

  // DefaultChatTransport is created once — its `body` option closes over the
  // initial `mode` + `conversationId`. We update the id through the fetch
  // interceptor below, and for `mode` we just remount the ChatWindow with a
  // new `key` when the sidebar switches modes (see app/chat/page.tsx).
  const transport = useMemo(
    () =>
      new StreamingChatTransport({
        api: "/api/chat",
        body: () => ({
          mode,
          // Always send our stable chatId. The server treats this as an
          // upsert key: find-or-create the conversation with this exact id,
          // so the URL we router.replace() to below resolves on refresh.
          conversationId: urlSyncedRef.current ?? chatId,
        }),
        onConversationId: (newId) => {
          if (newId && newId !== urlSyncedRef.current) {
            urlSyncedRef.current = newId;
            // Use history.replaceState instead of router.replace so the URL
            // bar updates without re-running the server component or
            // notifying Next.js's router. router.replace would re-render
            // the parent with a new conversationId, change the ChatWindow
            // key, and remount us mid-stream — losing the in-flight
            // assistant message. The address bar still carries ?c=<id>
            // so a manual refresh resolves the conversation correctly.
            const url = `/chat?mode=${mode}&c=${newId}`;
            window.history.replaceState(null, "", url);
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onError: (error) => {
      console.error("[chat] client error:", error);
      clearError();
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    },
    onFinish: (finishEvent) => {
      mutate("/api/history");
    },
  });

  useEffect(() => {
    console.log(`[chat] status=${status}, msgCount=${messages.length}`);
  }, [status, messages.length]);

  // -- Example-card seeding: ChatInput listens to `seed` to pre-fill itself.
  const [seed, setSeed] = useState<string | undefined>();

  const showWelcome = messages.length === 0;
  const isWaitingForFirstToken = status === "submitted";

  // -- Autoscroll to bottom on new messages / token arrivals
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModeHeader
        mode={mode}
        showWelcome={showWelcome}
        onExample={(text) => setSeed(text + " ")}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isStreaming={
                  isLast && m.role === "assistant" && status === "streaming"
                }
              />
            );
          })}
          {isWaitingForFirstToken ? <LoadingDots /> : null}
        </div>
      </div>

      <div className="border-t border-border/60 bg-background px-4 py-3 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            status={status}
            onStop={stop}
            seed={seed}
            onSend={(text) => {
              sendMessage({ text });
            }}
          />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            PRISM may make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}
