# PRISM AI Workspace

A multi-mode Claude-powered AI workspace. Sign in with GitHub, pick one of
four specialized modes (General Chat, Code Assistant, Email Writer, Data
Analyst), and hold persistent, streamed multi-turn conversations. Each mode
is a distinct system prompt; history is stored per-user, per-mode.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

---

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** (CSS-first `@theme` config) + **shadcn/ui** (base-ui primitives) + **next-themes**
- **NextAuth v5** (database session strategy) with **GitHub OAuth**
- **Prisma 7** + **SQLite** (via `@prisma/adapter-better-sqlite3`, Prisma 7's driver-adapter model)
- **Vercel AI SDK v6** + **`@ai-sdk/anthropic`** — `streamText` + `toUIMessageStreamResponse` with a server-side `onFinish` stream-tap for persistence
- **Claude Sonnet 4.5** (`claude-sonnet-4-5`)
- **SWR** for sidebar history, **react-markdown** + **rehype-highlight** for assistant rendering, **sonner** for toasts

## The four modes

| Mode | What it does |
|---|---|
| **General Chat** | Friendly, curious general-purpose assistant. |
| **Code Assistant** | Senior engineer — reviews, debugs, explains code; always fenced Markdown with language tags for syntax highlighting. |
| **Email Writer** | Drafts professional emails; every reply opens with `**Subject:**` on its own line. |
| **Data Analyst** | Plain-English approach + runnable SQL / pandas / R; names chart type + axes. |

All system prompts live in [`lib/modes.ts`](./lib/modes.ts).

## Architecture at a glance

```
auth.ts                              NextAuth v5 root config
proxy.ts                             Gates /chat, /api/chat, /api/history (Next 16 proxy)
prisma/schema.prisma                 User/Account/Session/VerificationToken + Conversation/Message
lib/
  prisma.ts                          Singleton client + better-sqlite3 driver adapter
  modes.ts                           System prompts + example cards (Mode union)
  rehydrate.ts                       Message row ⇄ UIMessage helpers
app/
  page.tsx                           Server redirect: session ? /chat : /login
  login/page.tsx                     GitHub sign-in (server action)
  chat/page.tsx                      Server: auth + optional rehydrate → <ChatWindow />
  api/auth/[...nextauth]/route.ts    handlers.{GET,POST}
  api/chat/route.ts                  ★ streamText + toUIMessageStreamResponse({ onFinish })
  api/history/route.ts               GET list / DELETE one
components/
  Sidebar.tsx  ChatWindow.tsx  ModeHeader.tsx
  MessageBubble.tsx  ChatInput.tsx  LoadingDots.tsx
  theme-provider.tsx  theme-toggle.tsx
```

### Persistence model

- User's trailing message is written to the DB **before** streaming starts.
- Assistant's message is written from `toUIMessageStreamResponse({ onFinish })`, which runs **server-side after the stream drains** — so the turn survives client disconnects (tab close, network drop, navigate-away).
- Every `Message` row stores both the canonical AI-SDK `parts` JSON **and** a derived plain-text `content` column, so the DB is still queryable without JSON parsing.
- Fresh conversations get their id returned to the client via the `x-conversation-id` response header; the client swaps it into the URL (`/chat?mode=…&c=…`) without a reload.

---

## Local setup

**Requirements:** Node 20 (`.nvmrc` pins it), pnpm 10.

```bash
# 1. Clone + install
pnpm install

# 2. Create a GitHub OAuth app
#    https://github.com/settings/developers → New OAuth App
#      Homepage URL:   http://localhost:3000
#      Callback URL:   http://localhost:3000/api/auth/callback/github
#    Copy the Client ID + a fresh client secret.

# 3. Fill in .env (copy .env.example → .env if missing)
#      AUTH_SECRET          → `pnpm dlx auth secret` (or `openssl rand -base64 32`)
#      AUTH_GITHUB_ID       → from step 2
#      AUTH_GITHUB_SECRET   → from step 2
#      ANTHROPIC_API_KEY    → from https://console.anthropic.com

# 4. Create the SQLite database + client
pnpm db:push            # applies schema.prisma to a fresh dev.db
pnpm db:generate        # regenerates the custom client in lib/generated/prisma

# 5. Run
pnpm dev                # → http://localhost:3000
```

## Environment variables

| Key | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:./dev.db` in dev. Swap for a Postgres URL in prod. |
| `AUTH_SECRET` | ✅ | v5 name (NOT `NEXTAUTH_SECRET`). Generate with `pnpm dlx auth secret`. |
| `AUTH_URL` | prod only | Set to your deployed origin if NextAuth's callback detection misfires. |
| `AUTH_GITHUB_ID` | ✅ | GitHub OAuth app client id. |
| `AUTH_GITHUB_SECRET` | ✅ | GitHub OAuth app client secret. |
| `ANTHROPIC_API_KEY` | ✅ | For the `/api/chat` route. |

## Useful scripts

```bash
pnpm dev            # Next dev server (Turbopack)
pnpm build          # Production build
pnpm start          # Run the production build
pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint
pnpm db:push        # prisma db push
pnpm db:generate    # prisma generate
pnpm db:studio      # prisma studio (browse the DB)
```

---

## Deploying to production

The one-time swaps you'll want to make:

1. **SQLite → Postgres.** Prisma does not allow parameterizing `datasource.provider`, so edit `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
   Then drop the `@prisma/adapter-better-sqlite3` + `better-sqlite3` adapter wiring in `lib/prisma.ts` (use either the direct client or Prisma's Postgres driver adapter of choice) and run `pnpm prisma migrate deploy` against the target database.

2. **Set `AUTH_TRUST_HOST=true`** on platforms (Vercel, Fly, etc.) that put a proxy in front of your app — NextAuth v5 otherwise refuses to trust `X-Forwarded-*` headers.

3. **Update the GitHub OAuth app callback URL** to your production origin: `https://<your-domain>/api/auth/callback/github`.

4. **`postinstall: prisma generate`** is already wired into `package.json` so build agents regenerate the Prisma client automatically.

---

## Verification checklist (manual smoke test)

After `pnpm dev`:

1. `/` → redirects to `/login` when unauthenticated.
2. GitHub sign-in → lands on `/chat`; `User` + `Session` rows exist in `pnpm db:studio`.
3. Sidebar renders: logo, 4 modes, empty history, avatar + sign-out, tech badges.
4. **General Chat** empty-state: welcome + 3 example cards; clicking one populates the textarea and sends.
5. Response **streams token-by-token**; loading dots disappear as soon as streaming starts.
6. Prisma Studio: 1 `Conversation` row + 2 `Message` rows (user, assistant), both with populated `parts` JSON.
7. **Code Assistant**: `"write fizzbuzz in Rust"` → highlighted code block with a hover-reveal copy button that toasts "Copied!".
8. **Email Writer**: output starts with `**Subject:**` on its own line.
9. **Data Analyst**: output mixes prose + fenced Python/SQL.
10. Reload → sidebar lists past conversations, grouped by mode; clicking one rehydrates correctly.
11. Delete a conversation → disappears from sidebar; messages cascade-deleted in Studio.
12. Dark/light toggle works; code-block theme follows.
13. Mobile width → sidebar collapses to a top bar; hamburger opens a `<Sheet>`.
14. Enter sends / Shift+Enter newlines; textarea auto-resizes with content.
15. Sign out → `/chat` proxy-redirects back to `/login`.

---

Built with [Claude](https://anthropic.com) + [Vercel AI SDK](https://ai-sdk.dev).
