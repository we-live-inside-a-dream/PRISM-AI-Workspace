// Helpers for converting DB rows ⇄ AI SDK UIMessage shape.
//
// Why this exists: AI SDK v6 UIMessages use a `parts[]` array of typed parts
// (text, reasoning, tool calls, …). We persist two columns on the Message row:
//   - `parts`    — the full JSON array (source of truth going forward)
//   - `content`  — a derived text-only string (keeps the DB queryable and
//                  serves as a fallback for any legacy rows that predate parts)
//
// This module is imported from server components (app/chat/page.tsx) and from
// the chat route handler. Keep it dependency-free beyond `ai`'s types.

import type { UIMessage } from "ai";

/** Narrow DB row shape we care about — avoids dragging Prisma types in here. */
export type MessageRow = {
  id: string;
  role: string;
  content: string;
  parts: unknown; // stored as JSON; may be null on legacy rows
  createdAt: Date;
};

/**
 * Convert a Message row into a UIMessage the client can render.
 *
 * If `parts` is missing (legacy data, or a row written before v6), fall back to
 * a single synthetic text part derived from `content`. This keeps rehydration
 * working across schema generations without a data migration.
 */
export function dbRowToUIMessage(row: MessageRow): UIMessage {
  const parts =
    Array.isArray(row.parts) && row.parts.length > 0
      ? (row.parts as UIMessage["parts"])
      : ([{ type: "text", text: row.content ?? "" }] as UIMessage["parts"]);

  return {
    id: row.id,
    role: row.role as UIMessage["role"],
    parts,
  };
}

/**
 * Derive a plain-text `content` string from a UIMessage's parts array.
 *
 * We only flatten `type === "text"` parts — tool calls, reasoning, and files are
 * kept inside `parts` (the JSON column) but intentionally omitted here so the
 * `content` column stays human-readable and searchable.
 */
export function textFromParts(parts: UIMessage["parts"] | undefined): string {
  if (!parts) return "";
  return parts
    .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> =>
      p.type === "text",
    )
    .map((p) => p.text)
    .join("");
}
