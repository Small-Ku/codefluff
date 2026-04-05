# Codefluff

> **A personal fork of [Codebuff](https://codebuff.com)** — the open-source multi-agent AI coding assistant.

Codefluff is a **local BYOK (Bring Your Own Key) variant** of Codebuff. It gives you the same powerful multi-agent coding experience, but with **complete independence** — your API keys, your models, your data. No subscriptions, no middleman, no server dependency for inference.

## Added Features

- **BYOK** — Use your own API keys. No subscription or credits.
- **No server dependency** — All inference is between your machine and the model provider.
- **M:N Model Mapping** — Map any provider/model to any cost mode and operation independently.
- **Direct provider routing** — Calls go straight to Anthropic, OpenAI, Google, or OpenRouter.
- **Privacy** — Prompts and code stay between you and the model provider.
- **No ads, no login** — Completely standalone.
- **Environment variable interpolation** — Reference `${ENV_VAR}` in your config.

## Getting Started

### 1. Install

```bash
npm install -g codefluff
```

### 2. Configure

Create `~/.config/codefluff/config.json`:

```json
{
  "keys": {
    "openrouter": "${OPENROUTER_API_KEY}",
    "anthropic": "${ANTHROPIC_API_KEY}",
    "openai": "${OPENAI_API_KEY}",
    "google": "${GOOGLE_API_KEY}",
    "your-own-provider": {
      "key": "sk-your-own-key",
      "baseURL": "https://the.provider.com/v1",
      "style": "openai"
    }
  },
  "mapping": {
    "normal": {
      "agent": "anthropic/claude-sonnet-4",
      "file-requests": "anthropic/claude-3.5-haiku",
      "check-new-files": "anthropic/claude-sonnet-4"
    },
    "max": {
      "agent": "your-own-provider/your-model-name",
      "file-requests": "anthropic/claude-sonnet-4",
      "check-new-files": "anthropic/claude-sonnet-4"
    },
    "free": {
      "agent": "google/gemini-2.5-flash-lite",
      "file-requests": "google/gemini-2.5-flash-lite",
      "check-new-files": "google/gemini-2.5-flash-lite"
    }
  },
  "defaultMode": "normal"
}
```

Custom provider example:

```json
{
  "keys": {
    "your-own-provider": {
      "key": "sk-your-own-key",
      "baseURL": "https://the.provider.com/v1",
      "style": "openai"
    }
  },
  "mapping": {
    "normal": {
      "agent": "your-own-provider/your-model-name",
      "file-requests": "your-own-provider/your-model-name",
      "check-new-files": "your-own-provider/your-model-name"
    }
  }
}
```

The `style` field specifies the API format — currently supports `openai`.

### 3. Run

```bash
cd my-project
codefluff
```

## Configuration

### Keys

Supported providers:

| Provider     | Key Name     | Example Key Format         |
| ------------ | ------------ | -------------------------- |
| OpenRouter   | `openrouter` | `sk-or-...`                |
| Anthropic    | `anthropic`  | `sk-ant-...`               |
| OpenAI       | `openai`     | `sk-...`                   |
| Google       | `google`     | `AIza...`                  |

Custom providers with their own API endpoint:

```json
{
  "keys": {
    "openrouter": "${OPENROUTER_API_KEY}",
    "your-own-provider": {
      "key": "sk-your-own-key",
      "baseURL": "https://the.provider.com/v1",
      "style": "openai"
    }
  }
}
```

### Mapping

The `mapping` object defines which model to use for each **cost mode** and **operation**:

```json
{
  "mapping": {
    "<costMode>": {
      "agent": "<model>",
      "file-requests": "<model>",
      "check-new-files": "<model>"
    }
  }
}
```

- **Cost modes**: `free`, `normal`, `max`, `experimental`, `ask`
- **Operations**: `agent` (main agent work), `file-requests` (context gathering), `check-new-files` (code review)

Model IDs use OpenRouter format: `provider/model-name` (e.g., `anthropic/claude-sonnet-4`, `google/gemini-2.5-pro`, `openai/gpt-4o`).

### Default Mode

Set `defaultMode` to control which cost mode starts by default:

```json
{
  "defaultMode": "normal"
}
```

## CLI Usage

```bash
codefluff                    # Start with default mode from config
codefluff --mode max         # Start in max mode
codefluff "Fix the bug"      # Run with a prompt
```

## Model Routing

Codefluff routes model calls directly to providers based on the model prefix:

| Prefix                 | Provider          |
| ---------------------- | ----------------- |
| `anthropic/`           | Anthropic API     |
| `openai/`              | OpenAI API        |
| `google/`              | Google Gemini API |
| `openrouter/` or other | OpenRouter API    |

All calls use your configured API keys — no data goes through Codebuff servers.

## Tool Availability

Because codefluff runs standalone without the Codebuff web server, some tools that depend on server-hosted APIs are unavailable:

| Tool | Status | Reason |
|------|--------|--------|
| `web_search` | ❌ Unavailable | Requires Codebuff web server for web search API and credit billing |
| `read_docs` | ❌ Unavailable | Requires Codebuff web server for Context7 docs fetching and credit billing |

> Token counting falls back to local estimation when the web API is unavailable — this is transparent and has no impact on functionality.

All other tools (file read/write, shell execution, agent spawning, etc.) work normally.

## Relationship to Codebuff

Codefluff is a **personal fork** of the [Codebuff](https://codebuff.com) project. It shares the same core architecture and multi-agent framework, but is distributed as a standalone npm package (`codefluff`) with a compile-time flag that:

- Routes all model calls directly to providers using your API keys
- Removes subscription and server-dependent features
- Adds the BYOK configuration system

For the full Codebuff experience (managed credits, Agent Store, chat history sync), see [codebuff.com](https://codebuff.com).

## License

See the Codebuff repository for license information.
