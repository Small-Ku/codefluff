# Codefluff Spec

Codefluff is a local BYOK (Bring Your Own Key) variant of the Codebuff CLI, distributed as a separate npm package (`codefluff`). It reuses the entire `cli/` package but builds with a compile-time flag that routes all model calls directly to providers using user-configured API keys, with a configurable M:N mapping from providers/models to modes/operations.

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

```json
{
  "keys": {
    "openrouter": "${OPENROUTER_API_KEY}",
    "anthropic": "${ANTHROPIC_API_KEY}",
    "openai": "${OPENAI_API_KEY}",
    "google": "${GOOGLE_API_KEY}"
  },
  "mapping": {
    "free": {
      "agent": "google/gemini-2.5-flash-lite",
      "file-requests": "google/gemini-2.5-flash-lite",
      "check-new-files": "google/gemini-2.5-flash-lite"
    },
    "normal": {
      "agent": "anthropic/claude-sonnet-4",
      "file-requests": "anthropic/claude-3.5-haiku",
      "check-new-files": "anthropic/claude-sonnet-4"
    },
    "max": {
      "agent": "anthropic/claude-sonnet-4.5",
      "file-requests": "anthropic/claude-sonnet-4",
      "check-new-files": "anthropic/claude-sonnet-4"
    },
    "experimental": {
      "agent": "google/gemini-2.5-pro",
      "file-requests": "anthropic/claude-sonnet-4",
      "check-new-files": "anthropic/claude-sonnet-4"
    },
    "ask": {
      "agent": "google/gemini-2.5-pro",
      "file-requests": "anthropic/claude-3.5-haiku",
      "check-new-files": "anthropic/claude-sonnet-4"
    }
  },
  "defaultMode": "normal"
}
```

### Schema Rules

- `keys`: Provider → API key mapping. Supports `${ENV_VAR}` interpolation.
- `mapping`: CostMode → Operation → Model mapping. All 5 cost modes supported.
- `defaultMode`: One of `free`, `normal`, `max`, `experimental`, `ask`.
- Config is empty by default — user must fill in everything.
- Missing keys produce clear error messages on first use.

---

## 3. Model Routing

When `IS_CODEFLUFF`:

1. Model resolution reads from user config's `mapping[mode][operation]`
2. All model calls go directly to providers using configured BYOK keys
3. No Codebuff backend involvement for inference
4. Each provider (OpenRouter, Anthropic, OpenAI, Google) gets its own direct model creation

### Provider Routing

- Models with `openrouter/` prefix → OpenRouter API
- Models with `anthropic/` prefix → Anthropic API
- Models with `openai/` prefix → OpenAI API
- Models with `google/` prefix → Google Vertex AI / Gemini API

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

Unlike Freebuff (FREE mode only), Codefluff supports ALL cost modes:

- `free`, `normal`, `max`, `experimental`, `ask`
- Mode switching fully functional
- `defaultMode` from config or CLI `--mode` flag
- Mode preferences saved locally

---

## 6. Server Dependencies Stripped

- No login required (unless user opts into optional chat history sync)
- No credits/subscription UI
- No ads
- No `/history` by default (local-only history available)
- No `/feedback`, `/login`, `/logout`, `/connect:claude`, `/connect:chatgpt`
- No `/subscribe`, `/usage`, `/credits`, `/buy-credits`
- No `/ads:*`, `/refer-friends`, `/publish`, `/review`, `/agent:gpt-5`

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

14. Enable all cost modes
15. Update chat-store and input-modes

### Phase 6: Testing

16. Add smoke tests
17. Manual QA of built binary
