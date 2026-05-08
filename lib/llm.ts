// LLM provider abstraction layer supporting multiple AI backends.
// Currently supports: Anthropic (Claude), OpenRouter (via OpenAI-compatible API)
//
// Determine active provider via LLM_PROVIDER env var (default: "anthropic")
// Each provider reads its API key from its standard env var:
//   - "anthropic" → ANTHROPIC_API_KEY
//   - "openrouter" → OPENROUTER_API_KEY

import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";

export type LLMProvider = "anthropic" | "openrouter";

/**
 * Get the active LLM provider from environment.
 * Falls back to "anthropic" if not set.
 */
export function getActiveProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (provider === "anthropic" || provider === "openrouter") {
    return provider;
  }
  console.warn(
    `Unknown LLM_PROVIDER: ${provider}, falling back to anthropic`
  );
  return "anthropic";
}

/**
 * Get the model ID for the active provider.
 * Falls back to provider-appropriate defaults if not set.
 *
 * Env vars:
 *   LLM_MODEL_ANTHROPIC    - Anthropic model (default: "claude-sonnet-4-5")
 *   LLM_MODEL_OPENROUTER   - OpenRouter model (default: "anthropic/claude-3.5-sonnet")
 */
export function getModelId(provider: LLMProvider): string {
  if (provider === "anthropic") {
    return process.env.LLM_MODEL_ANTHROPIC || "claude-sonnet-4-5";
  }
  if (provider === "openrouter") {
    return (
      process.env.LLM_MODEL_OPENROUTER || "baidu/cobuddy:free"
    );
  }
  return "claude-sonnet-4-5";
}

/**
 * Initialize and return the model for the active provider.
 * Reads API keys from standard env vars (ANTHROPIC_API_KEY, OPENROUTER_API_KEY).
 */
export function getModel(): LanguageModelV3 {
  const provider = getActiveProvider();
  const modelId = getModelId(provider);

  if (provider === "anthropic") {
    return anthropic(modelId);
  }

  if (provider === "openrouter") {
    // OpenRouter uses OpenAI-compatible API
    // Docs: https://openrouter.ai/docs
    //
    // Custom fetch wrapper:
    // 1. Injects OpenRouter-specific `transforms` body param — "middle-out"
    //    handles message format for models that don't support system prompts
    //    (e.g. Gemma, some Llama variants) by inlining them into the first
    //    user message automatically.
    // 2. Logs request + non-2xx response bodies so failures are visible
    //    instead of silently yielding empty streams.
    const openrouterFetch: typeof fetch = async (url, init) => {
      // Inject OpenRouter transforms into the request body
      if (init?.body && typeof init.body === "string") {
        try {
          const bodyObj = JSON.parse(init.body);
          // "middle-out" is OpenRouter's compatibility transform — it rewrites
          // messages for models that don't natively support system prompts
          // and handles context-length trimming.
          bodyObj.transforms = bodyObj.transforms ?? ["middle-out"];
          init = { ...init, body: JSON.stringify(bodyObj) };
        } catch {
          // body wasn't JSON — leave it alone
        }
      }

      const response = await fetch(url, init);

      // If OpenRouter returned an error, log the body so we can actually
      // see why. Non-streaming errors return JSON; streaming errors may
      // come as SSE events — this catches the non-streaming case.
      if (!response.ok) {
        const cloned = response.clone();
        try {
          const errorText = await cloned.text();
          console.error(
            `[openrouter] ${response.status} ${response.statusText}: ${errorText}`
          );
        } catch {
          console.error(
            `[openrouter] ${response.status} ${response.statusText}`
          );
        }
      }

      return response;
    };

    const openrouterClient = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      name: "openrouter",
      headers: {
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000",
        "X-Title": process.env.OPENROUTER_TITLE || "PRISM AI Workspace",
      },
      fetch: openrouterFetch,
    });
    return openrouterClient(modelId);
  }

  // Fallback (should never reach here)
  return anthropic(modelId);
}

/**
 * Get provider metadata for debugging/UI.
 */
export function getProviderInfo() {
  const provider = getActiveProvider();
  const modelId = getModelId(provider);
  return { provider, modelId };
}
