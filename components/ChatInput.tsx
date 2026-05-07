"use client";

// Auto-resizing textarea with:
// - Enter submits, Shift+Enter inserts a newline
// - Disabled while the chat is streaming (status !== "ready" && status !== "error")
// - Send button swaps to a Stop button while streaming so the user can abort

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ChatStatus } from "ai";
import { ArrowUp, Square } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_TEXTAREA_PX = 200; // grows up to this, then scrolls

type ChatInputProps = {
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Optional seed value — used by the empty-state example cards. */
  seed?: string;
  placeholder?: string;
};

export function ChatInput({
  status,
  onSend,
  onStop,
  seed,
  placeholder = "Message the assistant…",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const isBusy = status === "submitted" || status === "streaming";

  // Seed the textarea when an example card is clicked. We intentionally
  // re-run on every `seed` change so clicking the same card twice still
  // refocuses the textarea. The setState-in-effect here is deliberate —
  // the effect's job is to sync an external trigger (`seed`) into local
  // input state; there's no derived-state alternative that preserves the
  // "click same card twice to refocus" behavior.
  useEffect(() => {
    if (seed != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(seed);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [seed]);

  // Auto-resize: reset to auto so shrink works, then grow to scrollHeight.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || isBusy) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative flex items-end gap-2 rounded-2xl border border-border/80 bg-background p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
      <Textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={isBusy && status === "submitted"}
        className={cn(
          "min-h-[2.5rem] resize-none border-0 bg-transparent p-2 shadow-none focus-visible:ring-0 focus-visible:outline-0",
        )}
      />
      {isBusy ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label="Stop generating"
          onClick={onStop}
          className="size-9 shrink-0"
        >
          <Square className="size-4" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          aria-label="Send"
          onClick={submit}
          disabled={value.trim().length === 0}
          className="size-9 shrink-0"
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </div>
  );
}
