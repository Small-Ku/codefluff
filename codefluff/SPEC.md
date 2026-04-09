# Codefluff Spec

> **Codefluff is a personal fork of [Codebuff](https://codebuff.com).**

Codefluff is a local BYOK (Bring Your Own Key) variant of the Codebuff CLI, distributed as a separate npm package (`codefluff`). It reuses the entire `cli/` package but builds with a compile-time flag that routes all model calls directly to providers using user-configured API keys, with a configurable M:N mapping from providers/models to cost modes and agents.

---

## 1. Build-Time Flag

### Environment Variable

- **`CODEFLUFF_MODE=true`** — set during the build to produce a Codefluff binary.
- Injected via `--define process.env.CODEFLUFF_MODE="true"` in `bun build`, following the same pattern as `FREEBUFF_MODE`.

### Runtime Constant

```ts
export const IS_CODEFLUFF = getCliEnv().CODEFLUFF_MODE === 'true'
```

This enables dead-code elimination in production builds.

---

## 2. Configuration

### Config File: `~/.config/codefluff/config.json`

#### Basic Configuration

```json
{
  "keys": {
    "openrouter": "${OPENROUTER_API_KEY}",
    "anthropic": "${ANTHROPIC_API_KEY}",
    "openai": "${OPENAI_API_KEY}",
    "google": "${GOOGLE_API_KEY}"
  },
  "mapping": {
    "normal": {
      "base": "anthropic/claude-sonnet-4",
      "file-picker": "google/gemini-2.5-flash-lite"
    }
  },
  "defaultMode": "normal"
}
```

#### Advanced Configuration with New Providers

```json
{
  "keys": {
    "openrouter": "${OPENROUTER_API_KEY}",
    "anthropic": "${ANTHROPIC_API_KEY}",
    "nvidia-nim": {
      "key": "${NVIDIA_API_KEY}",
      "baseURL": "https://integrate.api.nvidia.com/v1",
      "style": "openai"
    },
    "deepseek": "${DEEPSEEK_API_KEY}",
    "xai": "${XAI_API_KEY}",
    "custom-provider": {
      "key": "sk-xxxxx",
      "baseURL": "https://api.custom-provider.com/v1",
      "style": "openai",
      "headers": {
        "X-Custom-Header": "value"
      }
    }
  },
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
  },
  "mapping": {
    "free": {
      "base": "google/gemini-2.5-flash-lite"
    },
    "normal": {
      "base": "anthropic/claude-sonnet-4",
      "file-picker": "google/gemini-2.5-flash-lite",
      "editor": "anthropic/claude-opus-4"
    },
    "max": {
      "base": "nvidia-nim/moonshotai/kimi-k2.5",
      "file-picker": "google/gemini-2.5-flash-lite",
      "editor": "anthropic/claude-opus-4",
      "thinker": "anthropic/claude-opus-4"
    },
    "experimental": {
      "base": "google/gemini-2.5-pro",
      "editor": "xai/grok-4"
    },
    "ask": {
      "base": "google/gemini-2.5-pro"
    }
  },
  "defaultMode": "normal"
}
```

### Schema Rules

- `keys`: Provider → API key mapping. Supports `${ENV_VAR}` interpolation.
  - Simple string: `"provider": "api-key"`
  - Object with options: `"provider": { "key": "api-key", "baseURL": "...", "style": "openai", "headers": {...} }`
- `models`: Per-model configuration (key format: `"provider/model-id"`).
  - `extraBody`: Extra request body parameters for specific models (e.g., Nvidia NIM's `chat_template_kwargs`).
  - `max_tokens`: Maximum tokens to generate (must be a numeric literal, not an env var).
- `mapping`: CostMode → Agent → Model mapping. All 5 cost modes supported.
  - `base`: Required. The default model for agents not explicitly listed.
  - Additional keys: Agent IDs with their specific models (overrides `base`).
- `defaultMode`: One of `free`, `normal`, `max`, `experimental`, `ask`.
  - Note: if you set `defaultMode` to `experimental` or `ask` today, it currently behaves the same as `normal` (DEFAULT UI mode).

**Important:** While 5 cost modes are recognized by the schema (`free`, `normal`, `max`, `experimental`, `ask`), only `free`, `normal`, and `max` are exposed as user-facing CLI/GUI modes today.

- `experimental` and `ask` currently exist mainly as **configuration targets**.
- Even if you pass `--mode experimental` or `--mode ask`, they currently behave the same as `--mode normal` (DEFAULT UI mode).
- They only become active if some code path explicitly sets `costMode` to `experimental` or `ask`.

For most users, configuring `free`, `normal`, and `max` is sufficient.

- `searchProviders`: Search provider → API key or URL mapping. Supports `${ENV_VAR}` interpolation.
- Config is empty by default — user must fill in everything.
- Missing keys produce clear error messages on first use.

#### Environment Variable Interpolation

Environment variables can be interpolated using `${ENV_VAR}` syntax in:
- `keys` (both string and object values)
- `models` (string values within the structure)
- `searchProviders` (string values)

**Important:** Environment variable interpolation is **string substitution only**. Fields that expect numeric values (like `max_tokens`) must be specified as numeric literals, not env var references. For example:

```json
{
  "models": {
    "nvidia-nim/moonshotai/kimi-k2.5": {
      "max_tokens": 16384,
      "extraBody": {
        "chat_template_kwargs": {
          "thinking": true,
          "custom_param": "${CUSTOM_VALUE}"
        }
      }
    }
  }
}
```

- ✅ `max_tokens: 16384` — numeric literal (correct)
- ❌ `max_tokens: "${MAX_TOKENS}"` — string after interpolation (will fail validation)

#### Model Resolution

When resolving a model for an agent:

1. Check if the agent ID has a specific mapping in the current mode: `mapping[mode][agentId]`
2. If not found, fall back to: `mapping[mode].base`
3. If `base` is not defined, throw an error

Example resolution for `editor` agent in `normal` mode:
```json
{
  "mapping": {
    "normal": {
      "base": "anthropic/claude-sonnet-4",
      "editor": "anthropic/claude-opus-4"
    }
  }
}
```
- `editor` agent → uses `claude-opus-4` (explicit mapping)
- `file-picker` agent → uses `claude-sonnet-4` (falls back to `base`)

### Provider Key Options

When using object format for provider keys:

| Option | Type | Description |
|--------|------|-------------|
| `key` | string | **Required.** API key for the provider. |
| `baseURL` | string | Custom base URL for the provider API. |
| `style` | string | Provider style: `"openai"`, `"anthropic"`, or `"google"`. Defaults to `"openai"`. |
| `headers` | object | Custom HTTP headers to send with each request. |

### Per-Model Configuration

The `models` section allows fine-grained control over individual models:

```json
{
  "models": {
    "nvidia-nim/moonshotai/kimi-k2.5": {
      "max_tokens": 16384,
      "extraBody": {
        "chat_template_kwargs": {
          "thinking": true
        }
      }
    },
    "deepseek/deepseek-reasoner": {
      "max_tokens": 8192,
      "extraBody": {
        "enable_thinking": true
      }
    }
  }
}
```

Each model can have:

| Option | Type | Description |
|--------|------|-------------|
| `max_tokens` | number | Maximum number of tokens to generate. Use this to prevent truncation on providers with low defaults (e.g., Nvidia NIM). |
| `extraBody` | object | Extra request body parameters for provider-specific settings. |

**Note:** Some providers (like Nvidia NIM) have very low default `max_tokens` (256-512), which causes responses to be truncated mid-sentence. Always set `max_tokens` for these providers.

### Search Providers

Config key: `searchProviders`

```json
{
  "searchProviders": {
    "linkup": "${LINKUP_API_KEY}",
    "langsearch": "${LANGSEARCH_API_KEY}",
    "ollama": "${OLLAMA_API_KEY}",
    "searxng": "https://searx.example.org"
  }
}
```

| Provider | Value Type | API |
|----------|-----------|-----|
| `linkup` | API key | `POST https://api.linkup.so/v1/search` |
| `langsearch` | API key | `POST https://api.langsearch.com/v1/web-search` |
| `ollama` | API key | `POST https://ollama.com/api/web_search` |
| `searxng` | Instance URL | `GET {instanceUrl}/search?q=query&format=json` |
| `searx-space` | Any value (presence enables it) | Fetches instances from `https://searx.space/data/instances.json`, filters healthy ones (HTTP 200, >80% search success, valid SearXNG), Fisher-Yates shuffles, tries up to 15 with 15s timeout each. |

Fallback behavior:
- Providers are tried in order: linkup → langsearch → ollama → searxng → searx-space → unknown custom providers
- First successful result is returned immediately
- If a provider fails, the next one in line is tried automatically
- If all providers fail, an aggregated error message is returned listing each provider's failure reason

---

## 3. Model Routing

When `IS_CODEFLUFF`:

1. Model resolution reads from user config's `mapping[mode]`:
   - Check for agent-specific mapping: `mapping[mode][agentId]`
   - Fall back to: `mapping[mode].base`
2. All model calls go directly to providers using configured BYOK keys
3. No Codebuff backend involvement for inference
4. Each provider (OpenRouter, Anthropic, OpenAI, Google) gets its own direct model creation

### Provider Routing

| Prefix | Provider | Notes |
|--------|----------|-------|
| `anthropic/` | Anthropic API | Claude models. Native SDK. |
| `openai/` | OpenAI API | GPT models. Native SDK. |
| `google/` | Google Gemini API | Gemini models. Native SDK. |
| `openrouter/` | OpenRouter | Unified API for multiple providers. |
| `deepseek/` | DeepSeek API | OpenAI-compatible. Base URL: `https://api.deepseek.com/v1` |
| `xai/` or `grok/` | XAI API | Grok models. OpenAI-compatible. Base URL: `https://api.x.ai/v1` |
| `nvidia-nim/` | Nvidia NIM | OpenAI-compatible. Base URL: `https://integrate.api.nvidia.com/v1` |
| `openrouter/` | OpenRouter | Unified API. Base URL: `https://openrouter.ai/api/v1` |
| `new-api/` | New-API compatible | Generic OpenAI-compatible provider. Requires custom `baseURL`. |

All OpenAI-compatible providers support custom `baseURL` and `headers` configuration.

---

## 3.5 Model Listing

Codefluff supports listing available models from configured providers via the SDK:

```typescript
import { listModelsForProvider, listAllModels, formatModelList } from '@codebuff/sdk'

// List models from a specific provider
const result = await listModelsForProvider('nvidia-nim')
console.log(result.models)

// List all configured providers
const allModels = await listAllModels()
console.log(formatModelList(allModels))
```

Supported providers for model listing:
- OpenAI (`/v1/models` endpoint)
- Google Gemini (`/v1beta/models` endpoint)
- DeepSeek (`/v1/models` endpoint)
- XAI (`/v1/models` endpoint)
- Nvidia NIM (`/v1/models` endpoint)
- OpenRouter (`/api/v1/models` endpoint)
- New-API compatible providers (`/v1/models` endpoint)
- Anthropic (returns known models list)

---

## 4. Branding Changes

| Area                  | Codebuff               | Codefluff                 |
| --------------------- | ---------------------- | ------------------------- |
| Terminal title prefix | `Codebuff: `           | `Codefluff: `             |
| CLI commander name    | `codebuff`             | `codefluff`               |
| npm package           | `codebuff`             | `codefluff`               |
| Binary name           | `codebuff`             | `codefluff`               |
| ASCII logo            | `CODEBUFF`             | `CODEFLUFF`               |
| Description           | "AI coding agent"      | "Local BYOK coding agent" |
| App header            | "Codebuff will run..." | "Codefluff will run..."   |

---

## 5. Mode Support

Codefluff recognizes 5 cost modes in configuration:

- `free`, `normal`, `max`, `experimental`, `ask`

In the current UI/CLI mode picker, only `free`, `normal`, and `max` are exposed as distinct user-facing modes.

- `experimental` and `ask` are currently **config-only targets** (accepted by schema).
- Passing `--mode experimental` / `--mode ask` currently falls back to the normal/default UI flow.

So, for most users, `free`, `normal`, and `max` are the only ones you need to set up.

(If you want to actually use `experimental` or `ask`, you will need to change the CLI/UI to set `costMode` to those values.)

---

## 6. Server Dependencies Stripped

- No login required (unless user opts into optional chat history sync)
- No credits/subscription UI
- No ads
- No `/feedback`, `/login`, `/logout`, `/connect:claude`, `/connect:chatgpt`
- No `/subscribe`, `/usage`, `/credits`, `/buy-credits`
- No `/ads:*`, `/refer-friends`, `/publish`, `/agent:gpt-5`

### Intentionally Kept (Diverges from Original Strip List)

| Command | Rationale |
|---------|-----------|
| `/history` | Local-only history browsing — no server dependency |
| `/review` | Builds review prompts from local workspace — no server dependency |

---

## 7. Commands Kept

| Command                                   | Notes                                 |
| ----------------------------------------- | ------------------------------------- |
| `/help`                                   | Simplified, no server-dependent items |
| `/new` (+ `/clear`, `/reset`, `/n`, `/c`) | Clear conversation                    |
| `/bash` (+ `/!`)                          | Bash mode                             |
| `/theme:toggle`                           | Light/dark toggle                     |
| `/exit` (+ `/quit`, `/q`)                 | Quit                                  |
| `/mode:*`                                 | ALL mode commands available           |
| `/skill:*`                                | Skill commands                        |
| `/history`                                | Local-only history browsing           |
| `/review`                                 | Local workspace review                |

---

## 8. Build & Release

### Directory Structure

```
codefluff/
├── SPEC.md
├── README.md
├── package.json
└── cli/
    ├── build.ts
    └── release/
        ├── package.json
        ├── index.js
        └── postinstall.js
```

### Build Script

```bash
CODEFLUFF_MODE=true bun cli/scripts/build-binary.ts codefluff <version>
```

---

## 9. Changes to `cli/scripts/build-binary.ts`

Add `CODEFLUFF_MODE` to the define flags:

```ts
['process.env.CODEFLUFF_MODE', `"${process.env.CODEFLUFF_MODE ?? 'false'}"`],
```

---

## 10. Implementation Phases

### Phase 1: Core Flag + Config System

1. Add `IS_CODEFLUFF` constant
2. Update `build-binary.ts` to pass through `CODEFLUFF_MODE`
3. Create config module with Zod schema and env interpolation
4. Create M:N model resolver
5. Create `codefluff/` directory with build and release infrastructure

### Phase 2: Model Routing

6. Add BYOK direct provider routing in SDK
7. Override model resolution for codefluff
8. Add env support for codefluff BYOK keys

### Phase 3: Strip Server Dependencies

9. Skip login requirement
10. Remove server-dependent UI components
11. Filter slash commands and command registry

### Phase 4: Branding

12. Update all branding (title, logo, name, description, header)
13. Simplify help menu

### Phase 5: Mode Support

14. (Planned) Enable all cost modes as distinct user-facing modes
15. (Planned) Update chat-store and input-modes

### Phase 6: Testing

16. Add smoke tests
17. Manual QA of built binary
