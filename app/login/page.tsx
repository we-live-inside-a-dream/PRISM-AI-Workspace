// Sign-in page.
//
// Server component with an inline server-action <form>. Clicking the button
// posts back to the server, which then calls NextAuth v5's signIn() → a 302
// to GitHub → back to /api/auth/callback/github → session cookie set →
// redirectTo: "/chat".
//
// If the visitor is already signed in, we bounce straight to /chat so a
// stale /login bookmark doesn't get stuck.

import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

// lucide-react dropped brand icons (incl. GitHub) over trademark concerns,
// so we inline the Simple Icons mark here. Tiny, tree-shake-friendly.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.636 22.412c.575.105.785-.25.785-.556v-1.94c-3.2.696-3.876-1.544-3.876-1.544-.523-1.33-1.278-1.683-1.278-1.683-1.044-.714.08-.7.08-.7 1.154.081 1.762 1.185 1.762 1.185 1.027 1.76 2.695 1.252 3.352.957.104-.745.402-1.253.732-1.541-2.555-.29-5.242-1.278-5.242-5.69 0-1.257.45-2.286 1.185-3.092-.119-.29-.514-1.463.112-3.05 0 0 .967-.309 3.17 1.18a11.01 11.01 0 0 1 5.77 0c2.201-1.489 3.167-1.18 3.167-1.18.628 1.587.234 2.76.115 3.05.738.806 1.184 1.835 1.184 3.092 0 4.422-2.69 5.397-5.253 5.68.412.356.78 1.06.78 2.138v3.169c0 .309.207.667.79.554A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/chat");
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            PRISM AI Workspace
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            A multi-mode Claude-powered assistant. Sign in with GitHub to
            continue.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/chat" });
          }}
          className="mt-8"
        >
          <Button type="submit" size="lg" className="w-full gap-2">
            <GithubMark className="size-4" />
            Continue with GitHub
          </Button>
        </form>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          By signing in you agree to be a good citizen. No tracking beyond the
          session cookie required to keep you logged in.
        </p>
      </div>
    </div>
  );
}
