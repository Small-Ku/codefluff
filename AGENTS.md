# Codefluff

This is the **Codefluff** branch — a personal BYOK fork of [Codebuff](https://codebuff.com) that can merge upstream changes.
BREAKING CHANGES are expected since we are a new fork that didn't release yet.

## What is Codefluff?

A local BYOK (Bring Your Own Key) variant of Codebuff: your API keys, your models, no server dependency for inference. See [codefluff/README.md](codefluff/README.md) for user-facing documentation.

## Repo Map

- `cli/` — TUI client and local UX
- `sdk/` — JS/TS SDK
- `web/` — Next.js app + API routes
- `packages/agent-runtime/` — agent runtime + tool handling
- `common/` — shared types, tools, schemas
- `agents/` — main agents
- `.agents/` — local agent templates
- `codefluff/` — BYOK CLI package and build config

## Conventions

- Never force-push `main`
- Run interactive git commands in tmux
- Maintain merge compatibility with upstream

## Docs

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning. Always read the relevant docs below before implementing changes.

- `codefluff/SPEC.md` — Codefluff implementation details
- `docs/architecture.md` — Package dependency graph, per-package details, architectural patterns
- `docs/request-flow.md` — Full request lifecycle from CLI through server and back
- `docs/error-schema.md` — Server error response formats and client-side handling
- `docs/development.md` — Dev setup, worktrees, logs, package management, DB migrations
- `docs/testing.md` — DI over mocking, tmux CLI testing
- `docs/environment-variables.md` — Env var rules, DI helpers, loading order
- `docs/agents-and-tools.md` — Agent system, shell shims, tool definitions
- `docs/patterns/handle-steps-generators.md` — handleSteps generator patterns and spawn_agents tool calls
- `docs/patterns/discover-before-implement.md`
