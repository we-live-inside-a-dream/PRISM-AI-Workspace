// Prisma 7 singleton with the better-sqlite3 driver adapter.
// Prisma 7 requires a driver adapter (no more bundled Query Engine for local DBs);
// for SQLite we use @prisma/adapter-better-sqlite3.
//
// A global cache prevents Next.js dev hot-reload from spawning a new
// PrismaClient per request (which would exhaust SQLite's connection pool).
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// DATABASE_URL is `file:./dev.db` (relative to prisma/ per Prisma convention).
// better-sqlite3 wants a plain filesystem path, so strip the `file:` prefix
// and resolve it relative to the project root.
function resolveSqlitePath(): string {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  return url.replace(/^file:/, "");
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${resolveSqlitePath()}` }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
