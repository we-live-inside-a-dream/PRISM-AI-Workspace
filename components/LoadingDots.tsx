// Three bouncing teal dots shown while useChat status === "submitted"
// (i.e. the request is in-flight but the stream hasn't started yet).
// Switches off as soon as the first token arrives.

export function LoadingDots() {
  return (
    <div
      className="flex items-center gap-1 px-1 py-2"
      role="status"
      aria-label="Thinking"
    >
      <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
      <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
      <span className="size-2 animate-bounce rounded-full bg-primary" />
    </div>
  );
}
