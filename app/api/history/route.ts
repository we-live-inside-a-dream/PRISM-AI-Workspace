// Sidebar history API.
//
//   GET  /api/history              → list the signed-in user's conversations,
//                                     newest-first, grouped client-side by mode
//   DELETE /api/history?id=<cuid>  → delete one conversation owned by the user
//                                     (messages cascade via Prisma relation)
//
// Both endpoints are auth-gated by the root proxy.ts (`/api/history/:path*`),
// AND re-check here so a misconfigured matcher can't leak data. DELETE scopes
// by `{ id, userId }` so a malicious client that knows someone else's id gets
// a harmless no-op (`count: 0`) instead of a 404 that reveals the id exists.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rows = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, mode: true, title: true, updatedAt: true },
  });

  return NextResponse.json(rows);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return new NextResponse("id required", { status: 400 });
  }

  // deleteMany (not delete) so a non-owner attempt returns count:0 instead
  // of throwing P2025. Messages cascade via the Prisma schema.
  const result = await prisma.conversation.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ deleted: result.count });
}
