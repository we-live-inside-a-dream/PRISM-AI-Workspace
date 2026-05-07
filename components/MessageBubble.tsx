"use client";

// Renders a single chat turn.
// - User turns are a teal-tinted right-aligned bubble, text only.
// - Assistant turns are a bordered card with full Markdown (GFM + syntax
//   highlighting via rehype-highlight), and every <pre> gets a copy button.
//
// We iterate `message.parts` (v6 shape). Text parts concatenate into one
// Markdown render so a code block split across parts still highlights.

import { memo, useState } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type MessageBubbleProps = {
  message: UIMessage;
  /** Pulse the last assistant bubble while its stream is still arriving. */
  isStreaming?: boolean;
};

function joinText(parts: UIMessage["parts"]): string {
  return parts
    .filter(
      (p): p is Extract<UIMessage["parts"][number], { type: "text" }> =>
        p.type === "text",
    )
    .map((p) => p.text)
    .join("");
}

// Copy-to-clipboard button injected into every <pre>. React-markdown passes
// raw children (the <code> element) so we reach into it to get the text.
function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
          toast.success("Copied!");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Couldn't copy — clipboard permission denied.");
        }
      }}
      className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

// Extract the raw text the <pre>'s <code> child carries. react-markdown
// gives us a React element tree; the text content is the string we want.
function extractText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && node && "props" in node) {
    // @ts-expect-error — react element shape, children is whatever
    return extractText(node.props?.children);
  }
  return "";
}

const markdownComponents: Components = {
  pre: ({ children, ...props }) => (
    <div className="group relative my-3">
      <pre
        {...props}
        className="overflow-x-auto rounded-md border border-border/60 bg-[#0d1117] p-4 text-sm text-[#e6edf3]"
      >
        {children}
      </pre>
      <CopyButton getText={() => extractText(children)} />
    </div>
  ),
  code: ({ className, children, ...props }) => {
    // Inline code only — block code is captured by the <pre> wrapper above
    // and passed through highlight.js class names (hljs language-xxx).
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
        {...props}
      >
        {children}
      </code>
    );
  },
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
};

function MessageBubbleImpl({ message, isStreaming }: MessageBubbleProps) {
  const text = joinText(message.parts);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-primary-foreground whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-card px-4 py-3 text-sm text-card-foreground",
          isStreaming && "animate-pulse-soft",
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={markdownComponents}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
