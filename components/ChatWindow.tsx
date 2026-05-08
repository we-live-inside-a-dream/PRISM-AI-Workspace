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
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { ModeHeader } from "@/components/ModeHeader";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { LoadingDots } from "@/components/LoadingDots";
import type { Mode } from "@/lib/modes";

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
  const router = useRouter();
  const { mutate } = useSWRConfig();

  // Track whether the URL has been reconciled to the real conversation id.
  // Used so we only router.replace() once, on the first send of a new chat.
  const urlSyncedRef = useRef<string | undefined>(conversationId);

  // DefaultChatTransport is created once — its `body` option closes over the
  // initial `mode` + `conversationId`. We update the id through the fetch
  // interceptor below, and for `mode` we just remount the ChatWindow with a
  // new `key` when the sidebar switches modes (see app/chat/page.tsx).
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        // `body` is resolvable — a function gives us fresh values at send time.
        body: () => ({
          mode,
          conversationId: urlSyncedRef.current,
        }),
        // Intercept the fetch so we can capture the x-conversation-id header
        // before the stream is handed off to the chat state machine.
        fetch: async (input, init) => {
          const res = await fetch(input, init);
          const newId = res.headers.get("x-conversation-id");
          if (newId && newId !== urlSyncedRef.current) {
            urlSyncedRef.current = newId;
            // Update the URL without triggering a full navigation/reload.
            router.replace(`/chat?mode=${mode}&c=${newId}`, { scroll: false });
          }
          return res;
        },
      }),
    // transport is intentionally stable across re-renders within one chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    onError: (error) => {
      console.error("[chat] client error:", error);
      clearError();
      toast.error(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    },
    onFinish: () => {
      mutate("/api/history");
    },
  });

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
