// Phase 2 demo — replaced in Phase 8 with a server-side auth redirect:
//   session ? redirect("/chat") : redirect("/login")
"use client";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <h1 className="text-4xl font-semibold tracking-tight">PRISM AI Workspace</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Phase 2 check — teal accent, dark/light toggle (top right), and toast
        notifications are wired up.
      </p>

      <div className="flex gap-3">
        <Button onClick={() => toast.success("Teal primary button works!")}>
          Primary (teal)
        </Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Next: Phase 3 adds Prisma + SQLite.
      </p>
    </div>
  );
}
