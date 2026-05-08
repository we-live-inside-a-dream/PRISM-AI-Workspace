# OpenRouter API Integration

Your PRISM AI Workspace now supports **both Anthropic and OpenRouter** as LLM providers. Switch between them by changing a single environment variable.

## 📋 Quick Setup

### 1. Get Your OpenRouter API Key

- Sign up at [https://openrouter.ai](https://openrouter.ai)
- Generate an API key in your account dashboard
- Copy it to your `.env` file:

```bash
OPENROUTER_API_KEY="sk-or-v1-..."
```

### 2. Switch Providers

In `.env`, set:

```bash
LLM_PROVIDER="openrouter"  # Use OpenRouter
# OR
LLM_PROVIDER="anthropic"   # Use Anthropic (default)
```

That's it! The app will automatically route requests to the configured provider.

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `anthropic` | `"anthropic"` or `"openrouter"` |
| `ANTHROPIC_API_KEY` | — | Your Anthropic API key |
| `OPENROUTER_API_KEY` | — | Your OpenRouter API key |
| `LLM_MODEL_ANTHROPIC` | `claude-sonnet-4-5` | Anthropic model override |
| `LLM_MODEL_OPENROUTER` | `anthropic/claude-3.5-sonnet` | OpenRouter model override |
| `OPENROUTER_REFERER` | `http://localhost:3000` | For OpenRouter usage stats |
| `OPENROUTER_TITLE` | `PRISM AI Workspace` | For OpenRouter usage stats |

## 🎯 Available Models on OpenRouter

OpenRouter acts as a gateway to many LLMs. Some popular options:

- `anthropic/claude-3.5-sonnet` — Claude 3.5 Sonnet (recommended)
- `anthropic/claude-3-opus` — Claude 3 Opus (larger/slower)
- `openai/gpt-4o` — GPT-4o
- `openai/gpt-4-turbo` — GPT-4 Turbo
- `google/gemini-2.0-flash` — Gemini 2.0 Flash
- `meta-llama/llama-3.3-70b` — Llama 3.3 70B

Full list: [https://openrouter.ai/docs/models](https://openrouter.ai/docs/models)

## 🚀 How It Works

The app uses a **provider abstraction layer** (`lib/llm.ts`) that:

1. Checks `LLM_PROVIDER` environment variable
2. Reads the appropriate API key (`ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`)
3. Initializes the model with `getModel()`
4. Returns the model to `app/api/chat/route.ts`

**Key files:**
- `lib/llm.ts` — Provider abstraction (supports Anthropic, OpenRouter)
- `app/api/chat/route.ts` — Main chat endpoint (now provider-agnostic)
- `.env` — Configuration (which provider, which keys, which models)

## 💡 Example: Using a Different OpenRouter Model

To switch from Claude 3.5 Sonnet to GPT-4o:

```bash
# .env
LLM_PROVIDER="openrouter"
OPENROUTER_API_KEY="sk-or-v1-..."
LLM_MODEL_OPENROUTER="openai/gpt-4o"
```

Restart your dev server, and all chat requests will use GPT-4o.

## 🐛 Debugging

Check which provider is active in your server logs:

```
[chat] Using provider: openrouter, model: anthropic/claude-3.5-sonnet
```

Or test programmatically:

```typescript
import { getProviderInfo } from "@/lib/llm";
console.log(getProviderInfo());
// Output: { provider: "openrouter", modelId: "anthropic/claude-3.5-sonnet" }
```

## ✅ What's Included

- ✅ `@ai-sdk/openai` installed (OpenRouter is OpenAI-compatible)
- ✅ Provider abstraction in `lib/llm.ts`
- ✅ Environment variable configuration
- ✅ Type-safe model selection
- ✅ Logging for debugging
- ✅ Build verification (TypeScript + Next.js)

## 📖 Further Reading

- [Vercel AI SDK Documentation](https://sdk.vercel.ai)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Anthropic API Docs](https://docs.anthropic.com)
