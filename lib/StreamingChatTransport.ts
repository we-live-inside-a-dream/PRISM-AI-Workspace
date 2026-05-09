"use client";

import {
  parseJsonEventStream,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
  uiMessageChunkSchema,
} from "ai";
import type { ParseResult } from "@ai-sdk/provider-utils";

type ChunkLogEntry = {
  type: string;
  id?: string;
  messageId?: string;
  delta?: string;
  ms: number;
};

export class StreamingChatTransport implements ChatTransport<UIMessage> {
  constructor(options: {
    api?: string;
    body?: () => { mode: string; conversationId?: string };
    fetch?: typeof fetch;
    onConversationId?: (id: string) => void;
  }) {
    this.api = options.api ?? "/api/chat";
    this.bodyFn = options.body;
    this.customFetch = options.fetch;
    this.onConversationId = options.onConversationId;
  }

  private api: string;
  private bodyFn?: () => { mode: string; conversationId?: string };
  private customFetch?: typeof fetch;
  private onConversationId?: (id: string) => void;

  async sendMessages(options: {
    trigger: "submit-message" | "regenerate-message";
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  } & {
    headers?: Record<string, string> | Headers;
    body?: object;
    metadata?: unknown;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const fetchFn = this.customFetch ?? globalThis.fetch;

    let resolvedBody: Record<string, unknown> = {};
    if (this.bodyFn) {
      resolvedBody = this.bodyFn() as Record<string, unknown>;
    }

    const requestBody = {
      ...resolvedBody,
      ...((options.body as Record<string, unknown>) ?? {}),
      messages: options.messages,
      id: options.chatId,
      trigger: options.trigger,
      messageId: options.messageId,
    };

    const startTime = Date.now();
    const chunkLog: ChunkLogEntry[] = [];
    let chunkCount = 0;
    let parseErrorCount = 0;
    let firstChunkMs = 0;

    const res = await fetchFn(this.api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      },
      body: JSON.stringify(requestBody),
      credentials: "same-origin",
      signal: options.abortSignal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error("Response body is empty");
    }

    const newId = res.headers.get("x-conversation-id");
    if (newId && this.onConversationId) {
      this.onConversationId(newId);
    }

    const rawStream = parseJsonEventStream({
      stream: res.body,
      schema: uiMessageChunkSchema,
    });

    const self = this;
    const MAX_VERBOSE = 10;

    return rawStream.pipeThrough(
      new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
        async transform(parseResult, controller) {
          chunkCount++;
          const nowMs = Date.now() - startTime;
          if (chunkCount === 1) {
            firstChunkMs = nowMs;
          }

          if (!parseResult.success) {
            parseErrorCount++;
            const errMsg = parseResult.error instanceof Error
              ? parseResult.error.message
              : String(parseResult.error);
            if (parseErrorCount <= 5) {
              console.error(`[chat] transport: chunk[${chunkCount}] schema error: ${errMsg}`);
            }
            return;
          }

          const value = parseResult.value;
          const entry: ChunkLogEntry = { type: value.type, ms: nowMs };

          if (chunkCount <= MAX_VERBOSE) {
            let logMsg = `[chat] transport: chunk[${chunkCount}] ${value.type}`;
            if ("id" in value && value.id) {
              entry.id = String(value.id);
              logMsg += ` id=${value.id}`;
            }
            if ("messageId" in value && value.messageId) {
              entry.messageId = String(value.messageId);
              logMsg += ` messageId=${value.messageId}`;
            }
            if ("delta" in value && typeof value === "object" && value !== null && "delta" in value) {
              const delta = String((value as Record<string, unknown>).delta ?? "").slice(0, 20);
              entry.delta = delta;
              logMsg += ` delta="${delta}"`;
            }
            console.log(logMsg);
          } else if (chunkCount === MAX_VERBOSE + 1) {
            console.log(`[chat] transport: ... (${MAX_VERBOSE} chunks logged, truncating verbose output)`);
          }

          chunkLog.push(entry);
          controller.enqueue(value);
        },

        async flush(controller) {
          const totalMs = Date.now() - startTime;
          console.log(
            `[chat] transport: stream complete — ${chunkCount} chunks parsed, ${parseErrorCount} schema errors, ${firstChunkMs}ms to first chunk, ${totalMs}ms total`,
          );

          const types = chunkLog.reduce(
            (acc, c) => {
              acc[c.type] = (acc[c.type] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
          console.log(`[chat] transport: chunk types received:`, types);
          console.log(`[chat] transport: first chunk:`, chunkLog[0]);
          console.log(`[chat] transport: last chunk:`, chunkLog[chunkLog.length - 1]);

          controller.terminate();
        },
      }),
    );
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
