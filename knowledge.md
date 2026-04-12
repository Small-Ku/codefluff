# Project knowledge (Codefluff)

This repo is a fork of Codebuff focused on **Codefluff**, a **local BYOK (Bring Your Own Key)** multi-agent coding assistant.

Codefluff runs standalone: your prompts and code go directly from your machine to your chosen model providers (Anthropic/OpenAI/Google/OpenRouter/etc). No Codebuff server required for inference.

## Quickstart (using Codefluff)

### Install + configure (end-user)

- Install the published CLI:

```bash
npm install -g codefluff
```

- Create your config at:
  `~/.config/codefluff/config.json`

Note (Windows): `~` depends on shell/WSL. If Codefluff isn’t picking up your config, see `WINDOWS.md`.

Minimal example (use env vars so keys don’t end up in plaintext):

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
      "file-picker": "google/gemini-2.5-flash-lite",
      "editor": "anthropic/claude-opus-4"
    },
    "max": {
      "base": "anthropic/claude-opus-4"
    },
    "free": {
      "base": "google/gemini-2.5-flash-lite"
    }
  },
  "defaultMode": "normal"
}
```

Custom provider example (OpenAI-compatible):

```json
{
  "keys": {
    "your-own-provider": {
      "key": "${YOUR_PROVIDER_KEY}",
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

Run:

```bash
cd your-project
codefluff
```

### CLI usage (common)

```bash
codefluff                    # starts in defaultMode
codefluff --mode max         # start in max mode
codefluff "Fix the bug"      # run with a one-shot prompt
```

Valid `--mode` values are primarily: `free|normal|max|plan`.
`experimental` and `ask` exist in config, but currently behave like `normal` unless the CLI is extended.

### Web search providers (optional)

Codefluff can do web research via configurable providers. Providers are tried in order, first successful result wins (automatic fallback).

```json
{
  "searchProviders": {
    "linkup": "${LINKUP_API_KEY}",
    "langsearch": "${LANGSEARCH_API_KEY}",
    "searxng": "https://searx.example.org",
    "searx-space": "enabled"
  }
}
```

## Repo dev (working on Codefluff itself)

### Prereqs

- **Bun**: `bun@1.3.11` (repo package manager)
- Windows: see `WINDOWS.md` for bash/Git Bash/WSL gotchas.

### Install

```bash
bun install
```

### Run the CLI from source

From repo root:

```bash
bun run dev
# runs: bun --cwd cli dev
```

Directly:

```bash
bun --cwd cli dev
```

### Common scripts (repo root)

```bash
bun run typecheck
bun run test
bun run format
```

Note: root `typecheck` runs `bun scripts/check-env-architecture.ts` before workspace typechecks.

## CLI testing (important)

CLI tests live under `cli/src/__tests__/`.

Run:

```bash
bun --cwd cli test
# or
cd cli && bun test
```

Notes:

- Integration/E2E tests may require **tmux** (on Windows, use WSL for tmux).
- Integration/E2E suites auto-check for tmux and skip gracefully if it’s missing.
- E2E tests require the SDK to be built first:
  `bun --cwd sdk run build`

## Architecture (where code lives)

### Workspaces

- `codefluff/`: end-user docs for the BYOK fork
- `cli/`: terminal UI + command routing (the Codefluff/Codebuff CLI implementation)
- `sdk/`: provider integrations and model routing utilities
- `agents/`, `.agents/`: agent definitions and customization infra
- `web/`: Codebuff website/app (not required for Codefluff inference, but still part of the monorepo)
- `packages/*`, `common/`, `scripts/`, `evals/`, `freebuff/`: supporting packages and tooling

## Conventions / gotchas

- Use **Bun** for repo development. Prefer `bun --cwd <workspace> <script>`.
- Codefluff config supports `${ENV_VAR}` interpolation.
  - String fields can use env interpolation.
  - Numeric fields must be numeric literals (not `${ENV_VAR}` strings).
- Tool availability in standalone Codefluff:
  - `web_search` works (configure via `searchProviders`).
  - `read_docs` is not available (server-backed).

## Where to look first

- Codefluff docs: `codefluff/README.md`
- CLI scripts: `cli/package.json`
- CLI entry: `cli/src/index.tsx`
- CLI tests docs: `cli/src/__tests__/README.md`
