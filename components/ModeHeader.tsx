"use client";

// Shows the current mode's label + description at the top of the chat pane.
// On a fresh conversation (no messages), also renders a welcome block with
// three click-to-send example prompts.

import { MODES, type Mode } from "@/lib/modes";
import { BarChart3, Code2, Mail, MessagesSquare, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const ICONS: Record<string, LucideIcon> = {
  MessagesSquare,
  Code2,
  Mail,
  BarChart3,
};

type ModeHeaderProps = {
  mode: Mode;
  showWelcome: boolean;
  onExample: (text: string) => void;
};

export function ModeHeader({ mode, showWelcome, onExample }: ModeHeaderProps) {
  const cfg = MODES[mode];
  const Icon = ICONS[cfg.icon] ?? MessagesSquare;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3 md:px-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">{cfg.label}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {cfg.description}
          </p>
        </div>
      </div>

      {showWelcome ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-8 pb-4 md:px-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{cfg.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {cfg.description}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {cfg.examples.map((ex) => (
              <Button
                key={ex}
                type="button"
                variant="outline"
                onClick={() => onExample(ex)}
                className="h-auto whitespace-normal rounded-xl px-3 py-3 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {ex}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
