// Next.js 16 Proxy (formerly middleware.ts). Gates protected routes —
// unauthenticated visits to /chat/** and the chat/history APIs get redirected
// to /login. Auth.js v5's `auth` function returns a Next response that handles
// the redirect automatically when wired up as the proxy handler.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    "/chat/:path*",
    "/api/chat/:path*",
    "/api/history/:path*",
  ],
};
