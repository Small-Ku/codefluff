# Codefluff

Local BYOK (Bring Your Own Key) coding agent. Configure your own API keys and model mappings — no server dependency for inference.

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
    "openrouter": "sk-or-your-key-here"
  },
  "mapping": {
    "normal": {
      "agent": "anthropic/claude-sonnet-4",
      "file-requests": "anthropic/claude-3.5-haiku",
      "check-new-files": "anthropic/claude-sonnet-4"
    }
  },
  "defaultMode": "normal"
}
```

You can also reference environment variables:

```json
{
  "keys": {
    "openrouter": "${OPENROUTER_API_KEY}",
    "anthropic": "${ANTHROPIC_API_KEY}"
  }
}
```

### 3. Run

```bash
cd my-project
codefluff
```

## Configuration

### Keys

Supported providers:

- `openrouter` — OpenRouter API key
- `anthropic` — Anthropic API key
- `openai` — OpenAI API key
- `google` — Google API key

### Mapping

The `mapping` object defines which model to use for each cost mode and operation:

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

Supported cost modes: `free`, `normal`, `max`, `experimental`, `ask`

Supported operations: `agent`, `file-requests`, `check-new-files`

Model IDs use the OpenRouter format: `provider/model-name` (e.g., `anthropic/claude-sonnet-4`, `google/gemini-2.5-pro`, `openai/gpt-4o`).

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

## License

See the Codebuff repository for license information.
