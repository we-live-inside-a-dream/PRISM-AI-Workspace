// Server component for /chat.
// Responsibilities:
//   - Gate on session (the proxy does this too, but re-check belt-and-suspenders)
//   - Pick the active mode from ?mode= (default: general)
//   - If ?c=<id> is present, fetch that conversation's messages from the DB
//     and rehydrate them into UIMessage shape for the client
//   - Render the Sidebar + ChatWindow shell
//
// The ChatWindow is keyed on `mode` only — switching modes wipes useChat
// state, but switching conversations is handled internally so an in-flight
// stream survives the URL update that happens on the first send of a new
// chat (when we router.replace to add ?c=<newId>).
//
// IMPORTANT: do NOT include conversationId in the key. The first send of a
// brand-new chat triggers router.replace(?c=<newId>) the moment the server
// returns the x-conversation-id header. If conversationId were part of the
// key, that URL update would remount ChatWindow mid-stream — useChat would
// lose its in-flight assistant message, the streamed deltas would be
// orphaned, and nothing would render. The "first message: no response;
// second message: both at once" bug.

import { redirect } from "next/navigation";
import { Menu } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isMode, type Mode } from "@/lib/modes";
import { dbRowToUIMessage } from "@/lib/rehydrate";
import { Sidebar } from "@/components/Sidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ChatPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const sp = await searchParams;
  const modeParam = typeof sp.mode === "string" ? sp.mode : "general";
  const mode: Mode = isMode(modeParam) ? modeParam : "general";
  const conversationId = typeof sp.c === "string" ? sp.c : undefined;

  let initialMessages: ReturnType<typeof dbRowToUIMessage>[] = [];
  let resolvedConversationMode: Mode | undefined;

  if (conversationId) {
    // Load-bearing: scope by userId so a stale URL from another account
    // silently falls through to an empty conversation rather than leaking.
    const convo = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: session.user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (convo) {
      if (isMode(convo.mode)) resolvedConversationMode = convo.mode;
      initialMessages = convo.messages.map(dbRowToUIMessage);
    }
  }

  // If the URL mode disagrees with the loaded conversation's mode, trust the
  // conversation — prevents a mismatched system prompt on reload.
  const activeMode: Mode = resolvedConversationMode ?? mode;

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden border-r border-border/60 md:block">
        <Sidebar
          user={session.user}
          activeMode={activeMode}
          activeConversationId={conversationId}
        />
      </div>

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <Sidebar
                user={session.user}
                activeMode={activeMode}
                activeConversationId={conversationId}
              />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">PRISM</span>
          <ThemeToggle />
        </div>

        {/* Desktop theme-toggle tucked into the top-right */}
        <div className="hidden items-center justify-end px-4 pt-3 md:flex">
          <ThemeToggle />
        </div>

        <div className="min-h-0 flex-1">
          <ChatWindow
            // Key includes conversationId so navigating between existing
            // chats (sidebar clicks) remounts and resets useChat state.
            // The brand-new-chat first-send case is handled by ChatWindow
            // itself: instead of router.replace (which re-runs this server
            // component and would remount mid-stream), it uses
            // window.history.replaceState to update the URL bar without
            // notifying React's router. Refresh still works because the
            // address bar carries ?c=<id>.
            key={`${activeMode}-${conversationId ?? "new"}`}
            mode={activeMode}
            conversationId={conversationId}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  );
}
