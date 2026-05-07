// NextAuth v5 route handler — re-exports handlers.GET / handlers.POST from
// the root auth.ts config. Keep this file tiny; real config lives in /auth.ts.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
