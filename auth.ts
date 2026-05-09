// NextAuth v5 root config. Lives at the repo root (not in /lib) because
// middleware.ts and proxy.ts need to import it across the Edge/Node boundary.
//
// Exports:
//   handlers  → used by app/api/auth/[...nextauth]/route.ts
//   auth      → used in server components, route handlers, and middleware
//   signIn    → used by the login page's server action
//   signOut   → used by the sidebar's sign-out button
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Prisma 7 ships a custom client at lib/generated/prisma; its runtime shape
  // matches the adapter's expected @prisma/client contract, but the TS types
  // are not nominally compatible. The double-cast is a documented workaround.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  providers: [GitHub],
  secret: process.env.AUTH_SECRET,
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  callbacks: {
    // Protect gated routes — NextAuth v5's proxy/middleware calls this.
    // Return true to allow, false to redirect to the `pages.signIn` page.
    authorized({ auth: session }) {
      return !!session?.user;
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
