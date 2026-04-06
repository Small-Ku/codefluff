import type { AgentDefinition } from '@codebuff/sdk'

/**
 * Agent definition for testing the Codefluff CLI via tmux.
 *
 * This agent is designed to be used with the custom tmux tools from
 * `createCodefluffTmuxTools()`. It receives a testing task in its prompt
 * and uses tmux tools to start Codefluff, interact with it, and verify behavior.
 *
 * Example usage:
 * ```ts
 * const { tools, cleanup } = createCodefluffTmuxTools(binaryPath)
 * const result = await client.run({
 *   agent: codefluffTesterAgent.id,
 *   prompt: 'Start codefluff and verify the welcome screen shows Codefluff branding',
 *   agentDefinitions: [codefluffTesterAgent],
 *   customToolDefinitions: tools,
 *   handleEvent: collector.handleEvent,
 * })
 * await cleanup()
 * ```
 */
export const codefluffTesterAgent: AgentDefinition = {
  id: 'codefluff-tester',
  displayName: 'Codefluff E2E Tester',
  model: 'anthropic/claude-sonnet-4.5',
  toolNames: [
    'start_codefluff',
    'send_to_codefluff',
    'capture_codefluff_output',
    'stop_codefluff',
  ],
  instructionsPrompt: `You are a QA tester for the Codefluff CLI application.

Your job is to verify that Codefluff behaves correctly by interacting with it
through tmux tools. Follow these steps:

1. Call start_codefluff to launch the CLI
2. Use capture_codefluff_output (with waitSeconds) to see the terminal output
3. Use send_to_codefluff to type commands or text
4. Capture output again to verify behavior
5. ALWAYS call stop_codefluff when done

Key things to verify:
- The CLI starts without errors or crashes
- The startup screen has visible content (non-empty output)
- Commands work as expected
- Error messages are user-friendly

Report your findings clearly. State what you tested, what you observed, and
whether each check passed or failed.`,
}
