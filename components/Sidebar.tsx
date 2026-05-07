"use client";

// Left rail of the chat UI.
// Contents, top to bottom:
//   - PRISM logo + wordmark
//   - 4 mode buttons (active mode highlighted)
//   - Conversation history (SWR-fetched from /api/history), grouped by mode,
//     with a hover-only delete button on each row
//   - User avatar + sign-out server action
//   - Tech-stack badges (portfolio flavor)
//
// Mobile: this component is rendered inside a <Sheet> by the top bar.
// Desktop: rendered as a fixed-width sibling of the chat pane.

import { useMemo, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  Code2,
  LogOut,
  Mail,
  MessagesSquare,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { MODES, type Mode } from "@/lib/modes";
import { cn } from "@/lib/utils";

const MODE_ICONS: Record<Mode, LucideIcon> = {
  general: MessagesSquare,
  code: Code2,
  email: Mail,
  data: BarChart3,
};

type ConversationRow = {
  id: string;
  mode: Mode;
  title: string;
  updatedAt: string;
};

type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type SidebarProps = {
  user: SessionUser;
  activeMode: Mode;
  activeConversationId?: string;
  /** Optional callback fired after a nav click — used to close the mobile sheet. */
  onNavigate?: () => void;
};

const fetcher = async (url: string): Promise<ConversationRow[]> => {
  const res = await fetch(url);
  if (!res.ok) {
    // Phase 7 hasn't shipped yet: tolerate a 404 and show an empty list.
    if (res.status === 404) return [];
    throw new Error(`History fetch failed: ${res.status}`);
  }
  return res.json();
};

export function Sidebar({
  user,
  activeMode,
  activeConversationId,
  onNavigate,
}: SidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const { data, isLoading, mutate } = useSWR<ConversationRow[]>(
    "/api/history",
    fetcher,
    { revalidateOnFocus: false },
  );

  const grouped = useMemo(() => {
    const by: Record<Mode, ConversationRow[]> = {
      general: [],
      code: [],
      email: [],
      data: [],
    };
    for (const row of data ?? []) {
      (by[row.mode] ??= []).push(row);
    }
    return by;
  }, [data]);

  const gotoMode = (m: Mode) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("mode", m);
    q.delete("c");
    startTransition(() => router.push(`/chat?${q.toString()}`));
    onNavigate?.();
  };

  const gotoConversation = (row: ConversationRow) => {
    const q = new URLSearchParams();
    q.set("mode", row.mode);
    q.set("c", row.id);
    startTransition(() => router.push(`/chat?${q.toString()}`));
    onNavigate?.();
  };

  const deleteConversation = async (id: string) => {
    // Optimistic: drop from local list, then fire DELETE, then revalidate.
    await mutate(
      async (prev) => {
        await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        return (prev ?? []).filter((r) => r.id !== id);
      },
      { revalidate: true, rollbackOnError: true },
    );
    // If the user deleted the conversation they're currently viewing, kick
    // them back to the mode's empty state.
    if (id === activeConversationId) {
      const q = new URLSearchParams();
      q.set("mode", activeMode);
      router.replace(`/chat?${q.toString()}`);
    }
  };

  return (
    <aside className="flex h-full w-[280px] flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">
          PRISM <span className="text-muted-foreground">Workspace</span>
        </span>
      </div>

      <Separator />

      {/* Modes */}
      <nav className="flex flex-col gap-1 px-2 py-3">
        <p className="px-2 pb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Modes
        </p>
        {(Object.keys(MODES) as Mode[]).map((m) => {
          const Icon = MODE_ICONS[m];
          const active = m === activeMode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => gotoMode(m)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50",
              )}
            >
              <Icon
                className={cn(
                  "size-4",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="truncate">{MODES[m].label}</span>
            </button>
          );
        })}
      </nav>

      <Separator />

      {/* History */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
        <p className="px-2 pb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Recent
        </p>

        {isLoading ? (
          <div className="flex flex-col gap-2 px-2 py-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No conversations yet. Say hello.
          </p>
        ) : (
          (Object.keys(grouped) as Mode[])
            .filter((m) => grouped[m].length > 0)
            .map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <div key={m} className="mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
                    <Icon className="size-3" />
                    <span>{MODES[m].label}</span>
                  </div>
                  <ul className="flex flex-col">
                    {grouped[m].map((row) => {
                      const active = row.id === activeConversationId;
                      return (
                        <li key={row.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => gotoConversation(row)}
                            title={row.title}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-left text-xs transition",
                              active
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "hover:bg-sidebar-accent/50",
                            )}
                          >
                            <span className="truncate">{row.title}</span>
                          </button>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label="Delete conversation"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteConversation(row.id);
                                  }}
                                  className="absolute top-1/2 right-1 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                                />
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
        )}
      </div>

      <Separator />

      {/* Footer: user + tech badges */}
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex items-center gap-2">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? "You"}
              width={32}
              height={32}
              className="size-8 rounded-full"
            />
          ) : (
            <div className="size-8 rounded-full bg-muted" />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium">{user.name ?? "Signed in"}</p>
            {user.email ? (
              <p className="truncate text-muted-foreground">{user.email}</p>
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Sign out"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="size-8"
                />
              }
            >
              <LogOut className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-wrap gap-1">
          {["Next.js", "TypeScript", "Claude API"].map((t) => (
            <span
              key={t}
              className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
        <Link
          href="https://anthropic.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Built with the Claude API →
        </Link>
      </div>
    </aside>
  );
}
