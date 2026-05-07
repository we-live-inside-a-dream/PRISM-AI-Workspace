// Temporary smoke-test endpoint for Phase 3 verification.
// Remove (or gate behind NODE_ENV !== 'production') once auth is wired in Phase 4.
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [users, conversations, messages] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.message.count(),
    ]);
    return Response.json({
      ok: true,
      counts: { users, conversations, messages },
      note: "Prisma 7 + better-sqlite3 adapter working.",
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
