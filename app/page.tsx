// Root route — session-aware redirect.
//
// We can't rely on the proxy to do this for us (the proxy only gates the
// routes in its matcher, and `/` is public so history-fetch + favicon etc.
// still work before sign-in). So: ask for the session here, and bounce.

import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/chat" : "/login");
}
