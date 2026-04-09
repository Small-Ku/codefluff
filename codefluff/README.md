# Codefluff

> **A personal fork of [Codebuff](https://codebuff.com)** — the open-source multi-agent AI coding assistant.

Codefluff is a **local BYOK (Bring Your Own Key) variant** of Codebuff. It gives you the same powerful multi-agent coding experience, but with **complete independence** — your API keys, your models, your data. No subscriptions, no middleman, no server dependency for inference.

## Added Features

- **BYOK** — Use your own API keys. No subscription or credits.
- **No server dependency** — All inference is between your machine and the model provider.
- **M:N Model Mapping** — Map any provider/model to any cost mode and agent independently.
- **Direct provider routing** — Calls go straight to Anthropic, OpenAI, Google, OpenRouter, or any OpenAI-compatible provider.
- **Extended provider support** — Native support for DeepSeek, XAI (Grok), Nvidia NIM, and custom OpenAI-compatible APIs.
- **Model listing** — List available models from all configured providers via SDK.
- **Per-model configuration** — Configure extra request parameters (e.g., `chat_template_kwargs` for Nvidia NIM) per specific model.
- **Custom headers** — Add custom HTTP headers for providers that need them.
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
      "base": "anthropic/claude-sonnet-4",
      "file-picker": "google/gemini-2.5-flash-lite",
      "editor": "anthropic/claude-opus-4"
    },
    "max": {
      "base": "anthropic/claude-opus-4",
      "editor": "openai/gpt-5"
    },
    "free": {
      "base": "google/gemini-2.5-flash-lite"
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
      "base": "your-own-provider/your-model-name"
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

| Provider | Key Name | Example Key Format | API Style |
|----------|----------|-------------------|-----------|
| OpenRouter | `openrouter` | `sk-or-...` | OpenAI-compatible |
| Anthropic | `anthropic` | `sk-ant-...` | Native Anthropic |
| OpenAI | `openai` | `sk-...` | Native OpenAI |
| Google | `google` | `AIza...` | Native Gemini |
| DeepSeek | `deepseek` | `sk-...` | OpenAI-compatible |
| XAI (Grok) | `xai` | `xai-...` | OpenAI-compatible |
| Nvidia NIM | `nvidia-nim` | `nvapi-...` | OpenAI-compatible |
| Custom | any name | varies | OpenAI-compatible |

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

The `mapping` object defines which model to use for each **cost mode**. Within each mode, you can configure:

- **`base`**: The default model for all agents not explicitly listed
- **Agent IDs**: Specific models for individual agents (optional, overrides `base`)

```json
{
  "mapping": {
    "<costMode>": {
      "base": "<default-model>",
      "<agent-id>": "<specific-model>",
      "<another-agent>": "<specific-model>"
    }
  }
}
```

- **Cost modes**: `free`, `normal`, `max` (primary modes)
- **`base`**: Required. The fallback model for any agent not explicitly configured
- **Agent IDs**: Optional. Specific models for individual agents (see Available Agents below)

#### `experimental` and `ask` (config-only)

There are two kinds of "modes" in this repo:

- **UI modes** (what the TUI exposes): `default`, `free`, `max`, `plan`
- **Cost modes** (what you configure in `mapping`): `free`, `normal`, `max`, `experimental`, `ask`

The config schema recognizes `experimental` and `ask`, but they are **not exposed as distinct user-facing modes** in the current Codefluff UI.

- The TUI mode picker only offers the primary cost modes: `free`, `normal`, `max` (plus `plan`, which is a UI-only planning mode).
- `--mode experimental` and `--mode ask` currently behave the same as `--mode normal` (DEFAULT UI mode).
- These two cost modes are effectively **configuration targets only** unless you modify the CLI/UI to explicitly set `costMode` to `experimental` or `ask`.

For most users, configuring **only** `free`, `normal`, and `max` is the right setup.

Model IDs use OpenRouter format: `provider/model-name` (e.g., `anthropic/claude-sonnet-4`, `google/gemini-2.5-pro`, `openai/gpt-4o`).

**Example with per-agent configuration:**

```json
{
  "mapping": {
    "normal": {
      "base": "anthropic/claude-sonnet-4",
      "file-picker": "google/gemini-2.5-flash-lite",
      "editor": "anthropic/claude-opus-4",
      "thinker": "anthropic/claude-opus-4",
      "code-reviewer": "google/gemini-2.5-pro"
    }
  }
}
```

In this example:
- Most agents use `claude-sonnet-4` (the `base`)
- `file-picker` uses the faster, cheaper `gemini-2.5-flash-lite`
- `editor` and `thinker` use the more capable `claude-opus-4`
- `code-reviewer` uses `gemini-2.5-pro`

#### Available Agents

These are the agent IDs you can use in your mapping configuration:

| Agent ID | Description |
|----------|-------------|
| **File Operations** ||
| `file-picker` | Selects relevant files from the codebase |
| `file-picker-max` | Enhanced file picker (MAX mode only) |
| `file-lister` | Lists files in directories |
| `code-searcher` | Searches code using patterns |
| `directory-lister` | Lists directory contents |
| `glob-matcher` | Finds files matching glob patterns |
| **Research** ||
| `researcher-web` | Web search and research |
| `researcher-docs` | Documentation lookup |
| **Editing** ||
| `editor` | Code editing and file modifications |
| `editor-multi-prompt` | Multi-prompt editing (MAX mode only) |
| `editor-lite` | Lightweight editor |
| **Review** ||
| `code-reviewer` | Code review and analysis |
| `code-reviewer-lite` | Lightweight code review (FREE mode only) |
| `code-reviewer-multi-prompt` | Multi-prompt review (MAX mode only) |
| **Thinking** ||
| `thinker` | Problem solving and analysis |
| `thinker-gpt` | Alternative thinker using GPT models |
| `thinker-best-of-n-opus` | Multi-sample thinking (MAX mode only) |
| **Tools** ||
| `basher` | Terminal command execution |
| `pwsher` | PowerShell command execution |
| `tmux-cli` | Terminal multiplexer control |
| `browser-use` | Browser automation |
| **Advanced** ||
| `opus-agent` | Claude Opus for complex tasks |
| `gpt-5-agent` | GPT-5 for complex tasks |
| `context-pruner` | Manages conversation context |

**Note:** Some agents are only available in specific modes (e.g., `file-picker-max` only in MAX mode).

### Default Mode

Set `defaultMode` to control which cost mode starts by default:

```json
{
  "defaultMode": "normal"
}
```

### Search Providers

Codefluff supports pluggable web search providers with automatic fallback. Add `searchProviders` to your config:

```json
{
  "searchProviders": {
    "linkup": "${LINKUP_API_KEY}",
    "langsearch": "${LANGSEARCH_API_KEY}",
    "ollama": "${OLLAMA_API_KEY}",
    "searxng": "https://searx.example.org",
    "searx-space": "enabled"
  }
}
```
Supported providers:

| Provider | Value | Description |
|----------|-------|-------------|
| `linkup` | API key | [Linkup](https://linkup.so) — AI-powered search |
| `langsearch` | API key | [LangSearch](https://langsearch.com) — LLM-optimized web search |
| `ollama` | API key | [Ollama Web Search](https://ollama.com) — Ollama's cloud search API |
| `searxng` | Instance URL | [SearXNG](https://searx.space) — Specific SearXNG instance URL |
| `searx-space` | Any value (presence enables it) | Auto-discovery from searx.space — fetches healthy instances, shuffles, and tries up to 15 with fallback |

Providers are tried in the order they appear above (known providers first, then any custom ones). The first successful result is returned — if one provider fails, the next is automatically tried.

## CLI Usage

```bash
codefluff                    # Start with default mode from config
codefluff --mode max         # Start in max mode
codefluff "Fix the bug"      # Run with a prompt
```

## Model Routing

Codefluff routes model calls directly to providers based on the model prefix:

| Prefix | Provider | Base URL (default) |
|--------|----------|-------------------|
| `anthropic/` | Anthropic API | `https://api.anthropic.com/v1` |
| `openai/` | OpenAI API | `https://api.openai.com/v1` |
| `google/` | Google Gemini API | `https://generativelanguage.googleapis.com/v1beta` |
| `openrouter/` | OpenRouter API | `https://openrouter.ai/api/v1` |
| `deepseek/` | DeepSeek API | `https://api.deepseek.com/v1` |
| `xai/` | XAI (Grok) API | `https://api.x.ai/v1` |
| `nvidia-nim/` | Nvidia NIM API | `https://integrate.api.nvidia.com/v1` |
| `openrouter/` | OpenRouter API | `https://openrouter.ai/api/v1` |
| `new-api/` | Custom OpenAI-compatible | Configurable via `baseURL` |

All calls use your configured API keys — no data goes through Codebuff servers.

### Advanced Configuration

#### Provider Options

For OpenAI-compatible providers, you can specify additional options:

```json
{
  "keys": {
    "nvidia-nim": {
      "key": "${NVIDIA_API_KEY}",
      "baseURL": "https://integrate.api.nvidia.com/v1",
      "style": "openai",
      "headers": {
        "X-Custom-Header": "value"
      }
    }
  }
}
```

| Option | Description |
|--------|-------------|
| `key` | API key (required) |
| `baseURL` | Custom API endpoint |
| `style` | API style: `"openai"`, `"anthropic"`, or `"google"` |
| `headers` | Custom HTTP headers |

#### Per-Model Configuration

Configure specific parameters for individual models using the `models` section:

```json
{
  "models": {
    "nvidia-nim/moonshotai/kimi-k2.5": {
      "extraBody": {
        "chat_template_kwargs": {
          "thinking": true
        }
      }
    },
    "deepseek/deepseek-reasoner": {
      "extraBody": {
        "enable_thinking": true
      }
    }
  }
}
```

Each model can have its own `extraBody` configuration for provider-specific parameters.

**Note on Environment Variable Interpolation:**
- String values in `models` (including nested values in `extraBody`) support `${ENV_VAR}` interpolation
- Numeric fields like `max_tokens` must be specified as numeric literals, not env var references
- Example: `"custom_param": "${CUSTOM_VALUE}"` works, but `max_tokens: "${MAX_TOKENS}"` will fail validation

### Model Listing

List available models from configured providers using the SDK:

```typescript
import { listModelsForProvider, listAllModels, formatModelList } from '@codebuff/sdk'

// List from a specific provider
const nvidiaModels = await listModelsForProvider('nvidia-nim')

// List from all configured providers
const allModels = await listAllModels()
console.log(formatModelList(allModels))
```

## Tool Availability

Because codefluff runs standalone without the Codebuff web server, some tools that depend on server-hosted APIs are unavailable:

| Tool | Status | Notes |
|------|--------|-------|
| `web_search` | ✅ Available | Configure via `searchProviders` in config (see below) |
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
